import { Command } from "commander";
import fs from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import { ConfigManager, expandHome } from "../config/manager.js";
import { createTransport } from "../transport/factory.js";
import { SyncEngine } from "../sync/engine.js";
import { formatFileSize } from "../utils/files.js";
import { logger } from "../utils/logger.js";
import { createSpinner } from "../utils/spinner.js";

function formatError(err: unknown): string {
  if (err instanceof Error) {
    if (err.message.includes("Bad credentials")) {
      return "Authentication failed. Your GitHub token may be expired or invalid.\n  Run `docsync init` to reconfigure.";
    }
    if (err.message.includes("Not Found")) {
      return "Repository not found. Check that the repo exists and your token has access.\n  Run `docsync init` to reconfigure.";
    }
    if (
      err.message.includes("ENOTFOUND") ||
      err.message.includes("ECONNREFUSED")
    ) {
      return "Network error. Please check your internet connection.";
    }
    if (err.message.includes("rate limit")) {
      return "GitHub API rate limit exceeded. Please wait a few minutes and try again.";
    }
    return err.message;
  }
  return "An unexpected error occurred.";
}

/**
 * Build and print a tree view of files with their statuses.
 */
function printTree(
  files: { remotePath: string; size: number; status: string }[],
): void {
  // Build tree structure
  interface TreeNode {
    name: string;
    children: Map<string, TreeNode>;
    file?: { size: number; status: string };
  }

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
        switch (child.file.status) {
          case "new":
            statusStr = chalk.green("✅ new");
            break;
          case "updated":
            statusStr = chalk.cyan("✅ updated");
            break;
          case "unchanged":
            statusStr = chalk.dim("── unchanged");
            break;
        }
        console.log(
          `${indent}${chalk.white(child.name)}${chalk.dim(sizeStr)}   ${statusStr}`,
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

export function pullCommand(): Command {
  const cmd = new Command("pull");

  cmd
    .description("Pull all docs from the remote repo")
    .action(async () => {
      const configManager = new ConfigManager();

      // Check config exists
      if (!(await configManager.exists())) {
        logger.error("docsync is not initialized. Run `docsync init` first.");
        process.exit(1);
      }

      const config = await configManager.load();
      const docsDir = expandHome(config.local.docsDir);

      // Connect
      const spinner = createSpinner(
        `Pulling from github.com/${config.repo.owner}/${config.repo.name}...`,
      );
      spinner.start();

      const transport = await createTransport(config, configManager);

      try {
        await transport.connect();
      } catch (err: unknown) {
        spinner.fail("Failed to connect to remote repo");
        logger.error(formatError(err));
        process.exit(1);
      }

      const engine = new SyncEngine(transport, config);

      try {
        const files = await engine.pullAll();
        spinner.stop();

        if (files.length === 0) {
          logger.info("No files in the remote repo.");
          await transport.disconnect();
          return;
        }

        // Ensure docs directory exists
        await fs.mkdir(docsDir, { recursive: true });

        // Write files and determine status
        const results: {
          remotePath: string;
          size: number;
          status: string;
        }[] = [];

        for (const file of files) {
          const localPath = path.join(docsDir, file.remotePath);
          await fs.mkdir(path.dirname(localPath), { recursive: true });

          // Check if file exists and is unchanged
          let status = "new";
          try {
            const existing = await fs.readFile(localPath, "utf-8");
            if (existing === file.content) {
              status = "unchanged";
            } else {
              status = "updated";
            }
          } catch {
            // File doesn't exist — new
          }

          if (status !== "unchanged") {
            await fs.writeFile(localPath, file.content, "utf-8");
          }

          results.push({
            remotePath: file.remotePath,
            size: Buffer.byteLength(file.content),
            status,
          });
        }

        // Print tree view
        printTree(results);

        const pulled = results.filter((r) => r.status !== "unchanged");
        const totalSize = pulled.reduce((sum, r) => sum + r.size, 0);

        console.log();
        if (pulled.length > 0) {
          logger.success(
            `Pulled ${pulled.length} file${pulled.length > 1 ? "s" : ""} (${formatFileSize(totalSize)}) to ${docsDir}`,
          );
        } else {
          logger.info("All files are up to date.");
        }
        console.log();
      } catch (err: unknown) {
        spinner.fail("Pull failed");
        logger.error(formatError(err));
        process.exit(1);
      } finally {
        await transport.disconnect();
      }
    });

  return cmd;
}
