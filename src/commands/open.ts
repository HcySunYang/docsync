import { Command } from "commander";
import { exec } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { ConfigManager, expandHome } from "../config/manager.js";
import { logger } from "../utils/logger.js";

function getOpenCommand(): string {
  switch (os.platform()) {
    case "darwin":
      return "open";
    case "win32":
      return "explorer";
    default:
      return "xdg-open";
  }
}

export function openCommand(): Command {
  const cmd = new Command("open");

  cmd
    .description("Open the local docs folder in your file manager")
    .argument("[subfolder]", "Optional subfolder to open")
    .action(async (subfolder?: string) => {
      const configManager = new ConfigManager();

      // Check config exists
      if (!(await configManager.exists())) {
        logger.error("docsync is not initialized. Run `docsync init` first.");
        process.exit(1);
      }

      const config = await configManager.load();
      let targetDir = expandHome(config.local.docsDir);

      if (subfolder) {
        targetDir = path.join(targetDir, subfolder);
      }

      // Check if directory exists
      try {
        await fs.access(targetDir);
      } catch {
        logger.warn(`Directory does not exist: ${targetDir}`);
        logger.info('Run "docsync pull" first to download your docs.');
        return;
      }

      logger.info(`Opening ${targetDir} ...`);

      const openCmd = getOpenCommand();
      exec(`${openCmd} "${targetDir}"`, (err) => {
        if (err) {
          logger.error(`Failed to open directory: ${err.message}`);
        }
      });
    });

  return cmd;
}
