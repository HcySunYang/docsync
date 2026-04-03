/**
 * Represents a file in the remote repository.
 */
export interface FileEntry {
  /** Relative path within the repo */
  path: string;
  /** File content (utf-8) */
  content: string;
  /** Git blob SHA */
  sha: string;
  /** File size in bytes */
  size: number;
}

/**
 * Represents an entry in the repo tree (file or directory).
 */
export interface TreeEntry {
  /** Relative path within the repo */
  path: string;
  /** Git object SHA */
  sha: string;
  /** Size in bytes (0 for directories) */
  size: number;
  /** Type: blob (file) or tree (directory) */
  type: "blob" | "tree";
}

/**
 * Transport abstraction for interacting with the remote repository.
 */
export interface ITransport {
  /** Verify authentication and repo access */
  connect(): Promise<void>;

  /** Clean up resources */
  disconnect(): Promise<void>;

  /** List all files in the repo, optionally filtered by glob */
  listFiles(pattern?: string): Promise<TreeEntry[]>;

  /** List all folders (tree entries) in the repo */
  listFolders(): Promise<string[]>;

  /** Get a single file's content */
  getFile(path: string): Promise<FileEntry>;

  /** Get multiple files' contents */
  getFiles(paths: string[]): Promise<FileEntry[]>;

  /** Get the full tree listing */
  getTree(): Promise<TreeEntry[]>;

  /**
   * Upload a single file.
   * Returns the new blob SHA.
   */
  putFile(
    path: string,
    content: string,
    message: string,
    existingSha?: string,
  ): Promise<string>;

  /**
   * Upload multiple files in a single commit.
   * Uses Git Data API for efficiency.
   */
  putFiles(
    files: { path: string; content: string }[],
    message: string,
  ): Promise<void>;

  /** Delete a file from the repo */
  deleteFile(path: string, sha: string, message: string): Promise<void>;
}
