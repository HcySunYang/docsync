# docsync

A CLI tool that syncs markdown docs across machines using a GitHub repo as the storage backend.

## Why

I use Claude Code CLI, GitHub Copilot, and other AI tools to generate markdown documentation across multiple machines — laptops, desktops, cloud VMs. The problem is getting those docs from one machine to another. I was manually copying files into a dedicated git repo, running `git push`, then `git pull` on every other machine. It was painful and broke my flow.

docsync makes it simple: push a doc from wherever it lives, pull it on any other machine.

## Install

```bash
npm install -g docsync-cli
```

Or run from source:

```bash
git clone https://github.com/HcySunYang/docsync.git
cd docsync
npm install
npm run build
```

## Setup

```bash
docsync init
```

This walks you through connecting to your GitHub docs repo and setting up authentication.

## Usage

### Push a doc

```bash
docsync push ./design.md
```

An interactive folder picker shows your existing repo folders. Pick one or type a new path (e.g. `guides/setup/`) — it gets created automatically.

```
? Where to save? (arrow keys to browse, type to filter or create new folder)
  📂 / (repo root)
  📂 guides/
  📂 guides/setup/
  📂 notes/
  📝 Create: my-new-folder/

✅ Pushed design.md → guides/setup/design.md (4.5 KB)
```

You can also push multiple files or an entire directory:

```bash
docsync push ./docs/*.md
docsync push .
```

### Pull docs

```bash
docsync pull
```

Downloads everything from your GitHub repo to `~/.docsync/docs/`, preserving the folder structure:

```
📂 guides/
   📂 setup/
      design.md          4.5 KB   ✅ new
   deployment.md         2.1 KB   ✅ updated
📂 notes/
   meeting.md            1.1 KB   ── unchanged

✅ Pulled 2 files (6.6 KB) to ~/.docsync/docs/
```

### Open docs folder

```bash
docsync open
docsync open guides/
```

Opens your local docs folder in Finder / file manager.

## How it works

- Uses a **GitHub repo** as the central storage — version history comes for free
- **Dual transport**: GitHub REST API (works without git installed) or git CLI (faster, auto-detected)
- **Push from anywhere** — files don't need to be in a special folder
- **Token resolution**: config file → `$GITHUB_TOKEN` → `gh auth token`

## License

MIT
