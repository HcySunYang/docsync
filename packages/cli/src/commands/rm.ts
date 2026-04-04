import { Command } from "commander";
import { confirm } from "@inquirer/prompts";
import chalk from "chalk";
import { ConfigManager } from "../config/manager.js";
import { createTransport } from "../transport/factory.js";
import { SyncEngine } from "../sync/engine.js";
import { formatFileSize } from "../utils/files.js";
import { formatError } from "../utils/errors.js";
import { pickFiles } from "../utils/file-picker.js";
import { logger } from "../utils/logger.js";
import { createSpinner } from "../utils/spinner.js";

export function rmCommand(): Command {
  const cmd = new Command("rm");

  cmd
    .description("Remove files from the remote repo")
    .argument("[paths...]", "Remote file paths to remove (interactive picker if omitted)")
    .action(async (paths: string[]) => {
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
        const spinner = createSpinner("Connecting to remote repo...");
        spinner.start();

        const transport = await createTransport(config, configManager);

        try {
          await transport.connect();
          spinner.succeed(
            `Connected to github.com/${config.repo.owner}/${config.repo.name}`,
          );
        } catch (err: unknown) {
          spinner.fail("Failed to connect to remote repo");
          logger.error(formatError(err));
          process.exit(1);
        }

        // If no paths provided, show interactive multi-select file picker
        let filesToRemove: string[];
        if (!paths || paths.length === 0) {
          console.log();
          filesToRemove = await pickFiles(
            transport,
            "Select files to remove (space to toggle, enter to confirm):",
          );

          if (filesToRemove.length === 0) {
            logger.info("No files selected.");
            await transport.disconnect();
            return;
          }
        } else {
          // Resolve paths against remote tree (support prefix matching)
          const tree = await transport.getTree();
          const remoteFiles = tree
            .filter((e) => e.type === "blob")
            .map((e) => e.path);

          filesToRemove = [];
          for (const p of paths) {
            const normalized = p.replace(/^\//, "");
            // Exact match
            if (remoteFiles.includes(normalized)) {
              filesToRemove.push(normalized);
            } else {
              // Prefix match (folder-like pattern)
              const prefix = normalized.endsWith("/")
                ? normalized
                : normalized + "/";
              const matches = remoteFiles.filter((f) =>
                f.startsWith(prefix),
              );
              filesToRemove.push(...matches);
            }
          }

          if (filesToRemove.length === 0) {
            logger.warn("No matching files found in the remote repo.");
            await transport.disconnect();
            return;
          }
        }

        // Show what will be removed
        console.log();
        logger.info("Files to remove:");
        for (const f of filesToRemove) {
          console.log(chalk.red(`    ${f}`));
        }
        console.log();

        // Confirmation (default: No — deletion is destructive)
        const confirmed = await confirm({
          message: `Are you sure you want to remove ${filesToRemove.length} file${filesToRemove.length > 1 ? "s" : ""}?`,
          default: false,
        });

        if (!confirmed) {
          logger.dim("Cancelled.");
          await transport.disconnect();
          return;
        }

        // Remove files
        const spinnerRm = createSpinner(
          `Removing ${filesToRemove.length} file${filesToRemove.length > 1 ? "s" : ""}...`,
        );
        spinnerRm.start();

        const engine = new SyncEngine(transport, config);
        const result = await engine.removeFiles(filesToRemove);

        await transport.disconnect();

        if (result.errors.length > 0) {
          spinnerRm.fail("Some files failed to remove");
          for (const err of result.errors) {
            logger.error(`${err.path}: ${err.error}`);
          }
        }

        if (result.removed.length > 0) {
          spinnerRm.succeed(
            `Removed ${result.removed.length} file${result.removed.length > 1 ? "s" : ""}`,
          );
        }

        console.log();
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
