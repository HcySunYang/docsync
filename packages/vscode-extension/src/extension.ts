import * as vscode from "vscode";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import { DocsyncService } from "./docsyncService.js";
import { DocsyncTreeDataProvider } from "./docsyncTreeDataProvider.js";
import { DocsyncTreeItem } from "./docsyncTreeItem.js";
import { expandHome, type DocsyncConfig } from "docsync-cli";

let service: DocsyncService;
let treeProvider: DocsyncTreeDataProvider;

export function activate(context: vscode.ExtensionContext): void {
  service = new DocsyncService();
  treeProvider = new DocsyncTreeDataProvider(service);

  // Register the tree view in the Explorer sidebar
  // IMPORTANT: same object is both treeDataProvider AND dragAndDropController
  const treeView = vscode.window.createTreeView("docsyncExplorer", {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
    canSelectMany: true,
    dragAndDropController: treeProvider,
  });

  // Register commands
  const initCmd = vscode.commands.registerCommand(
    "docsync.init",
    handleInit,
  );

  const refreshCmd = vscode.commands.registerCommand(
    "docsync.refresh",
    handleRefresh,
  );

  const pullAllCmd = vscode.commands.registerCommand(
    "docsync.pullAll",
    handlePullAll,
  );

  const viewFileCmd = vscode.commands.registerCommand(
    "docsync.viewFile",
    handleViewFile,
  );

  const pushFileCmd = vscode.commands.registerCommand(
    "docsync.pushFile",
    handlePushFile,
  );

  const deleteFileCmd = vscode.commands.registerCommand(
    "docsync.deleteFile",
    handleDeleteFile,
  );

  const moveFileCmd = vscode.commands.registerCommand(
    "docsync.moveFile",
    handleMoveFile,
  );

  context.subscriptions.push(
    treeView,
    initCmd,
    refreshCmd,
    pullAllCmd,
    viewFileCmd,
    pushFileCmd,
    deleteFileCmd,
    moveFileCmd,
  );

  // Auto-initialize if config exists (with progress)
  vscode.window.withProgress(
    {
      location: { viewId: "docsyncExplorer" },
      title: "Connecting...",
    },
    async () => {
      const ok = await service.initialize();
      if (ok) {
        treeProvider.refresh();
      }
    },
  );
}

export function deactivate(): void {
  if (service) {
    service.dispose();
  }
}

// --- Command Handlers ---

async function handleInit(): Promise<void> {
  try {
    // Prompt for repo
    const repoInput = await vscode.window.showInputBox({
      prompt: "GitHub repo (owner/repo)",
      placeHolder: "e.g. myuser/my-docs",
      validateInput: (value) => {
        const parts = value.split("/");
        if (parts.length !== 2 || !parts[0] || !parts[1]) {
          return "Please enter in the format: owner/repo";
        }
        return null;
      },
    });
    if (!repoInput) return;

    const [owner, name] = repoInput.split("/");

    // Prompt for branch
    const branch = await vscode.window.showInputBox({
      prompt: "Branch",
      value: "main",
    });
    if (branch === undefined) return;

    // Prompt for token
    const token = await vscode.window.showInputBox({
      prompt: "GitHub Personal Access Token",
      password: true,
      placeHolder: "ghp_...",
    });
    if (!token) return;

    // Machine name
    const machineName =
      os.hostname().replace(/\.local$/, "").toLowerCase();

    const config: DocsyncConfig = {
      version: 1,
      repo: { owner, name, branch: branch || "main" },
      auth: { token, tokenCommand: null },
      local: {
        docsDir: "~/.docsync/docs",
        machineName,
        filePatterns: ["**/*.md", "**/*.mdx"],
      },
      transport: "auto",
    };

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "DocSync: Initializing...",
      },
      async () => {
        await service.initWithConfig(config);
      },
    );

    treeProvider.refresh();
    vscode.window.showInformationMessage("DocSync initialized successfully!");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    vscode.window.showErrorMessage(`DocSync init failed: ${message}`);
  }
}

async function handleRefresh(): Promise<void> {
  if (!service.isInitialized()) {
    vscode.window.showWarningMessage(
      'DocSync is not initialized yet. Run "DocSync: Initialize" from the Command Palette.',
    );
    return;
  }

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "DocSync: Refreshing...",
      },
      async () => {
        await service.refresh();
      },
    );
    treeProvider.refresh();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    vscode.window.showErrorMessage(`DocSync refresh failed: ${message}`);
  }
}

