import { Octokit } from "@octokit/rest";
import type { ITransport, FileEntry, TreeEntry } from "./interface.js";
import type { DocsyncConfig } from "../config/schema.js";
import { ConfigManager } from "../config/manager.js";

export class GitHubAPITransport implements ITransport {
  private octokit!: Octokit;
  private owner: string;
  private repo: string;
  private branch: string;
  private config: DocsyncConfig;
  private configManager: ConfigManager;

  constructor(config: DocsyncConfig, configManager: ConfigManager) {
    this.config = config;
    this.configManager = configManager;
    this.owner = config.repo.owner;
    this.repo = config.repo.name;
    this.branch = config.repo.branch;
  }

  async connect(): Promise<void> {
    const token = await this.configManager.resolveToken(this.config);
    this.octokit = new Octokit({ auth: token });

    // Verify access
    await this.octokit.rest.repos.get({
      owner: this.owner,
      repo: this.repo,
    });
  }

  async disconnect(): Promise<void> {
    // No cleanup needed for API transport
  }

  async getTree(): Promise<TreeEntry[]> {
    try {
      const { data: ref } = await this.octokit.rest.git.getRef({
        owner: this.owner,
        repo: this.repo,
        ref: `heads/${this.branch}`,
      });

      const { data: commit } = await this.octokit.rest.git.getCommit({
        owner: this.owner,
        repo: this.repo,
        commit_sha: ref.object.sha,
      });

      const { data: tree } = await this.octokit.rest.git.getTree({
        owner: this.owner,
        repo: this.repo,
        tree_sha: commit.tree.sha,
        recursive: "true",
      });

      return tree.tree
        .filter(
          (item): item is typeof item & { path: string; sha: string } =>
            item.path !== undefined && item.sha !== undefined,
        )
        .map((item) => ({
          path: item.path,
          sha: item.sha,
          size: item.size ?? 0,
          type: item.type === "tree" ? ("tree" as const) : ("blob" as const),
        }));
    } catch (err: unknown) {
      // If the repo is empty (no commits), return empty tree
      if (
        err &&
        typeof err === "object" &&
        "status" in err &&
        err.status === 409
      ) {
        return [];
      }
      throw err;
    }
  }

  async listFiles(pattern?: string): Promise<TreeEntry[]> {
    const tree = await this.getTree();
    let files = tree.filter((entry) => entry.type === "blob");

    if (pattern) {
      files = files.filter((f) => f.path.startsWith(pattern));
    }

    return files;
  }

  async listFolders(): Promise<string[]> {
    const tree = await this.getTree();
    const folders = tree
      .filter((entry) => entry.type === "tree")
      .map((entry) => entry.path + "/");

    return folders.sort();
  }

  async getFile(filePath: string): Promise<FileEntry> {
    const { data } = await this.octokit.rest.repos.getContent({
      owner: this.owner,
      repo: this.repo,
      path: filePath,
      ref: this.branch,
    });

    if (Array.isArray(data) || data.type !== "file") {
      throw new Error(`Path "${filePath}" is not a file`);
    }

    const content = Buffer.from(data.content, "base64").toString("utf-8");

    return {
      path: data.path,
      content,
      sha: data.sha,
      size: data.size,
    };
  }

  async getFiles(paths: string[]): Promise<FileEntry[]> {
    return Promise.all(paths.map((p) => this.getFile(p)));
  }

  async putFile(
    filePath: string,
    content: string,
    message: string,
    existingSha?: string,
  ): Promise<string> {
    // If we don't have the SHA, try to get it (file might already exist)
    let sha = existingSha;
    if (!sha) {
      try {
        const existing = await this.getFile(filePath);
        sha = existing.sha;
      } catch {
        // File doesn't exist yet, that's fine
      }
    }

    const { data } = await this.octokit.rest.repos.createOrUpdateFileContents({
      owner: this.owner,
      repo: this.repo,
      path: filePath,
      message,
      content: Buffer.from(content).toString("base64"),
      branch: this.branch,
      ...(sha ? { sha } : {}),
    });

    return data.content?.sha ?? "";
  }

  async putFiles(
    files: { path: string; content: string }[],
    message: string,
  ): Promise<void> {
    if (files.length === 0) return;

    // For single files, use the simple API
    if (files.length === 1) {
      await this.putFile(files[0].path, files[0].content, message);
      return;
    }

    // For multiple files, use the Git Data API for a single commit
    // 1. Get current commit SHA
    let baseTreeSha: string;
    let parentSha: string;

    try {
      const { data: ref } = await this.octokit.rest.git.getRef({
        owner: this.owner,
        repo: this.repo,
        ref: `heads/${this.branch}`,
      });
      parentSha = ref.object.sha;

      const { data: commit } = await this.octokit.rest.git.getCommit({
        owner: this.owner,
        repo: this.repo,
        commit_sha: parentSha,
      });
      baseTreeSha = commit.tree.sha;
    } catch {
      // Empty repo — create initial commit
      parentSha = "";
      baseTreeSha = "";
    }

    // 2. Create blobs in parallel
    const blobs = await Promise.all(
      files.map((f) =>
        this.octokit.rest.git.createBlob({
          owner: this.owner,
          repo: this.repo,
          content: Buffer.from(f.content).toString("base64"),
          encoding: "base64",
        }),
      ),
    );

    // 3. Create tree
    const treeItems = files.map((f, i) => ({
      path: f.path,
      mode: "100644" as const,
      type: "blob" as const,
      sha: blobs[i].data.sha,
    }));

    const { data: newTree } = await this.octokit.rest.git.createTree({
      owner: this.owner,
      repo: this.repo,
      tree: treeItems,
      ...(baseTreeSha ? { base_tree: baseTreeSha } : {}),
    });

    // 4. Create commit
    const { data: newCommit } = await this.octokit.rest.git.createCommit({
      owner: this.owner,
      repo: this.repo,
      message,
      tree: newTree.sha,
      parents: parentSha ? [parentSha] : [],
    });

    // 5. Update ref
    if (parentSha) {
      await this.octokit.rest.git.updateRef({
        owner: this.owner,
        repo: this.repo,
        ref: `heads/${this.branch}`,
        sha: newCommit.sha,
      });
    } else {
      await this.octokit.rest.git.createRef({
        owner: this.owner,
        repo: this.repo,
        ref: `refs/heads/${this.branch}`,
        sha: newCommit.sha,
      });
    }
  }

  async deleteFile(
    filePath: string,
    sha: string,
    message: string,
  ): Promise<void> {
    await this.octokit.rest.repos.deleteFile({
      owner: this.owner,
      repo: this.repo,
      path: filePath,
      message,
      sha,
      branch: this.branch,
    });
  }
}
