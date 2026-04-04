import { Command } from "commander";
import { ConfigManager } from "../config/manager.js";
import { createTransport } from "../transport/factory.js";
import { SyncEngine } from "../sync/engine.js";
import { formatFileSize } from "../utils/files.js";
import { formatError } from "../utils/errors.js";
import { printTree } from "../utils/tree.js";
import { logger } from "../utils/logger.js";
import { createSpinner } from "../utils/spinner.js";

export function listCommand(): Command {
  const cmd = new Command("list");

  cmd
    .alias("ls")
    .description("List files in the remote repo")
    .argument("[path]", "Optional subfolder to filter")
    .action(async (filterPath?: string) => {
      try {
        const configManager = new ConfigManager();

        if (!(await configManager.exists())) {
          logger.error(
            "docsync is not initialized. Run `docsync init` first.",
          );
          process.exit(1);
        }

        const config = await configManager.load();

        // Connect
        const spinner = createSpinner(
          `Listing files from github.com/${config.repo.owner}/${config.repo.name}...`,
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
          const tree = await engine.getTree();
          spinner.stop();

          // Filter to blobs (files) only
          let files = tree.filter((e) => e.type === "blob");

          // Apply path filter if provided
          if (filterPath) {
            const normalized = filterPath.endsWith("/")
              ? filterPath
              : filterPath + "/";
            files = files.filter((f) => f.path.startsWith(normalized));
          }

          if (files.length === 0) {
            if (filterPath) {
              logger.info(`No files found in "${filterPath}".`);
            } else {
              logger.info("No files in the remote repo.");
            }
            await transport.disconnect();
            return;
          }

          // Print tree view (no status indicators)
          const treeFiles = files.map((f) => ({
            remotePath: f.path,
            size: f.size,
          }));
          printTree(treeFiles, { showStatus: false });

          // Summary
          const totalSize = files.reduce((sum, f) => sum + f.size, 0);
          console.log();
          logger.info(
            `${files.length} file${files.length > 1 ? "s" : ""}, ${formatFileSize(totalSize)} total`,
          );
          console.log();
        } catch (err: unknown) {
          spinner.fail("Failed to list files");
          logger.error(formatError(err));
          process.exit(1);
        } finally {
          await transport.disconnect();
        }
      } catch (err: unknown) {
        if (
          err &&
          typeof err === "object" &&
          "name" in err &&
          err.name === "ExitPromptError"
        ) {
          console.log();
          logger.dim("Cancelled.");
          return;
        }
        logger.error(formatError(err));
        process.exit(1);
      }
    });

  return cmd;
}
