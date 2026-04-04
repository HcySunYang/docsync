import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { ConfigSchema, type DocsyncConfig } from "./schema.js";
import { getDefaultConfigDir } from "./defaults.js";

const execAsync = promisify(exec);

export function expandHome(filepath: string): string {
  if (filepath.startsWith("~/") || filepath === "~") {
    return path.join(os.homedir(), filepath.slice(2));
  }
  return filepath;
}

export class ConfigManager {
  private configDir: string;
  private configPath: string;

  constructor(configDir?: string) {
    this.configDir = expandHome(configDir ?? getDefaultConfigDir());
    this.configPath = path.join(this.configDir, "config.json");
  }

  async exists(): Promise<boolean> {
    try {
      await fs.access(this.configPath);
      return true;
    } catch {
      return false;
    }
  }

  async load(): Promise<DocsyncConfig> {
    const raw = await fs.readFile(this.configPath, "utf-8");
    const parsed = JSON.parse(raw);
    return ConfigSchema.parse(parsed);
  }

  async save(config: DocsyncConfig): Promise<void> {
    await fs.mkdir(this.configDir, { recursive: true });
    const validated = ConfigSchema.parse(config);
    await fs.writeFile(
      this.configPath,
      JSON.stringify(validated, null, 2) + "\n",
      "utf-8",
    );
  }

  async ensureDocsDir(config: DocsyncConfig): Promise<string> {
    const docsDir = expandHome(config.local.docsDir);
    await fs.mkdir(docsDir, { recursive: true });
    return docsDir;
  }

  getDocsDir(config: DocsyncConfig): string {
    return expandHome(config.local.docsDir);
  }

  getConfigDir(): string {
    return this.configDir;
  }

  /**
   * Resolve GitHub token using priority chain:
   * 1. config.auth.token (explicit value)
   * 2. $GITHUB_TOKEN env var
   * 3. config.auth.tokenCommand (e.g., "gh auth token")
   */
  async resolveToken(config: DocsyncConfig): Promise<string> {
    // 1. Explicit token in config
    if (config.auth.token) {
      return config.auth.token;
    }

    // 2. Environment variable
    const envToken = process.env.GITHUB_TOKEN;
    if (envToken) {
      return envToken;
    }

    // 3. Token command
    if (config.auth.tokenCommand) {
      try {
        const { stdout } = await execAsync(config.auth.tokenCommand);
        const token = stdout.trim();
        if (token) return token;
      } catch {
        // Fall through to error
      }
    }

    throw new Error(
      "No GitHub token found. Set one via:\n" +
        "  - docsync init (interactive setup)\n" +
        "  - GITHUB_TOKEN environment variable\n" +
        '  - gh auth login (then use tokenCommand: "gh auth token")',
    );
  }
}
