---
name: publish-extension
description: Build, package, and publish the DocSync VSCode extension to the Marketplace. Bumps version, publishes, commits, and pushes.
---

# Publish DocSync VSCode Extension

## What this skill does

Publishes the DocSync VSCode extension (`packages/vscode-extension`) to the Visual Studio Code Marketplace.

## Steps

1. **Ask for the Azure PAT** — Ask the user for their Azure DevOps Personal Access Token (with Marketplace > Manage scope). Do NOT proceed without it.

2. **Ask for version bump type** — Ask: "patch (0.1.1 → 0.1.2), minor (0.1.1 → 0.2.0), or major (0.1.1 → 1.0.0)?" Default to patch.

3. **Bump the version** — Edit `packages/vscode-extension/package.json` to update the `version` field according to the bump type.

4. **Build and publish** — Run from the repo root:
   ```bash
   export https_proxy=http://127.0.0.1:7897
   export http_proxy=http://127.0.0.1:7897
   node packages/vscode-extension/publish.js <PAT>
   ```
   Note: The proxy is needed to reach the Marketplace. The publish script builds everything, packages the VSIX, and publishes.

5. **Commit and push** — Stage the version bump and any other changes, commit with message like "Publish VSCode extension v0.X.Y", and push via proxy.

6. **Report success** — Show the Marketplace URL: `https://marketplace.visualstudio.com/items?itemName=HcySunYang.docsync-vscode`

## Important notes

- The publish script is at `packages/vscode-extension/publish.js`
- Publisher ID is `HcySunYang`
- Extension ID is `docsync-vscode`
- The proxy (`http://127.0.0.1:7897`) must be set for both the publish and git push commands
- Never commit or log the PAT token
