import { Command } from "commander";
import fs from "node:fs/promises";
import path from "node:path";
import { search, input } from "@inquirer/prompts";
import chalk from "chalk";
import { ConfigManager } from "../config/manager.js";
import { createTransport } from "../transport/factory.js";
import { SyncEngine } from "../sync/engine.js";
import { resolveFiles, formatFileSize } from "../utils/files.js";
import { logger } from "../utils/logger.js";
import { createSpinner } from "../utils/spinner.js";

function formatError(err: unknown): string {
  if (err instanceof Error) {
    // Improve common GitHub API error messages
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

export function pushCommand(): Command {
  const cmd = new Command("push");

  cmd
    .description("Push markdown files to the remote repo")
    .argument("<paths...>", "Files, globs, or directories to push")
    .action(async (paths: string[]) => {
      try {
        const configManager = new ConfigManager();

        // Check config exists
        if (!(await configManager.exists())) {
          logger.error(
            "docsync is not initialized. Run `docsync init` first.",
          );
          process.exit(1);
        }

        const config = await configManager.load();

        // Resolve files
        const filePaths = await resolveFiles(paths, config.local.filePatterns);

        if (filePaths.length === 0) {
          logger.warn("No markdown files found matching the given paths.");
          logger.dim(
            "Supported patterns: " + config.local.filePatterns.join(", "),
          );
          return;
        }

        // Show files to push
        console.log();
        logger.info(
          `Found ${filePaths.length} file${filePaths.length > 1 ? "s" : ""} to push:`,
        );
        console.log();

        const fileData: {
          localPath: string;
          fileName: string;
          content: string;
          size: number;
        }[] = [];

        for (const fp of filePaths) {
          const content = await fs.readFile(fp, "utf-8");
          const stat = await fs.stat(fp);
          const fileName = path.basename(fp);
          fileData.push({ localPath: fp, fileName, content, size: stat.size });
          console.log(
            chalk.dim("    ") +
              chalk.white(fileName) +
              chalk.dim(` (${formatFileSize(stat.size)})`),
          );
        }
        console.log();

        // Connect to remote and fetch folders
        const spinnerConnect = createSpinner("Connecting to remote repo...");
        spinnerConnect.start();

        const transport = await createTransport(config, configManager);

        try {
          await transport.connect();
        } catch (err: unknown) {
          spinnerConnect.fail("Failed to connect to remote repo");
          logger.error(formatError(err));
          process.exit(1);
        }

        let folders: string[];
        try {
          folders = await transport.listFolders();
          spinnerConnect.succeed(
            `Connected to github.com/${config.repo.owner}/${config.repo.name}`,
          );
        } catch (err: unknown) {
          spinnerConnect.fail("Failed to list remote folders");
          logger.error(formatError(err));
          await transport.disconnect();
          process.exit(1);
        }

        // Interactive folder picker
        const folderChoices = [
          { name: "📂 / (repo root)", value: "/" },
          ...folders.map((f) => ({
            name: `📂 ${f}`,
            value: f,
          })),
        ];

        console.log();
        const destFolder = await search({
          message:
            "Where to save? (arrow keys to browse, type to filter or create new folder)",
          source: (term) => {
            const choices = [...folderChoices];

            if (term && term.trim()) {
              const normalized = term.endsWith("/") ? term : term + "/";
              // Check if the typed term matches any existing folder
              const exists = folders.some((f) => f === normalized);
              if (!exists) {
                choices.push({
                  name: `📝 Create: ${normalized}`,
                  value: normalized,
                });
              }
              // Filter choices by term
              return choices.filter(
                (c) =>
                  c.value.toLowerCase().includes(term.toLowerCase()) ||
                  c.name.toLowerCase().includes(term.toLowerCase()),
              );
            }

            return choices;
          },
        });

        // Push files
        console.log();
        const spinnerPush = createSpinner(
          `Pushing ${fileData.length} file${fileData.length > 1 ? "s" : ""}...`,
        );
        spinnerPush.start();

        const engine = new SyncEngine(transport, config);
        const result = await engine.push(fileData, destFolder);

        await transport.disconnect();

        if (result.errors.length > 0) {
          spinnerPush.fail("Some files failed to push");
          for (const err of result.errors) {
            logger.error(`${path.basename(err.localPath)}: ${err.error}`);
          }
        }

        if (result.pushed.length > 0) {
          spinnerPush.succeed(
            `Pushed ${result.pushed.length} file${result.pushed.length > 1 ? "s" : ""}`,
          );
          for (const p of result.pushed) {
            logger.success(
              `${path.basename(p.localPath)} → ${p.remotePath} (${formatFileSize(p.size)})`,
            );
          }
        }

        console.log();
      } catch (err: unknown) {
        // Handle user cancellation (Ctrl+C during prompts)
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
