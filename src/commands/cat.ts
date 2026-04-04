import { Command } from "commander";
import { ConfigManager } from "../config/manager.js";
import { createTransport } from "../transport/factory.js";
import { SyncEngine } from "../sync/engine.js";
import { formatError } from "../utils/errors.js";
import { pickFile } from "../utils/file-picker.js";
import { logger } from "../utils/logger.js";
import { createSpinner } from "../utils/spinner.js";

export function catCommand(): Command {
  const cmd = new Command("cat");

  cmd
    .description("Display a remote file's content")
    .argument("[path]", "Remote file path (interactive picker if omitted)")
    .action(async (filePath?: string) => {
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

        // If no path provided, show interactive file picker
        let targetPath = filePath;
        if (!targetPath) {
          console.log();
          targetPath = await pickFile(transport, "Select a file to view:");
        }

        // Fetch and print content
        const engine = new SyncEngine(transport, config);

        try {
          const { content } = await engine.getFileContent(targetPath);
          await transport.disconnect();

          // Output raw content to stdout (pipeable)
          process.stdout.write(content);

          // Ensure trailing newline
          if (!content.endsWith("\n")) {
            process.stdout.write("\n");
          }
        } catch (err: unknown) {
          logger.error(formatError(err));
          await transport.disconnect();
          process.exit(1);
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
