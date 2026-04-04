import { Command } from "commander";
import fs from "node:fs/promises";
import path from "node:path";
import { ConfigManager, expandHome } from "../config/manager.js";
import { createTransport } from "../transport/factory.js";
import { SyncEngine } from "../sync/engine.js";
import { formatFileSize } from "../utils/files.js";
import { formatError } from "../utils/errors.js";
import { printTree } from "../utils/tree.js";
import { logger } from "../utils/logger.js";
import { createSpinner } from "../utils/spinner.js";

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
