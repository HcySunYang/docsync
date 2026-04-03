import fs from "node:fs/promises";
import path from "node:path";
import { glob as globFn } from "glob";

/**
 * Resolve file paths from arguments (files, globs, directories).
 * Returns absolute paths to matching markdown files.
 */
export async function resolveFiles(
  paths: string[],
  patterns: string[] = ["**/*.md", "**/*.mdx"],
): Promise<string[]> {
  const results: string[] = [];

  for (const p of paths) {
    const absPath = path.resolve(p);

    try {
      const stat = await fs.stat(absPath);

      if (stat.isFile()) {
        results.push(absPath);
      } else if (stat.isDirectory()) {
        // Scan directory for markdown files
        const files = await globFn(patterns, {
          cwd: absPath,
          absolute: true,
          nodir: true,
          ignore: ["**/node_modules/**", "**/.*"],
        });
        results.push(...files);
      }
    } catch {
      // Try as glob pattern
      const files = await globFn(p, {
        absolute: true,
        nodir: true,
        ignore: ["**/node_modules/**", "**/.*"],
      });
      results.push(...files);
    }
  }

  // Deduplicate
  return [...new Set(results)];
}

/**
 * Get file size in human-readable format.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
