# docsync — Architecture

## Overview

docsync is a TypeScript CLI tool that syncs markdown documentation across machines using a GitHub repo as the storage backend. It was built to solve a specific pain point: when you generate docs with AI tools (Claude Code, GitHub Copilot, etc.) across multiple machines, getting those docs from one machine to another shouldn't require manual git workflows.

## Core Design: Push-From-Anywhere

Unlike traditional sync tools that require a dedicated folder, docsync decouples **where you create docs** from **where they're stored**:

```
Machine A (any directory)            GitHub Repo              Machine B
  ~/projects/foo/design.md  ──push──▶  guides/setup/    ◀──pull──  ~/.docsync/docs/
  ~/work/bar/api.md         ──push──▶  references/      ◀──pull──  ~/.docsync/docs/
  /tmp/notes.md             ──push──▶  notes/           ◀──pull──  ~/.docsync/docs/
```

- **Push** reads a file from wherever it lives, shows an interactive folder picker, and uploads to the chosen location in the GitHub repo. The source file stays in place.
- **Pull** downloads everything from the GitHub repo into `~/.docsync/docs/`, preserving the folder structure.
- **Open** opens the local docs folder in the OS file manager.

## System Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        docsync CLI                           │
│                      (Commander.js)                          │
├──────────┬──────────┬──────────┬─────────────────────────────┤
│   init   │   push   │   pull   │   open                     │
├──────────┴──────────┴──────────┴─────────────────────────────┤
│                      Sync Engine                             │
│              (retry logic, commit messages)                   │
├──────────────────────────────────────────────────────────────┤
│                 Transport Abstraction (ITransport)            │
│         ┌─────────────────┬─────────────────────┐            │
│         │  GitHub API      │   Git CLI            │            │
│         │  Transport       │   Transport          │            │
│         │  (Octokit)       │   (child_process +   │            │
│         │                  │    simple-git)        │            │
│         └────────┬─────────┴──────────┬──────────┘            │
│                  │                    │                        │
│            octokit/rest         git binary                    │
├──────────────────────────────────────────────────────────────┤
│                    Config Manager                             │
│              (Zod schema, token resolution)                   │
└──────────────────────────────────────────────────────────────┘
                           │
                           ▼
                     GitHub Repo
                  (storage backend)
