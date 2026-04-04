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
- **List** shows a tree view of all remote docs with file sizes.
- **Cat** displays a remote file's content in the terminal (pipeable).
- **Rm** removes files from the remote repo with confirmation.
- **Mv** moves/renames files within the remote repo (atomic, single commit).

All commands that accept file/folder arguments show **interactive pickers when arguments are omitted** — consistent UX across the tool.

## System Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        docsync CLI                           │
│                      (Commander.js)                          │
├──────────┬──────────┬──────────┬──────────┬─────┬─────┬─────┬─────┤
│   init   │   push   │   pull   │   open   │list │ cat │ rm  │ mv  │
├──────────┴──────────┴──────────┴──────────┴─────┴─────┴─────┴─────┤
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
| `docsync push <paths...>` | `push.ts` | Resolves file paths (supports files, globs, directories). Connects to remote, shows interactive folder picker, then pushes via SyncEngine. |
| `docsync pull` | `pull.ts` | Downloads all files from the remote repo. Shows a tree view with status (new/updated/unchanged). Skips unchanged files by comparing content. |
| `docsync open [subfolder]` | `open.ts` | Opens `~/.docsync/docs/` in the OS file manager. Cross-platform: `open` (macOS), `xdg-open` (Linux), `explorer` (Windows). |
| `docsync list [path]` | `list.ts` | Lists remote files in a tree view with sizes. Optional path filter for subfolder. Alias: `docsync ls`. |
| `docsync cat [path]` | `cat.ts` | Displays a remote file's content. Interactive file picker when no path given. Output is pipeable. |
| `docsync rm [paths...]` | `rm.ts` | Removes files from remote with confirmation (default: No). Interactive multi-select picker when no paths given. |
| `docsync mv [src] [dest]` | `mv.ts` | Atomic move/rename within the remote repo. Interactive file picker (source) + folder picker (dest) when args omitted. |

### Transport Layer (`src/transport/`)

The transport abstraction (`ITransport` interface) decouples commands from the GitHub communication mechanism:

**GitHub API Transport** (`github-api.transport.ts`)
- Uses `@octokit/rest` (Octokit)
- Single-file operations use the Contents API
- Multi-file pushes use the Git Data API for atomic commits: create blobs → create tree → create commit → update ref
- Atomic moves via Git Data API: reuses source blob SHA in a new tree entry (zero re-upload), deletes source — single commit
- Works without git installed — ideal for restricted cloud VMs

**Git CLI Transport** (`git-cli.transport.ts`)
- Maintains a shallow clone at `~/.docsync/.gitrepo/`
- Uses `child_process.exec` for clone operations (more reliable timeout than simple-git)
- Uses `simple-git` for subsequent operations (add, commit, push, fetch, pull)
- Atomic moves via native `git mv` command
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

Orchestrates all document operations:
- **Push**: normalizes destination folder, builds file payloads, generates commit messages (includes machine name), calls `transport.putFiles()` with retry logic
- **Pull**: fetches full tree via `transport.getTree()`, downloads all blob entries
- **Cat**: fetches a single file's content via `transport.getFile()`
- **Remove**: fetches SHA for each file, then deletes via `transport.deleteFile()` — per-file error handling
- **Move**: delegates to `transport.moveFile()` for atomic rename in a single commit
- **Retry**: exponential backoff (1s → 2s → 4s) for transient errors (ECONNRESET, ETIMEDOUT, 502, 503, rate limit)

### Shared Utilities (`src/utils/`)

- **`tree.ts`** — `printTree()`: renders a tree view of files with optional status indicators. Used by `pull` (with status) and `list` (without status).
- **`file-picker.ts`** — Interactive pickers shared across commands:
  - `pickFile()` — single-select search/filter (used by `cat`, `mv`)
  - `pickFiles()` — multi-select checkbox (used by `rm`)
  - `pickFolder()` — folder search/filter with create-new option (used by `push`, `mv`)
- **`errors.ts`** — `formatError()`: consistent error messages for GitHub API errors (auth, 404, network, rate limit)
- **`files.ts`** — `resolveFiles()`, `formatFileSize()`
- **`logger.ts`** — chalk-based structured logging
- **`spinner.ts`** — ora spinner wrapper

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
| Monorepo | pnpm workspaces | Fast, disk-efficient, native workspace support |
| Language | TypeScript (ESM, Node ≥ 20) | Type safety, modern module system |
| CLI framework | Commander.js | Lightweight, clean subcommand API |
| Interactive prompts | @inquirer/prompts | Search/autocomplete for folder picker |
| GitHub API | @octokit/rest | Official GitHub SDK, Git Data API for batch commits |
| Git operations | simple-git + child_process | simple-git for local ops, exec for reliable clone with proxy |
| Config validation | Zod | Runtime validation + TypeScript type inference |
| Build | tsup | Fast ESM bundler, zero-config |
| Test | vitest | Native ESM/TS, fast, Jest-compatible |
| Output | chalk + ora | Colored logs + spinners |

## Project Structure

```
docsync/                                    # pnpm workspace root
├── packages/
│   └── cli/                               # CLI package (docsync-cli)
│       ├── bin/docsync.ts                 # CLI entry point
│       ├── src/
│       │   ├── cli.ts                     # Commander program definition (8 commands)
│       │   ├── commands/
│       │   │   ├── init.ts                # docsync init
│       │   │   ├── push.ts                # docsync push (with folder picker)
│       │   │   ├── pull.ts                # docsync pull (with tree view)
│       │   │   ├── open.ts                # docsync open (cross-platform)
│       │   │   ├── list.ts                # docsync list / ls (tree view)
│       │   │   ├── cat.ts                 # docsync cat (with file picker)
│       │   │   ├── rm.ts                  # docsync rm (with multi-select picker)
│       │   │   └── mv.ts                  # docsync mv (with file + folder picker)
│       │   ├── transport/
│       │   │   ├── interface.ts           # ITransport interface (incl. moveFile)
│       │   │   ├── github-api.transport.ts
│       │   │   ├── git-cli.transport.ts
│       │   │   └── factory.ts
│       │   ├── config/                    # Zod schema, manager, defaults
│       │   ├── sync/                      # Engine (with retry) + conflict resolution
│       │   └── utils/                     # tree, file-picker, errors, files, logger, etc.
│       ├── test/unit/                     # 105 unit tests (vitest)
│       ├── package.json
│       ├── tsconfig.json                  # extends ../../tsconfig.base.json
│       └── tsup.config.ts
├── pnpm-workspace.yaml                    # workspace definition
├── package.json                           # workspace root (private)
├── tsconfig.base.json                     # shared TypeScript config
├── .npmrc
├── README.md
└── ARCHITECTURE.md
```
