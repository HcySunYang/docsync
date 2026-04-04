import chalk from "chalk";
import { formatFileSize } from "./files.js";

interface TreeFileEntry {
  remotePath: string;
  size: number;
  status?: string;
}

interface TreeNode {
  name: string;
  children: Map<string, TreeNode>;
  file?: { size: number; status?: string };
}

/**
 * Build and print a tree view of files.
 *
 * @param files - Array of file entries with remotePath, size, and optional status
 * @param options.showStatus - Whether to show status indicators (default: true)
 */
export function printTree(
  files: TreeFileEntry[],
  options: { showStatus?: boolean } = {},
): void {
  const { showStatus = true } = options;

  // Build tree structure
  const root: TreeNode = { name: "", children: new Map() };

  for (const f of files) {
    const parts = f.remotePath.split("/");
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === parts.length - 1) {
        // File
        current.children.set(part, {
          name: part,
          children: new Map(),
          file: { size: f.size, status: f.status },
        });
      } else {
        // Directory
        if (!current.children.has(part)) {
          current.children.set(part, {
            name: part,
            children: new Map(),
          });
        }
        current = current.children.get(part)!;
      }
    }
  }

  // Print tree
  function printNode(node: TreeNode, indent: string): void {
    const entries = [...node.children.entries()].sort(([a], [b]) => {
      const aIsDir = !node.children.get(a)?.file;
      const bIsDir = !node.children.get(b)?.file;
      if (aIsDir !== bIsDir) return aIsDir ? -1 : 1;
      return a.localeCompare(b);
    });

    for (const [, child] of entries) {
      if (child.file) {
        // File
        const sizeStr = formatFileSize(child.file.size).padStart(10);
        let statusStr = "";
        if (showStatus && child.file.status) {
          switch (child.file.status) {
            case "new":
              statusStr = chalk.green("   ✅ new");
              break;
            case "updated":
              statusStr = chalk.cyan("   ✅ updated");
              break;
            case "unchanged":
              statusStr = chalk.dim("   ── unchanged");
              break;
          }
        }
        console.log(
          `${indent}${chalk.white(child.name)}${chalk.dim(sizeStr)}${statusStr}`,
        );
      } else {
        // Directory
        console.log(`${indent}${chalk.blue("📂 " + child.name + "/")}`);
        printNode(child, indent + "   ");
      }
    }
  }

  console.log();
  printNode(root, "  ");
}
