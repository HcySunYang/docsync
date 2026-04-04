import { describe, it, expect, vi, beforeEach } from "vitest";
import { SyncEngine } from "../../../src/sync/engine.js";
import type { ITransport, FileEntry, TreeEntry } from "../../../src/transport/interface.js";
import type { DocsyncConfig } from "../../../src/config/schema.js";

/**
 * Mock transport that implements ITransport for testing.
 * Stores files in memory and tracks method calls.
 */
function createMockTransport(initialFiles: Map<string, { content: string; size: number }> = new Map()): ITransport & {
  putFilesCalls: { files: { path: string; content: string }[]; message: string }[];
  tree: TreeEntry[];
  files: Map<string, { content: string; size: number }>;
} {
  const files = new Map(initialFiles);
  const putFilesCalls: { files: { path: string; content: string }[]; message: string }[] = [];

  // Build tree entries from files map
  function buildTree(): TreeEntry[] {
    const entries: TreeEntry[] = [];
    const folders = new Set<string>();

    for (const [filePath, { size }] of files) {
      entries.push({
        path: filePath,
        sha: `sha-${filePath}`,
        size,
        type: "blob",
      });

      // Add folder entries for parent directories
      const parts = filePath.split("/");
      for (let i = 1; i < parts.length; i++) {
        const folderPath = parts.slice(0, i).join("/");
        if (!folders.has(folderPath)) {
          folders.add(folderPath);
          entries.push({
            path: folderPath,
            sha: `sha-${folderPath}`,
            size: 0,
            type: "tree",
          });
        }
      }
    }

    return entries;
  }

  const transport: ITransport & {
    putFilesCalls: typeof putFilesCalls;
    tree: TreeEntry[];
    files: typeof files;
  } = {
    putFilesCalls,
    get tree() { return buildTree(); },
    files,

    async connect() {},
    async disconnect() {},

    async listFiles(pattern?: string) {
      const tree = buildTree();
      let blobs = tree.filter((e) => e.type === "blob");
      if (pattern) {
        blobs = blobs.filter((f) => f.path.startsWith(pattern));
      }
      return blobs;
    },

    async listFolders() {
      const tree = buildTree();
      return tree
        .filter((e) => e.type === "tree")
        .map((e) => e.path + "/")
        .sort();
    },

    async getFile(filePath: string): Promise<FileEntry> {
      const file = files.get(filePath);
      if (!file) {
        throw new Error(`File not found: ${filePath}`);
      }
      return {
        path: filePath,
        content: file.content,
        sha: `sha-${filePath}`,
        size: file.size,
      };
    },

    async getFiles(paths: string[]) {
      return Promise.all(paths.map((p) => transport.getFile(p)));
    },

    async getTree() {
      return buildTree();
    },

    async putFile(filePath: string, content: string, message: string) {
      files.set(filePath, { content, size: Buffer.byteLength(content) });
      return `sha-${filePath}`;
    },

    async putFiles(filesToPut: { path: string; content: string }[], message: string) {
      putFilesCalls.push({ files: filesToPut, message });
      for (const f of filesToPut) {
        files.set(f.path, { content: f.content, size: Buffer.byteLength(f.content) });
      }
    },

    async deleteFile(filePath: string, sha: string, message: string) {
      const file = files.get(filePath);
      if (!file) {
        throw new Error(`File not found: ${filePath}`);
      }
      files.delete(filePath);
    },

    async moveFile(from: string, to: string, message: string) {
      const file = files.get(from);
      if (!file) {
        throw new Error(`File not found: ${from}`);
      }
      files.set(to, { content: file.content, size: file.size });
      files.delete(from);
    },
  };

  return transport;
}

function createTestConfig(overrides: Partial<DocsyncConfig> = {}): DocsyncConfig {
  return {
    version: 1,
    repo: {
      owner: "testuser",
      name: "test-docs",
      branch: "main",
    },
    auth: {
      token: "ghp_test",
      tokenCommand: null,
    },
    local: {
      docsDir: "~/.docsync/docs",
      machineName: "test-machine",
      filePatterns: ["**/*.md", "**/*.mdx"],
    },
    transport: "auto",
    ...overrides,
  };
}

