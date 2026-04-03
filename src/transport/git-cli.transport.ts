import fs from "node:fs/promises";
import path from "node:path";
import { simpleGit, type SimpleGit } from "simple-git";
import type { ITransport, FileEntry, TreeEntry } from "./interface.js";
import type { DocsyncConfig } from "../config/schema.js";
import { ConfigManager, expandHome } from "../config/manager.js";

export class GitCLITransport implements ITransport {
  private git!: SimpleGit;
  private repoDir: string;
  private repoUrl: string;
  private branch: string;
  private config: DocsyncConfig;
  private configManager: ConfigManager;

  constructor(config: DocsyncConfig, configManager: ConfigManager) {
    this.config = config;
    this.configManager = configManager;
    this.branch = config.repo.branch;
    this.repoDir = path.join(
      expandHome("~/.docsync"),
      ".gitrepo",
    );
    this.repoUrl = `https://github.com/${config.repo.owner}/${config.repo.name}.git`;
  }

  async connect(): Promise<void> {
    const token = await this.configManager.resolveToken(this.config);
    const authedUrl = `https://x-access-token:${token}@github.com/${this.config.repo.owner}/${this.config.repo.name}.git`;

    try {
      await fs.access(path.join(this.repoDir, ".git"));
      // Repo already cloned — update remote URL and pull
      this.git = simpleGit(this.repoDir);
      await this.git.remote(["set-url", "origin", authedUrl]);
      await this.git.fetch("origin", this.branch);
      try {
        await this.git.checkout(this.branch);
        await this.git.pull("origin", this.branch);
      } catch {
        // Branch might not exist yet in an empty repo
      }
    } catch {
      // Clone the repo
      await fs.mkdir(this.repoDir, { recursive: true });
      const parentDir = path.dirname(this.repoDir);
      const dirName = path.basename(this.repoDir);

      const tempGit = simpleGit(parentDir);
      await tempGit.clone(authedUrl, dirName, [
        "--depth",
        "1",
        "--single-branch",
        "--branch",
        this.branch,
      ]).catch(async () => {
        // If branch doesn't exist (empty repo), clone without branch
        await tempGit.clone(authedUrl, dirName);
      });

      this.git = simpleGit(this.repoDir);
    }
  }

  async disconnect(): Promise<void> {
    // No cleanup needed
  }

  async getTree(): Promise<TreeEntry[]> {
    const entries: TreeEntry[] = [];

    async function walk(dir: string, relativeTo: string): Promise<void> {
      const items = await fs.readdir(dir, { withFileTypes: true });
      for (const item of items) {
        if (item.name === ".git") continue;

        const fullPath = path.join(dir, item.name);
        const relPath = path.relative(relativeTo, fullPath);

        if (item.isDirectory()) {
          entries.push({
            path: relPath,
            sha: "",
            size: 0,
            type: "tree",
          });
          await walk(fullPath, relativeTo);
        } else {
          const stat = await fs.stat(fullPath);
          entries.push({
            path: relPath,
            sha: "",
            size: stat.size,
            type: "blob",
          });
        }
      }
    }

    await walk(this.repoDir, this.repoDir);
    return entries;
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
    const fullPath = path.join(this.repoDir, filePath);
    const content = await fs.readFile(fullPath, "utf-8");
    const stat = await fs.stat(fullPath);

    return {
      path: filePath,
      content,
      sha: "",
      size: stat.size,
    };
  }

  async getFiles(paths: string[]): Promise<FileEntry[]> {
    return Promise.all(paths.map((p) => this.getFile(p)));
  }

  async putFile(
    filePath: string,
    content: string,
    message: string,
  ): Promise<string> {
    const fullPath = path.join(this.repoDir, filePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, "utf-8");
    await this.git.add(filePath);
    await this.git.commit(message);
    await this.git.push("origin", this.branch);
    return "";
  }

  async putFiles(
    files: { path: string; content: string }[],
    message: string,
  ): Promise<void> {
    if (files.length === 0) return;

    for (const f of files) {
      const fullPath = path.join(this.repoDir, f.path);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, f.content, "utf-8");
    }

    await this.git.add(files.map((f) => f.path));
    await this.git.commit(message);
    await this.git.push("origin", this.branch);
  }

  async deleteFile(
    filePath: string,
    _sha: string,
    message: string,
  ): Promise<void> {
    const fullPath = path.join(this.repoDir, filePath);
    await fs.unlink(fullPath);
    await this.git.add(filePath);
    await this.git.commit(message);
    await this.git.push("origin", this.branch);
  }
}
