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

    if (isFolder) {
      this.contextValue = "folder";
      this.iconPath = new vscode.ThemeIcon("folder");
    } else {
      this.contextValue = "file";
      this.iconPath = vscode.ThemeIcon.File;
      if (entry) {
        this.description = formatFileSize(entry.size);
      }
      // Set resourceUri to local file path — this enables VSCode's built-in
      // text/uri-list drag support (used by Copilot Chat, editors, etc.)
      if (localDocsDir) {
        this.resourceUri = vscode.Uri.file(
          `${localDocsDir}/${remotePath}`,
        );
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
