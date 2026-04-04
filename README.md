# docsync

Generate docs anywhere, push from anywhere, pull on any machine — no manual copying, no git commands. Just `docsync push` and `docsync pull`.

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

## Troubleshooting

### Push/pull hangs or times out

If `docsync push` or `docsync pull` hangs, you likely need a proxy to reach GitHub. docsync auto-detects proxy settings from your environment variables (`https_proxy`, `http_proxy`, `all_proxy`), but they must be set **before** running docsync.

```bash
# Set your proxy first
export https_proxy=http://127.0.0.1:<port>
export http_proxy=http://127.0.0.1:<port>

# Then run docsync
docsync push ./design.md
```

docsync will automatically pass proxy settings to both the GitHub API client and the git CLI transport. Network operations timeout after 120 seconds — if you see a timeout error, check your proxy/internet connection.

### Repository not found (404)

Double-check the `owner/repo` you entered during `docsync init`. A common mistake is typos in the repo name. Re-run `docsync init` to fix it.

Also make sure your GitHub token (PAT) has the `repo` scope, which is required to access private repositories.

### Authentication failed

Your GitHub token may be expired or have insufficient permissions. Re-run `docsync init` to set a new token.

## License

MIT
