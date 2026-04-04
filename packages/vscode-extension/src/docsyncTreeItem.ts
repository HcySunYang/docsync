import * as vscode from "vscode";
import { formatFileSize } from "docsync-cli";
import type { TreeEntry } from "docsync-cli";

export class DocsyncTreeItem extends vscode.TreeItem {
  constructor(
    public readonly remotePath: string,
    public readonly entry: TreeEntry | null,
    public readonly isFolder: boolean,
    public readonly children: DocsyncTreeItem[] = [],
  ) {
    super(
      remotePath.split("/").pop() || remotePath,
      isFolder
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    );

    if (isFolder) {
      this.contextValue = "folder";
      this.iconPath = new vscode.ThemeIcon("folder");
    } else {
      this.contextValue = "file";
      this.iconPath = vscode.ThemeIcon.File;
      if (entry) {
        this.description = formatFileSize(entry.size);
      }
      // Click to view file
      this.command = {
        command: "docsync.viewFile",
        title: "View File",
        arguments: [this],
      };
    }

    this.tooltip = remotePath;
  }
}