```

## Key Components

### Commands (`src/commands/`)

| Command | File | Description |
|---------|------|-------------|
| `docsync init` | `init.ts` | Interactive setup wizard. Asks for repo, branch, machine name, and GitHub token. Verifies repo access via Octokit before saving config. |
| `docsync push <paths...>` | `push.ts` | Resolves file paths (supports files, globs, directories). Connects to remote, fetches folder list, shows interactive folder picker (`@inquirer/prompts` search), then pushes via SyncEngine. |
| `docsync pull` | `pull.ts` | Downloads all files from the remote repo. Shows a tree view with status (new/updated/unchanged). Skips unchanged files by comparing content. |
| `docsync open [subfolder]` | `open.ts` | Opens `~/.docsync/docs/` in the OS file manager. Cross-platform: `open` (macOS), `xdg-open` (Linux), `explorer` (Windows). |

### Transport Layer (`src/transport/`)

The transport abstraction (`ITransport` interface) decouples commands from the GitHub communication mechanism:

**GitHub API Transport** (`github-api.transport.ts`)
- Uses `@octokit/rest` (Octokit)
- Single-file operations use the Contents API
- Multi-file pushes use the Git Data API for atomic commits: create blobs → create tree → create commit → update ref
- Works without git installed — ideal for restricted cloud VMs

**Git CLI Transport** (`git-cli.transport.ts`)
- Maintains a shallow clone at `~/.docsync/.gitrepo/`
- Uses `child_process.exec` for clone operations (more reliable timeout than simple-git)
- Uses `simple-git` for subsequent operations (add, commit, push, fetch, pull)
- Auto-detects proxy from environment (`https_proxy`, `http_proxy`, `all_proxy`) and passes as `-c` flags
- 120-second timeout on network operations
- Cleans up stale `.gitrepo` directories from failed previous attempts

**Transport Factory** (`factory.ts`)
- `auto` mode (default): uses Git CLI if git is installed, falls back to GitHub API
- Can be overridden via config: `"transport": "api"` or `"transport": "git"`

### Config System (`src/config/`)

Config lives at `~/.docsync/config.json` and is validated with Zod:

```json
{
  "version": 1,
  "repo": { "owner": "user", "name": "my-docs", "branch": "main" },
  "auth": { "token": null, "tokenCommand": null },
  "local": {
    "docsDir": "~/.docsync/docs",
    "machineName": "auto-detected",
    "filePatterns": ["**/*.md", "**/*.mdx"]
  },
  "transport": "auto"
}
```

**Token resolution chain** (in priority order):
1. `config.auth.token` — explicit PAT in config
2. `$GITHUB_TOKEN` — environment variable
3. `config.auth.tokenCommand` — shell command (e.g., `gh auth token`)

### Sync Engine (`src/sync/engine.ts`)

Orchestrates push/pull operations:
- **Push**: normalizes destination folder, builds file payloads, generates commit messages (includes machine name), calls `transport.putFiles()` with retry logic
- **Pull**: fetches full tree via `transport.getTree()`, downloads all blob entries
- **Retry**: exponential backoff (1s → 2s → 4s) for transient errors (ECONNRESET, ETIMEDOUT, 502, 503, rate limit)

## Data Flow

### Push Flow

```
1. User runs: docsync push ./design.md
2. ConfigManager loads ~/.docsync/config.json
3. resolveFiles() expands paths/globs → list of absolute file paths
4. Read file contents from disk
5. TransportFactory creates appropriate transport (Git CLI or API)
6. transport.connect() → clone/pull repo (Git CLI) or verify auth (API)
7. transport.listFolders() → fetch remote folder structure
8. Interactive folder picker (search prompt with existing folders + create new)
9. SyncEngine.push() → transport.putFiles() with retry
10. Display results (pushed files with paths and sizes)
```

### Pull Flow

```
1. User runs: docsync pull
2. ConfigManager loads config
3. TransportFactory creates transport
4. transport.connect()
5. SyncEngine.pullAll() → transport.getTree() + transport.getFile() for each blob
6. For each file: compare with local → write if new/changed, skip if unchanged
7. Display tree view with status indicators
```

## Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Language | TypeScript (ESM, Node ≥ 20) | Type safety, modern module system |
| CLI framework | Commander.js | Lightweight, clean subcommand API |
| Interactive prompts | @inquirer/prompts | Search/autocomplete for folder picker |
| GitHub API | @octokit/rest | Official GitHub SDK, Git Data API for batch commits |
| Git operations | simple-git + child_process | simple-git for local ops, exec for reliable clone with proxy |
| Config validation | Zod | Runtime validation + TypeScript type inference |
| Build | tsup | Fast ESM bundler, zero-config |
| Test | vitest | Native ESM/TS, fast, Jest-compatible |
| Output | chalk + ora | Colored logs + spinners |

## File Structure

```
docsync/
├── bin/docsync.ts                         # CLI entry point
├── src/
│   ├── cli.ts                             # Commander program definition
│   ├── commands/
│   │   ├── init.ts                        # docsync init
│   │   ├── push.ts                        # docsync push (with folder picker)
│   │   ├── pull.ts                        # docsync pull (with tree view)
│   │   └── open.ts                        # docsync open (cross-platform)
│   ├── transport/
│   │   ├── interface.ts                   # ITransport interface
│   │   ├── github-api.transport.ts        # Octokit + Git Data API
│   │   ├── git-cli.transport.ts           # exec + simple-git + proxy support
│   │   └── factory.ts                     # Auto-detect and instantiate
│   ├── config/
│   │   ├── schema.ts                      # Zod schema
│   │   ├── manager.ts                     # Load/save/token resolution
│   │   └── defaults.ts                    # Default values
│   ├── sync/
│   │   ├── engine.ts                      # Push/pull with retry
│   │   └── conflict.ts                    # Conflict resolution (extensible)
│   └── utils/                             # Logger, spinner, files, machine, prompt
├── test/unit/                             # 97 unit tests (vitest)
├── package.json
├── tsconfig.json
└── tsup.config.ts
```
