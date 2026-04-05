# DocSync

Sync docs across machines using a GitHub repo as the storage backend. Browse, push, pull, move, and delete docs right from the VSCode Explorer sidebar.

## Features

- **DOCSYNC tree view** in the Explorer sidebar — browse your remote docs with folder structure and file sizes
- **Click to view** — open any remote doc in an editor tab
- **Push files** — right-click a local `.md` file → "Push to DocSync", or drag files into the DOCSYNC tree
- **Move files** — drag and drop within the DOCSYNC tree, or right-click → "Move to..."
- **Delete files/folders** — right-click → "Delete" with confirmation
- **New folder** — create folders from the toolbar or right-click menu
- **Drag to Copilot Chat** — drag docs from the DOCSYNC tree directly into GitHub Copilot Chat to add them as context
- **Sync on load** — files are synced to disk automatically so they're always ready

## Getting Started

1. Install the extension
2. Open the Command Palette (`Cmd+Shift+P`) → "DocSync: Initialize"
3. Enter your GitHub repo (e.g. `myuser/my-docs`), branch, and a Personal Access Token
4. The DOCSYNC section appears in the Explorer sidebar with your docs

## How It Works

DocSync uses a GitHub repo as central storage. Push docs from any machine, pull them on any other machine. Version history comes for free from git.

The extension uses the [docsync CLI](https://github.com/HcySunYang/docsync) under the hood, supporting both GitHub REST API and git CLI transports with automatic proxy detection.

## Configuration

Config is stored at `~/.docsync/config.json`. You can also set up via the CLI:

```bash
npm install -g docsync-cli
docsync init
```

## License

MIT