describe("SyncEngine", () => {
  let mockTransport: ReturnType<typeof createMockTransport>;
  let config: DocsyncConfig;
  let engine: SyncEngine;

  beforeEach(() => {
    mockTransport = createMockTransport();
    config = createTestConfig();
    engine = new SyncEngine(mockTransport, config);
  });

  describe("push()", () => {
    it("pushes a single file to the root folder", async () => {
      const files = [
        { localPath: "/home/user/notes.md", fileName: "notes.md", content: "# Notes" },
      ];

      const result = await engine.push(files, "/");
      expect(result.pushed).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
      expect(result.pushed[0].remotePath).toBe("notes.md");
      expect(result.pushed[0].localPath).toBe("/home/user/notes.md");
      expect(result.pushed[0].size).toBe(Buffer.byteLength("# Notes"));
    });

    it("pushes a single file to a subfolder", async () => {
      const files = [
        { localPath: "/home/user/doc.md", fileName: "doc.md", content: "# Doc" },
      ];

      const result = await engine.push(files, "my-machine/");
      expect(result.pushed).toHaveLength(1);
      expect(result.pushed[0].remotePath).toBe("my-machine/doc.md");
    });

    it("pushes multiple files at once", async () => {
      const files = [
        { localPath: "/a.md", fileName: "a.md", content: "# A" },
        { localPath: "/b.md", fileName: "b.md", content: "# B" },
        { localPath: "/c.md", fileName: "c.md", content: "# C" },
      ];

      const result = await engine.push(files, "docs/");
      expect(result.pushed).toHaveLength(3);
      expect(result.errors).toHaveLength(0);
      expect(result.pushed[0].remotePath).toBe("docs/a.md");
      expect(result.pushed[1].remotePath).toBe("docs/b.md");
      expect(result.pushed[2].remotePath).toBe("docs/c.md");
    });

    it("sends files to transport with correct paths", async () => {
      const files = [
        { localPath: "/notes.md", fileName: "notes.md", content: "content" },
      ];

      await engine.push(files, "folder/");
      expect(mockTransport.putFilesCalls).toHaveLength(1);
      expect(mockTransport.putFilesCalls[0].files).toEqual([
        { path: "folder/notes.md", content: "content" },
      ]);
    });

    it("generates correct commit message for single file", async () => {
      const files = [
        { localPath: "/notes.md", fileName: "notes.md", content: "content" },
      ];

      await engine.push(files, "/");
      expect(mockTransport.putFilesCalls[0].message).toBe(
        "docsync: push notes.md from test-machine",
      );
    });

    it("generates correct commit message for multiple files", async () => {
      const files = [
        { localPath: "/a.md", fileName: "a.md", content: "# A" },
        { localPath: "/b.md", fileName: "b.md", content: "# B" },
      ];

      await engine.push(files, "/");
      expect(mockTransport.putFilesCalls[0].message).toBe(
        "docsync: push 2 files from test-machine",
      );
    });

    it("includes machine name from config in commit message", async () => {
      const customConfig = createTestConfig({
        local: {
          docsDir: "~/docs",
          machineName: "my-macbook",
          filePatterns: ["**/*.md"],
        },
      });
      const customEngine = new SyncEngine(mockTransport, customConfig);

      const files = [
        { localPath: "/x.md", fileName: "x.md", content: "# X" },
      ];

      await customEngine.push(files, "/");
      expect(mockTransport.putFilesCalls[0].message).toContain("my-macbook");
    });

    it("normalizes destination folder removing leading slash", async () => {
      const files = [
        { localPath: "/file.md", fileName: "file.md", content: "content" },
      ];

      await engine.push(files, "/subfolder/");
      expect(mockTransport.putFilesCalls[0].files[0].path).toBe(
        "subfolder/file.md",
      );
    });

    it("handles destination folder '/' as root", async () => {
      const files = [
        { localPath: "/file.md", fileName: "file.md", content: "content" },
      ];

      await engine.push(files, "/");
      expect(mockTransport.putFilesCalls[0].files[0].path).toBe("file.md");
    });

    it("records errors when transport fails", async () => {
      // Create a transport that always fails on putFiles
      const failingTransport = createMockTransport();
      failingTransport.putFiles = async () => {
        throw new Error("Network error");
      };
      const failingEngine = new SyncEngine(failingTransport, config);

      const files = [
        { localPath: "/a.md", fileName: "a.md", content: "# A" },
        { localPath: "/b.md", fileName: "b.md", content: "# B" },
      ];

      const result = await failingEngine.push(files, "/");
      expect(result.pushed).toHaveLength(0);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0].error).toBe("Network error");
      expect(result.errors[0].localPath).toBe("/a.md");
      expect(result.errors[1].localPath).toBe("/b.md");
    });

    it("reports correct file sizes for pushed files", async () => {
      const content = "Hello, World! 🌍";
      const files = [
        { localPath: "/file.md", fileName: "file.md", content },
      ];

      const result = await engine.push(files, "/");
      expect(result.pushed[0].size).toBe(Buffer.byteLength(content));
    });
  });

  describe("pullAll()", () => {
    it("returns all remote files", async () => {
      const initialFiles = new Map([
        ["docs/notes.md", { content: "# Notes", size: 7 }],
        ["docs/guide.md", { content: "# Guide", size: 7 }],
      ]);
      mockTransport = createMockTransport(initialFiles);
      engine = new SyncEngine(mockTransport, config);

      const result = await engine.pullAll();
      expect(result).toHaveLength(2);
      expect(result.map((f) => f.remotePath).sort()).toEqual([
        "docs/guide.md",
        "docs/notes.md",
      ]);
    });

    it("returns file content and size", async () => {
      const initialFiles = new Map([
        ["readme.md", { content: "# README\nWelcome!", size: 18 }],
      ]);
      mockTransport = createMockTransport(initialFiles);
      engine = new SyncEngine(mockTransport, config);

      const result = await engine.pullAll();
      expect(result).toHaveLength(1);
      expect(result[0].remotePath).toBe("readme.md");
      expect(result[0].content).toBe("# README\nWelcome!");
      expect(result[0].size).toBe(18);
    });

    it("returns empty array when repo is empty", async () => {
      const result = await engine.pullAll();
      expect(result).toHaveLength(0);
    });

    it("filters out tree entries (directories), only returns blobs", async () => {
      // The mock transport builds tree entries for directories automatically
      const initialFiles = new Map([
        ["folder/doc.md", { content: "doc", size: 3 }],
      ]);
      mockTransport = createMockTransport(initialFiles);
      engine = new SyncEngine(mockTransport, config);

      const result = await engine.pullAll();
      // Should only have the file, not the folder
      expect(result).toHaveLength(1);
      expect(result[0].remotePath).toBe("folder/doc.md");
    });
  });

  describe("listFolders()", () => {
    it("returns folders from transport", async () => {
      const initialFiles = new Map([
        ["team-a/doc.md", { content: "doc", size: 3 }],
        ["team-b/notes.md", { content: "notes", size: 5 }],
      ]);
      mockTransport = createMockTransport(initialFiles);
      engine = new SyncEngine(mockTransport, config);

      const folders = await engine.listFolders();
      expect(folders).toContain("team-a/");
      expect(folders).toContain("team-b/");
    });

    it("returns sorted folder list", async () => {
      const initialFiles = new Map([
        ["zebra/z.md", { content: "z", size: 1 }],
        ["alpha/a.md", { content: "a", size: 1 }],
        ["middle/m.md", { content: "m", size: 1 }],
      ]);
      mockTransport = createMockTransport(initialFiles);
      engine = new SyncEngine(mockTransport, config);

      const folders = await engine.listFolders();
      expect(folders).toEqual(["alpha/", "middle/", "zebra/"]);
    });

    it("returns empty array when repo has no folders", async () => {
      // Files at root level, no subdirectories
      const initialFiles = new Map([
        ["readme.md", { content: "hi", size: 2 }],
      ]);
      mockTransport = createMockTransport(initialFiles);
      engine = new SyncEngine(mockTransport, config);

      const folders = await engine.listFolders();
      expect(folders).toHaveLength(0);
    });

    it("returns nested folder paths", async () => {
      const initialFiles = new Map([
        ["a/b/deep.md", { content: "deep", size: 4 }],
      ]);
      mockTransport = createMockTransport(initialFiles);
      engine = new SyncEngine(mockTransport, config);

      const folders = await engine.listFolders();
      expect(folders).toContain("a/");
      expect(folders).toContain("a/b/");
    });
  });

  describe("getTree()", () => {
    it("returns the full tree from transport", async () => {
      const initialFiles = new Map([
        ["folder/file.md", { content: "hello", size: 5 }],
      ]);
      mockTransport = createMockTransport(initialFiles);
      engine = new SyncEngine(mockTransport, config);

      const tree = await engine.getTree();
      expect(tree.length).toBeGreaterThan(0);

      const blobEntry = tree.find((e) => e.type === "blob");
      expect(blobEntry).toBeDefined();
      expect(blobEntry!.path).toBe("folder/file.md");

      const treeEntry = tree.find((e) => e.type === "tree");
      expect(treeEntry).toBeDefined();
      expect(treeEntry!.path).toBe("folder");
    });

    it("returns empty tree for empty repo", async () => {
      const tree = await engine.getTree();
      expect(tree).toHaveLength(0);
    });
  });

  describe("getFileContent()", () => {
    it("returns content and size for an existing file", async () => {
      const initialFiles = new Map([
        ["docs/readme.md", { content: "# Hello World", size: 13 }],
      ]);
      mockTransport = createMockTransport(initialFiles);
      engine = new SyncEngine(mockTransport, config);

      const result = await engine.getFileContent("docs/readme.md");
      expect(result.content).toBe("# Hello World");
      expect(result.size).toBe(13);
    });

    it("throws when file doesn't exist", async () => {
      await expect(engine.getFileContent("nonexistent.md")).rejects.toThrow(
        "File not found: nonexistent.md",
      );
    });
  });

  describe("removeFiles()", () => {
    it("removes a single file successfully", async () => {
      const initialFiles = new Map([
        ["docs/note.md", { content: "# Note", size: 6 }],
      ]);
      mockTransport = createMockTransport(initialFiles);
      engine = new SyncEngine(mockTransport, config);

      const result = await engine.removeFiles(["docs/note.md"]);
      expect(result.removed).toEqual(["docs/note.md"]);
      expect(result.errors).toHaveLength(0);
      expect(mockTransport.files.has("docs/note.md")).toBe(false);
    });

    it("removes multiple files successfully", async () => {
      const initialFiles = new Map([
        ["a.md", { content: "A", size: 1 }],
        ["b.md", { content: "B", size: 1 }],
        ["c.md", { content: "C", size: 1 }],
      ]);
      mockTransport = createMockTransport(initialFiles);
      engine = new SyncEngine(mockTransport, config);

      const result = await engine.removeFiles(["a.md", "b.md", "c.md"]);
      expect(result.removed).toEqual(["a.md", "b.md", "c.md"]);
      expect(result.errors).toHaveLength(0);
      expect(mockTransport.files.size).toBe(0);
    });

    it("returns errors for files that don't exist", async () => {
      const result = await engine.removeFiles(["missing.md"]);
      expect(result.removed).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].path).toBe("missing.md");
      expect(result.errors[0].error).toBe("File not found: missing.md");
    });

    it("handles mixed success and failure (some files exist, some don't)", async () => {
      const initialFiles = new Map([
        ["exists.md", { content: "I exist", size: 7 }],
      ]);
      mockTransport = createMockTransport(initialFiles);
      engine = new SyncEngine(mockTransport, config);

      const result = await engine.removeFiles(["exists.md", "missing.md"]);
      expect(result.removed).toEqual(["exists.md"]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].path).toBe("missing.md");
      expect(result.errors[0].error).toBe("File not found: missing.md");
      expect(mockTransport.files.has("exists.md")).toBe(false);
    });
  });

  describe("moveFile()", () => {
    it("moves a file to a new path", async () => {
      const initialFiles = new Map([
        ["old/doc.md", { content: "# Document", size: 10 }],
      ]);
      mockTransport = createMockTransport(initialFiles);
      engine = new SyncEngine(mockTransport, config);

      await engine.moveFile("old/doc.md", "new/doc.md");
      expect(mockTransport.files.has("old/doc.md")).toBe(false);
      expect(mockTransport.files.has("new/doc.md")).toBe(true);
      expect(mockTransport.files.get("new/doc.md")!.content).toBe("# Document");
    });

    it("generates correct commit message with machine name", async () => {
      const initialFiles = new Map([
        ["src/file.md", { content: "content", size: 7 }],
      ]);
      mockTransport = createMockTransport(initialFiles);
      engine = new SyncEngine(mockTransport, config);

      const moveFileSpy = vi.spyOn(mockTransport, "moveFile");

      await engine.moveFile("src/file.md", "dest/file.md");
      expect(moveFileSpy).toHaveBeenCalledWith(
        "src/file.md",
        "dest/file.md",
        "docsync: move src/file.md → dest/file.md from test-machine",
      );
    });
  });
});
