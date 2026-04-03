import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { ITransport } from "./interface.js";
import type { DocsyncConfig } from "../config/schema.js";
import { ConfigManager } from "../config/manager.js";
import { GitHubAPITransport } from "./github-api.transport.js";
import { GitCLITransport } from "./git-cli.transport.js";

const execAsync = promisify(exec);

async function isGitInstalled(): Promise<boolean> {
  try {
    await execAsync("git --version");
    return true;
  } catch {
    return false;
  }
}

export async function createTransport(
  config: DocsyncConfig,
  configManager: ConfigManager,
): Promise<ITransport> {
  const preference = config.transport;

  if (preference === "api") {
    return new GitHubAPITransport(config, configManager);
  }

  if (preference === "git") {
    return new GitCLITransport(config, configManager);
  }

  // "auto" mode: prefer git if available, fall back to API
  if (await isGitInstalled()) {
    return new GitCLITransport(config, configManager);
  }

  return new GitHubAPITransport(config, configManager);
}
