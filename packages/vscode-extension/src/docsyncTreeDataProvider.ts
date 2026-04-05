import * as vscode from "vscode";
import * as path from "node:path";
import type { DocsyncService } from "./docsyncService.js";
import { DocsyncTreeItem } from "./docsyncTreeItem.js";
import { expandHome, type TreeEntry } from "docsync-cli";

const DOCSYNC_MIME_TYPE = "application/vnd.code.tree.docsyncExplorer";

export class DocsyncTreeDataProvider
  implements
    vscode.TreeDataProvider<DocsyncTreeItem>,
    vscode.TreeDragAndDropController<DocsyncTreeItem>
{
  // --- Drag and Drop ---
  // text/uri-list in dragMimeTypes enables VSCode's built-in file drag
  // (uses resourceUri from TreeItem) for Copilot Chat, editors, etc.
  readonly dropMimeTypes = [DOCSYNC_MIME_TYPE, "text/uri-list"];
  readonly dragMimeTypes = [DOCSYNC_MIME_TYPE, "text/uri-list"];

  private _onDidChangeTreeData = new vscode.EventEmitter<
    DocsyncTreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private treeCache: DocsyncTreeItem[] | null = null;

  constructor(private service: DocsyncService) {}

  refresh(): void {
    this.treeCache = null;
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: DocsyncTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(
    element?: DocsyncTreeItem,
  ): Promise<DocsyncTreeItem[]> {
    if (!this.service.isInitialized()) {
      return [];
    }

    if (element) {
      return element.children;
    }

    if (this.treeCache) {
      return this.treeCache;
    }

    try {
      const entries = await this.service.getTree();

      // Get local docs dir for resourceUri on tree items
      const config = this.service.getConfig();
      const localDocsDir = config ? expandHome(config.local.docsDir) : undefined;

      this.treeCache = this.buildTree(entries, localDocsDir);

      // Pull files to disk in the background so they exist for drag-and-drop
      this.service.pullAll().catch(() => {});

      return this.treeCache;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      vscode.window.showErrorMessage(
        `DocSync: Failed to load tree - ${message}`,
      );
      return [];
    }
  }

  // --- Drag and Drop handlers ---

  public async handleDrag(
    source: readonly DocsyncTreeItem[],
    dataTransfer: vscode.DataTransfer,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    // Only allow dragging files, not folders
    const files = source.filter((item) => !item.isFolder);
    if (files.length === 0) return;

    // Set internal MIME type for moves within the tree
    const paths = files.map((f) => f.remotePath);
    dataTransfer.set(
      DOCSYNC_MIME_TYPE,
      new vscode.DataTransferItem(paths),
    );
  }

  public async handleDrop(
    target: DocsyncTreeItem | undefined,
    dataTransfer: vscode.DataTransfer,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    // 1. Handle internal drag (move within DOCSYNC tree)
    const internalItems = dataTransfer.get(DOCSYNC_MIME_TYPE);
    if (internalItems) {
      const rawValue = internalItems.value;
      // Value could be an array of paths (strings) or serialized data
      let paths: string[];
      if (Array.isArray(rawValue)) {
        paths = rawValue.filter((v): v is string => typeof v === "string");
        if (paths.length === 0) {
          // Might be array of objects with remotePath
          paths = rawValue
            .map((v: any) => v?.remotePath)
            .filter((v): v is string => typeof v === "string");
        }
      } else {
        return;
      }

      if (paths.length === 0) return;

      // Determine destination folder
      let destFolder: string;
      if (!target) {
        destFolder = "/";
      } else if (target.isFolder) {
        destFolder = target.remotePath + "/";
      } else {
        // Dropped on a file — use its parent folder
        const parts = target.remotePath.split("/");
        parts.pop();
        destFolder = parts.length > 0 ? parts.join("/") + "/" : "/";
      }

      for (const sourcePath of paths) {
        const fileName = path.basename(sourcePath);
        const folder =
          destFolder === "/" ? "" : destFolder.replace(/^\//, "");
        const destPath = folder ? `${folder}${fileName}` : fileName;

        if (destPath === sourcePath) continue;

        try {
          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: `DocSync: Moving ${fileName}...`,
            },
            async () => {
              await this.service.moveFile(sourcePath, destPath);
            },
          );

          vscode.window.showInformationMessage(
            `DocSync: Moved ${sourcePath} → ${destPath}`,
          );
        } catch (err: unknown) {
          const message =
            err instanceof Error ? err.message : "Unknown error";
          vscode.window.showErrorMessage(
            `DocSync move failed: ${message}`,
          );
        }
      }

      this.refresh();
      return;
    }

    // 2. Handle external drag (push from Explorer)
    const uriList = dataTransfer.get("text/uri-list");
    if (!uriList) return;

    const uriString = await uriList.asString();
    const uris = uriString
      .split("\n")
      .filter((s) => s.trim())
      .map((s) => vscode.Uri.parse(s.trim()));

    const mdFiles = uris.filter((uri) => {
      const ext = path.extname(uri.fsPath).toLowerCase();
      return ext === ".md" || ext === ".mdx";
    });

    if (mdFiles.length === 0) {
      vscode.window.showWarningMessage(
        "DocSync: Only .md and .mdx files can be pushed.",
      );
      return;
    }

    // Determine destination folder
    let destFolder = "/";
    if (target?.isFolder) {
      destFolder = target.remotePath + "/";
    } else if (target) {
      const parts = target.remotePath.split("/");
      parts.pop();
      destFolder = parts.length > 0 ? parts.join("/") + "/" : "/";
    }

    try {
      const filePaths = mdFiles.map((uri) => uri.fsPath);
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `DocSync: Pushing ${mdFiles.length} file${mdFiles.length > 1 ? "s" : ""}...`,
        },
        async () => {
          await this.service.pushFiles(filePaths, destFolder);
        },
      );

      this.refresh();
      vscode.window.showInformationMessage(
        `DocSync: Pushed ${mdFiles.length} file${mdFiles.length > 1 ? "s" : ""} to ${destFolder}`,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      vscode.window.showErrorMessage(`DocSync push failed: ${message}`);
    }
  }

  // --- Tree building ---

  private buildTree(entries: TreeEntry[], localDocsDir?: string): DocsyncTreeItem[] {
    interface TreeNode {
      name: string;
      path: string;
      entry: TreeEntry | null;
      children: Map<string, TreeNode>;
    }

    const root: TreeNode = {
      name: "",
      path: "",
      entry: null,
      children: new Map(),
    };

    // Filter out common non-doc files that shouldn't appear in the tree
    const hiddenFiles = [".gitignore", ".gitattributes", ".gitmodules", ".DS_Store", "Thumbs.db"];
    const hiddenPrefixes = [".git/"];
    const files = entries.filter(
      (e) =>
        e.type === "blob" &&
        !hiddenFiles.includes(path.basename(e.path)) &&
        !hiddenPrefixes.some((prefix) => e.path.startsWith(prefix)),
    );

    for (const file of files) {
      const parts = file.path.split("/");
      let current = root;

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isLast = i === parts.length - 1;
        const currentPath = parts.slice(0, i + 1).join("/");

        if (!current.children.has(part)) {
          current.children.set(part, {
            name: part,
            path: currentPath,
            entry: isLast ? file : null,
            children: new Map(),
          });
        }

        if (isLast) {
          current.children.get(part)!.entry = file;
        }

        current = current.children.get(part)!;
      }
    }

    function toTreeItems(node: TreeNode): DocsyncTreeItem[] {
      const items: DocsyncTreeItem[] = [];

      const sorted = [...node.children.entries()].sort(
        ([a, aNode], [b, bNode]) => {
          const aIsFolder = aNode.children.size > 0;
          const bIsFolder = bNode.children.size > 0;
          if (aIsFolder !== bIsFolder) return aIsFolder ? -1 : 1;
          return a.localeCompare(b);
        },
      );

      for (const [, child] of sorted) {
        const isFolder = child.children.size > 0;
        const childItems = isFolder ? toTreeItems(child) : [];

        items.push(
          new DocsyncTreeItem(
            child.path,
            child.entry,
            isFolder,
            childItems,
            localDocsDir,
          ),
        );
      }

      return items;
    }

    return toTreeItems(root);
  }
}
