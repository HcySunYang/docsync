import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { resolveFiles, formatFileSize } from "../../../src/utils/files.js";

describe("formatFileSize", () => {
  it("formats bytes", () => {
    expect(formatFileSize(0)).toBe("0 B");
    expect(formatFileSize(1)).toBe("1 B");
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(1023)).toBe("1023 B");
  });

  it("formats kilobytes", () => {
    expect(formatFileSize(1024)).toBe("1.0 KB");
    expect(formatFileSize(1536)).toBe("1.5 KB");
    expect(formatFileSize(10240)).toBe("10.0 KB");
    expect(formatFileSize(1024 * 1024 - 1)).toBe("1024.0 KB");
  });

  it("formats megabytes", () => {
    expect(formatFileSize(1024 * 1024)).toBe("1.0 MB");
    expect(formatFileSize(1.5 * 1024 * 1024)).toBe("1.5 MB");
    expect(formatFileSize(10 * 1024 * 1024)).toBe("10.0 MB");
    expect(formatFileSize(100 * 1024 * 1024)).toBe("100.0 MB");
  });

  it("handles boundary at exactly 1024", () => {
    expect(formatFileSize(1024)).toBe("1.0 KB");
  });

  it("handles boundary at exactly 1024*1024", () => {
    expect(formatFileSize(1024 * 1024)).toBe("1.0 MB");
  });
});

describe("resolveFiles", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "docsync-files-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("resolves a single file path", async () => {
    const filePath = path.join(tmpDir, "test.md");
    await fs.writeFile(filePath, "# Hello");

    const result = await resolveFiles([filePath]);
    expect(result).toEqual([filePath]);
  });

  it("resolves multiple file paths", async () => {
    const file1 = path.join(tmpDir, "a.md");
    const file2 = path.join(tmpDir, "b.md");
    await fs.writeFile(file1, "# A");
    await fs.writeFile(file2, "# B");

    const result = await resolveFiles([file1, file2]);
    expect(result).toHaveLength(2);
    expect(result).toContain(file1);
    expect(result).toContain(file2);
  });

  it("scans a directory for markdown files using default patterns", async () => {
    await fs.writeFile(path.join(tmpDir, "doc.md"), "# Doc");
    await fs.writeFile(path.join(tmpDir, "page.mdx"), "# Page");
    await fs.writeFile(path.join(tmpDir, "readme.txt"), "text");

    const result = await resolveFiles([tmpDir]);
    expect(result).toHaveLength(2);
    const fileNames = result.map((f) => path.basename(f));
    expect(fileNames).toContain("doc.md");
    expect(fileNames).toContain("page.mdx");
    expect(fileNames).not.toContain("readme.txt");
  });

  it("scans a directory with custom patterns", async () => {
    await fs.writeFile(path.join(tmpDir, "doc.md"), "# Doc");
    await fs.writeFile(path.join(tmpDir, "readme.txt"), "text");

    const result = await resolveFiles([tmpDir], ["**/*.txt"]);
    expect(result).toHaveLength(1);
    expect(path.basename(result[0])).toBe("readme.txt");
  });

  it("scans nested directories", async () => {
    const subDir = path.join(tmpDir, "nested", "deep");
    await fs.mkdir(subDir, { recursive: true });
    await fs.writeFile(path.join(tmpDir, "top.md"), "# Top");
    await fs.writeFile(path.join(subDir, "deep.md"), "# Deep");

    const result = await resolveFiles([tmpDir]);
    expect(result).toHaveLength(2);
    const fileNames = result.map((f) => path.basename(f));
    expect(fileNames).toContain("top.md");
    expect(fileNames).toContain("deep.md");
  });

  it("deduplicates results", async () => {
    const filePath = path.join(tmpDir, "test.md");
    await fs.writeFile(filePath, "# Hello");

    const result = await resolveFiles([filePath, filePath]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(filePath);
  });

  it("handles non-existent paths as glob patterns", async () => {
    // A path that doesn't exist and doesn't match any glob should return empty
    const result = await resolveFiles(["nonexistent-dir-xyz-12345/*.md"]);
    expect(result).toHaveLength(0);
  });

  it("includes non-markdown single files (no filtering for explicit files)", async () => {
    const filePath = path.join(tmpDir, "notes.txt");
    await fs.writeFile(filePath, "just notes");

    const result = await resolveFiles([filePath]);
    expect(result).toEqual([filePath]);
  });

  it("returns empty array for empty input", async () => {
    const result = await resolveFiles([]);
    expect(result).toHaveLength(0);
  });
});
