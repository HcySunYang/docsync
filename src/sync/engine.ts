import type { ITransport } from "../transport/interface.js";
import type { DocsyncConfig } from "../config/schema.js";

export interface PushResult {
  pushed: { localPath: string; remotePath: string; size: number }[];
  errors: { localPath: string; error: string }[];
}

export interface PullResult {
  pulled: { remotePath: string; localPath: string; size: number; status: "new" | "updated" | "unchanged" }[];
  errors: { remotePath: string; error: string }[];
}

/**
 * Retry an async operation with exponential backoff.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000,
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      if (attempt === maxRetries) throw err;

      // Only retry on transient errors
      const message = err instanceof Error ? err.message : "";
      const isTransient =
        message.includes("ECONNRESET") ||
        message.includes("ETIMEDOUT") ||
        message.includes("ENOTFOUND") ||
        message.includes("502") ||
        message.includes("503") ||
        message.includes("rate limit");

      if (!isTransient) throw err;

      const delay = baseDelayMs * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error("Unreachable");
}

export class SyncEngine {
  constructor(
    private transport: ITransport,
    private config: DocsyncConfig,
  ) {}

  /**
   * Push files to the remote repo at the specified destination folder.
   */
  async push(
    files: { localPath: string; fileName: string; content: string }[],
    destFolder: string,
  ): Promise<PushResult> {
    const result: PushResult = { pushed: [], errors: [] };

    // Normalize destination folder
    const folder = destFolder === "/" ? "" : destFolder.replace(/^\//, "");

    const filesToPush = files.map((f) => ({
      path: folder ? `${folder}${f.fileName}` : f.fileName,
      content: f.content,
    }));

    const machineName = this.config.local.machineName;
    const fileNames = files.map((f) => f.fileName).join(", ");
    const message =
      files.length === 1
        ? `docsync: push ${fileNames} from ${machineName}`
        : `docsync: push ${files.length} files from ${machineName}`;

    try {
      await withRetry(() => this.transport.putFiles(filesToPush, message));

      for (let i = 0; i < files.length; i++) {
        result.pushed.push({
          localPath: files[i].localPath,
          remotePath: filesToPush[i].path,
          size: Buffer.byteLength(files[i].content),
        });
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      for (const f of files) {
        result.errors.push({ localPath: f.localPath, error: errorMsg });
      }
    }

    return result;
  }

  /**
   * Pull all files from the remote repo.
   */
  async pullAll(): Promise<{ remotePath: string; content: string; size: number }[]> {
    const tree = await withRetry(() => this.transport.getTree());
    const fileEntries = tree.filter((e) => e.type === "blob");

    const files = await Promise.all(
      fileEntries.map(async (entry) => {
        const file = await this.transport.getFile(entry.path);
        return {
          remotePath: file.path,
          content: file.content,
          size: file.size,
        };
      }),
    );

    return files;
  }

  /**
   * Get list of all folders in the remote repo.
   */
  async listFolders(): Promise<string[]> {
    return this.transport.listFolders();
  }

  /**
   * Get the full tree for display purposes.
   */
  async getTree() {
    return this.transport.getTree();
  }

  /**
   * Get a remote file's content.
   */
  async getFileContent(
    filePath: string,
  ): Promise<{ content: string; size: number }> {
    const file = await withRetry(() => this.transport.getFile(filePath));
    return { content: file.content, size: file.size };
  }

  /**
   * Remove files from the remote repo.
   */
  async removeFiles(
    filePaths: string[],
  ): Promise<{ removed: string[]; errors: { path: string; error: string }[] }> {
    const result: { removed: string[]; errors: { path: string; error: string }[] } = {
      removed: [],
      errors: [],
    };

    const machineName = this.config.local.machineName;

    for (const filePath of filePaths) {
      try {
        // Need SHA for GitHub API transport
        const file = await this.transport.getFile(filePath);
        const message =
          filePaths.length === 1
            ? `docsync: remove ${filePath} from ${machineName}`
            : `docsync: remove ${filePath} (batch) from ${machineName}`;
        await withRetry(() =>
          this.transport.deleteFile(filePath, file.sha, message),
        );
        result.removed.push(filePath);
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        result.errors.push({ path: filePath, error: errorMsg });
      }
    }

    return result;
  }

  /**
   * Move a file within the remote repo.
   */
  async moveFile(from: string, to: string): Promise<void> {
    const machineName = this.config.local.machineName;
    const message = `docsync: move ${from} → ${to} from ${machineName}`;
    await withRetry(() => this.transport.moveFile(from, to, message));
  }
}
