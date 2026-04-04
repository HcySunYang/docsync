import { Command } from "commander";
import { input, select, confirm } from "@inquirer/prompts";
import chalk from "chalk";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { ConfigManager } from "../config/manager.js";
import { type DocsyncConfig } from "../config/schema.js";
import { getMachineName } from "../utils/machine.js";
import { logger } from "../utils/logger.js";
import { createSpinner } from "../utils/spinner.js";

const execAsync = promisify(exec);

async function tryGetGhToken(): Promise<string | null> {
  try {
    const { stdout } = await execAsync("gh auth token");
    const token = stdout.trim();
    return token || null;
  } catch {
    return null;
  }
}

export function initCommand(): Command {
  const cmd = new Command("init");

  cmd
    .description("Initialize docsync configuration")
    .action(async () => {
      const configManager = new ConfigManager();

      console.log();
      console.log(chalk.bold("  docsync init — first-time setup"));
      console.log();

      // Check if config already exists
      if (await configManager.exists()) {
        const overwrite = await confirm({
          message: "Configuration already exists. Overwrite?",
          default: false,
        });
        if (!overwrite) {
          logger.info("Aborted.");
          return;
        }
      }

      // 1. GitHub repo
      const repoInput = await input({
        message: "GitHub repo to sync docs to (owner/repo):",
        validate: (value) => {
          const parts = value.split("/");
          if (parts.length !== 2 || !parts[0] || !parts[1]) {
            return "Please enter in the format: owner/repo";
          }
          return true;
        },
      });
      const [owner, name] = repoInput.split("/");

      // 2. Branch
      const branch = await input({
        message: "Branch to use:",
        default: "main",
      });

      // 3. Machine name
      const defaultMachine = getMachineName();
      const machineName = await input({
        message: "Machine name:",
        default: defaultMachine,
      });

      // 4. GitHub token
      const ghToken = await tryGetGhToken();
      let tokenValue: string | null = null;
      let tokenCommand: string | null = null;

      if (ghToken) {
        const useGhCli = await confirm({
          message: `Found GitHub CLI token. Use "gh auth token" for authentication?`,
          default: true,
        });
        if (useGhCli) {
          tokenCommand = "gh auth token";
        }
      }

      if (!tokenCommand) {
        const tokenChoice = await select({
          message: "How to authenticate with GitHub?",
          choices: [
            {
              name: "Enter a personal access token (PAT)",
              value: "pat",
            },
            {
              name: "Use GITHUB_TOKEN environment variable",
              value: "env",
            },
            {
              name: "Enter a command that outputs a token",
              value: "command",
            },
          ],
        });

        switch (tokenChoice) {
          case "pat": {
            tokenValue = await input({
              message: "GitHub personal access token:",
              validate: (v) => (v.length > 0 ? true : "Token cannot be empty"),
            });
            break;
          }
          case "env": {
            if (!process.env.GITHUB_TOKEN) {
              logger.warn(
                "GITHUB_TOKEN is not currently set. Make sure to set it before using docsync.",
              );
            }
            break;
          }
          case "command": {
            tokenCommand = await input({
              message: 'Command to get token (e.g., "gh auth token"):',
              validate: (v) =>
                v.length > 0 ? true : "Command cannot be empty",
            });
            break;
          }
        }
      }

      // Build config
      const config: DocsyncConfig = {
        version: 1,
        repo: { owner, name, branch },
        auth: { token: tokenValue, tokenCommand },
        local: {
          docsDir: "~/.docsync/docs",
          machineName,
          filePatterns: ["**/*.md", "**/*.mdx"],
        },
        transport: "auto",
      };

      // Verify access
      const spinner = createSpinner(
        `Verifying access to github.com/${owner}/${name}...`,
      );
      spinner.start();

      try {
        const token = await configManager.resolveToken(config);

        const { Octokit } = await import("@octokit/rest");
        const octokit = new Octokit({ auth: token });

        await octokit.rest.repos.get({ owner, repo: name });
        spinner.succeed(`Verified access to github.com/${owner}/${name}`);
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Unknown error";
        spinner.fail(`Could not access github.com/${owner}/${name}`);
        logger.error(message);
        logger.blank();
        logger.info(
          "Make sure the repo exists and your token has the correct permissions.",
        );
        return;
      }

      // Save config
      await configManager.save(config);
      logger.success(
        `Config written to ${configManager.getConfigDir()}/config.json`,
      );

      // Create docs directory
      const docsDir = await configManager.ensureDocsDir(config);
      logger.success(`Local docs directory: ${docsDir}`);

      logger.blank();
      logger.info("You're all set! Next steps:");
      logger.info('  docsync push <file>  — push a doc to the repo');
      logger.info('  docsync pull         — pull all docs locally');
      logger.info('  docsync open         — open docs folder');
      logger.blank();
    });

  return cmd;
}