async function handlePullAll(): Promise<void> {
  if (!service.isInitialized()) {
    vscode.window.showWarningMessage(
      'DocSync is not initialized yet. Run "DocSync: Initialize" from the Command Palette.',
    );
    return;
  }

  try {
    const count = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "DocSync: Pulling all files...",
      },
      async () => {
        return service.pullAll();
      },
    );

    const config = service.getConfig();
    const docsDir = config ? expandHome(config.local.docsDir) : "~/.docsync/docs";

    vscode.window.showInformationMessage(
      `DocSync: Pulled ${count} file${count > 1 ? "s" : ""} to ${docsDir}`,
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    vscode.window.showErrorMessage(`DocSync pull failed: ${message}`);
  }
}

async function handleViewFile(item?: DocsyncTreeItem): Promise<void> {
  if (!item || item.isFolder) return;

  try {
    // Download the file to the local docs directory so it exists on disk.
    // This allows Copilot Chat (and other tools) to pick it up from
    // open editor tabs, since they only recognize real file:// URIs.
    const config = service.getConfig();
    const docsDir = config
      ? expandHome(config.local.docsDir)
      : path.join(os.homedir(), ".docsync", "docs");

    const localPath = path.join(docsDir, item.remotePath);
    await fs.mkdir(path.dirname(localPath), { recursive: true });

    const content = await service.viewFile(item.remotePath);
    await fs.writeFile(localPath, content, "utf-8");

    const uri = vscode.Uri.file(localPath);
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc, { preview: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    vscode.window.showErrorMessage(`DocSync: Failed to open file - ${message}`);
  }
}

async function handlePushFile(uri?: vscode.Uri): Promise<void> {
  if (!service.isInitialized()) {
    vscode.window.showWarningMessage(
      'DocSync is not initialized yet. Run "DocSync: Initialize" from the Command Palette.',
    );
    return;
  }

  try {
    let filePath: string;

    if (uri) {
      filePath = uri.fsPath;
    } else {
      // Pick a file from the workspace
      const fileUris = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectMany: false,
        filters: { Markdown: ["md", "mdx"] },
      });
      if (!fileUris || fileUris.length === 0) return;
      filePath = fileUris[0].fsPath;
    }

    // Show folder picker
    const destFolder = await showFolderPicker();
    if (!destFolder) return;

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `DocSync: Pushing ${path.basename(filePath)}...`,
      },
      async () => {
        await service.pushFiles([filePath], destFolder);
      },
    );

    treeProvider.refresh();
    vscode.window.showInformationMessage(
      `DocSync: Pushed ${path.basename(filePath)} to ${destFolder}`,
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    vscode.window.showErrorMessage(`DocSync push failed: ${message}`);
  }
}

async function handleDeleteFile(item?: DocsyncTreeItem): Promise<void> {
  if (!item || item.isFolder) return;

  const answer = await vscode.window.showWarningMessage(
    `Delete "${item.remotePath}" from DocSync?`,
    { modal: true },
    "Delete",
  );

  if (answer !== "Delete") return;

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `DocSync: Deleting ${item.remotePath}...`,
      },
      async () => {
        await service.deleteFile(item.remotePath);
      },
    );

    treeProvider.refresh();
    vscode.window.showInformationMessage(
      `DocSync: Deleted ${item.remotePath}`,
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    vscode.window.showErrorMessage(`DocSync delete failed: ${message}`);
  }
}

async function handleMoveFile(item?: DocsyncTreeItem): Promise<void> {
  if (!item || item.isFolder) return;

  try {
    const destFolder = await showFolderPicker();
    if (!destFolder) return;

    const fileName = path.basename(item.remotePath);
    const folder = destFolder === "/" ? "" : destFolder.replace(/^\//, "");
    const destPath = folder ? `${folder}${fileName}` : fileName;

    if (destPath === item.remotePath) {
      vscode.window.showInformationMessage("Source and destination are the same.");
      return;
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `DocSync: Moving ${item.remotePath}...`,
      },
      async () => {
        await service.moveFile(item.remotePath, destPath);
      },
    );

    treeProvider.refresh();
    vscode.window.showInformationMessage(
      `DocSync: Moved ${item.remotePath} → ${destPath}`,
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    vscode.window.showErrorMessage(`DocSync move failed: ${message}`);
  }
}

// --- Helpers ---

async function showFolderPicker(): Promise<string | undefined> {
  const folders = await service.getFolders();
  const items: vscode.QuickPickItem[] = [
    { label: "/ (repo root)", description: "Push to root" },
    ...folders.map((f) => ({ label: f, description: "" })),
  ];

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: "Select destination folder",
    canPickMany: false,
  });

  if (!picked) return undefined;
  if (picked.label === "/ (repo root)") return "/";
  return picked.label;
}
