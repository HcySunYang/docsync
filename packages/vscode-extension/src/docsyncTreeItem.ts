import * as vscode from "vscode";
import { formatFileSize } from "docsync-cli";
import type { TreeEntry } from "docsync-cli";

export class DocsyncTreeItem extends vscode.TreeItem {
  constructor(
    public readonly remotePath: string,
    public readonly entry: TreeEntry | null,
    public readonly isFolder: boolean,
    public readonly children: DocsyncTreeItem[] = [],
    localDocsDir?: string,
  ) {
    super(
      remotePath.split("/").pop() || remotePath,
      isFolder
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    );

    // Explicitly set label to prevent resourceUri from overriding it
    this.label = remotePath.split("/").pop() || remotePath;
    this.tooltip = remotePath;

    // Set resourceUri for all items — required by VSCode for text/uri-list
    // drag support (enables drag to Copilot Chat, editors, etc.)
    if (localDocsDir) {
      this.resourceUri = vscode.Uri.file(`${localDocsDir}/${remotePath}`);
    }

    if (isFolder) {
      this.contextValue = "folder";
      this.iconPath = new vscode.ThemeIcon("folder");
    } else {
      this.contextValue = "file";
      this.iconPath = vscode.ThemeIcon.File;
      if (entry) {
        this.description = formatFileSize(entry.size);
      }
      this.command = {
        command: "docsync.viewFile",
        title: "View File",
        arguments: [this],
      };
    }
  }
}
