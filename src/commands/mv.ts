import { Command } from "commander";
import path from "node:path";
import { confirm } from "@inquirer/prompts";
import chalk from "chalk";
import { ConfigManager } from "../config/manager.js";
import { createTransport } from "../transport/factory.js";
import { SyncEngine } from "../sync/engine.js";
import { formatError } from "../utils/errors.js";
import { pickFile, pickFolder } from "../utils/file-picker.js";
import { logger } from "../utils/logger.js";
import { createSpinner } from "../utils/spinner.js";

export function mvCommand(): Command {
  const cmd = new Command("mv");

  cmd
    .description("Move/rename a file within the remote repo")
    .argument("[src]", "Source file path (interactive picker if omitted)")
    .argument("[dest]", "Destination path (folder picker if omitted)")
    .action(async (src?: string, dest?: string) => {
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

        // If no source provided, show interactive file picker
        let sourcePath = src;
        if (!sourcePath) {
          console.log();
          sourcePath = await pickFile(transport, "Select file to move:");
        }

        // If no destination provided, show interactive folder picker
        let destPath = dest;
        if (!destPath) {
          console.log();
          destPath = await pickFolder(
            transport,
            "Where to move it? (arrow keys to browse, type to filter or create new folder)",
          );
        }

        // If dest is a folder (ends with /), keep the original filename
        if (destPath.endsWith("/") || destPath === "/") {
          const fileName = path.basename(sourcePath);
          const folder =
            destPath === "/" ? "" : destPath.replace(/^\//, "");
          destPath = folder ? `${folder}${fileName}` : fileName;
        }

        // Don't move to the same path
        if (sourcePath === destPath) {
          logger.warn("Source and destination are the same. Nothing to do.");
          await transport.disconnect();
          return;
        }

        // Show what will happen and confirm
        console.log();
        logger.info(
          `Move: ${chalk.yellow(sourcePath)} → ${chalk.green(destPath)}`,
        );
        console.log();

        const confirmed = await confirm({
          message: "Confirm move?",
          default: true,
        });

        if (!confirmed) {
          logger.dim("Cancelled.");
          await transport.disconnect();
          return;
        }

        // Perform move
        const spinnerMv = createSpinner("Moving...");
        spinnerMv.start();

        const engine = new SyncEngine(transport, config);

        try {
          await engine.moveFile(sourcePath, destPath);
          await transport.disconnect();
          spinnerMv.succeed(
            `Moved ${sourcePath} → ${destPath}`,
          );
        } catch (err: unknown) {
          spinnerMv.fail("Move failed");
          logger.error(formatError(err));
          await transport.disconnect();
          process.exit(1);
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
