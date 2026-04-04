import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { ConfigManager, expandHome } from "../../../src/config/manager.js";
import type { DocsyncConfig } from "../../../src/config/schema.js";

describe("expandHome", () => {
  it("expands ~ at the start of a path", () => {
    const result = expandHome("~/Documents");
    expect(result).toBe(path.join(os.homedir(), "Documents"));
  });

  it("expands bare ~", () => {
    const result = expandHome("~");
    expect(result).toBe(os.homedir());
  });

  it("does not expand ~ in the middle of a path", () => {
    const result = expandHome("/home/user/~test");
    expect(result).toBe("/home/user/~test");
  });

  it("returns absolute paths unchanged", () => {
    const result = expandHome("/usr/local/bin");
    expect(result).toBe("/usr/local/bin");
  });

  it("returns relative paths unchanged", () => {
    const result = expandHome("relative/path");
    expect(result).toBe("relative/path");
  });
});

describe("ConfigManager", () => {
  let tmpDir: string;
  let configManager: ConfigManager;

  const validConfig: DocsyncConfig = {
    version: 1,
    repo: {
      owner: "testuser",
      name: "test-docs",
      branch: "main",
    },
    auth: {
      token: "ghp_testtoken123",
      tokenCommand: null,
    },
    local: {
      docsDir: "~/.docsync/docs",
      machineName: "test-machine",
      filePatterns: ["**/*.md", "**/*.mdx"],
    },
    transport: "auto",
  };

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "docsync-test-"));
    configManager = new ConfigManager(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe("exists()", () => {
    it("returns false when config file does not exist", async () => {
      const result = await configManager.exists();
      expect(result).toBe(false);
    });

    it("returns true when config file exists", async () => {
      await fs.writeFile(
        path.join(tmpDir, "config.json"),
        JSON.stringify(validConfig),
      );
      const result = await configManager.exists();
      expect(result).toBe(true);
    });
  });

  describe("save()", () => {
    it("creates config directory and writes config file", async () => {
      const nestedDir = path.join(tmpDir, "nested", "dir");
      const nestedManager = new ConfigManager(nestedDir);

      await nestedManager.save(validConfig);

      const configPath = path.join(nestedDir, "config.json");
      const raw = await fs.readFile(configPath, "utf-8");
      const saved = JSON.parse(raw);
      expect(saved.version).toBe(1);
      expect(saved.repo.owner).toBe("testuser");
      expect(saved.repo.name).toBe("test-docs");
      expect(saved.local.machineName).toBe("test-machine");
    });

    it("writes pretty-printed JSON with trailing newline", async () => {
      await configManager.save(validConfig);

      const configPath = path.join(tmpDir, "config.json");
      const raw = await fs.readFile(configPath, "utf-8");
      expect(raw).toMatch(/^\{/);
      expect(raw).toMatch(/\n$/);
      // Verify indentation (2 spaces)
      expect(raw).toContain('  "version"');
    });

    it("validates config before saving (rejects invalid)", async () => {
      const invalidConfig = { ...validConfig, version: 999 } as any;
      await expect(configManager.save(invalidConfig)).rejects.toThrow();
    });
  });

  describe("load()", () => {
    it("loads and validates config from file", async () => {
      await fs.writeFile(
        path.join(tmpDir, "config.json"),
        JSON.stringify(validConfig),
      );

      const loaded = await configManager.load();
      expect(loaded.version).toBe(1);
      expect(loaded.repo.owner).toBe("testuser");
      expect(loaded.repo.name).toBe("test-docs");
      expect(loaded.repo.branch).toBe("main");
      expect(loaded.local.machineName).toBe("test-machine");
    });

    it("applies defaults on load for omitted optional fields", async () => {
      const minimal = {
        version: 1,
        repo: { owner: "user", name: "repo" },
        auth: {},
        local: { machineName: "laptop" },
      };
      await fs.writeFile(
        path.join(tmpDir, "config.json"),
        JSON.stringify(minimal),
      );

      const loaded = await configManager.load();
      expect(loaded.repo.branch).toBe("main");
      expect(loaded.auth.token).toBeNull();
      expect(loaded.local.docsDir).toBe("~/.docsync/docs");
      expect(loaded.transport).toBe("auto");
    });

    it("throws when config file does not exist", async () => {
      await expect(configManager.load()).rejects.toThrow();
    });

    it("throws when config file contains invalid JSON", async () => {
      await fs.writeFile(
        path.join(tmpDir, "config.json"),
        "not valid json{{{",
      );
      await expect(configManager.load()).rejects.toThrow();
    });

    it("throws when config file has invalid schema", async () => {
      await fs.writeFile(
        path.join(tmpDir, "config.json"),
        JSON.stringify({ version: 2, random: true }),
      );
      await expect(configManager.load()).rejects.toThrow();
    });
  });

  describe("save() and load() roundtrip", () => {
    it("roundtrips a config correctly", async () => {
      await configManager.save(validConfig);
      const loaded = await configManager.load();

      expect(loaded).toEqual(validConfig);
    });
  });

  describe("getConfigDir()", () => {
    it("returns the config directory path", () => {
      expect(configManager.getConfigDir()).toBe(tmpDir);
    });

    it("expands ~ in configDir", () => {
      const mgr = new ConfigManager("~/.docsync");
      expect(mgr.getConfigDir()).toBe(
        path.join(os.homedir(), ".docsync"),
      );
    });
  });

  describe("getDocsDir()", () => {
    it("expands ~ in docsDir from config", () => {
      const result = configManager.getDocsDir(validConfig);
      expect(result).toBe(
        path.join(os.homedir(), ".docsync/docs"),
      );
    });

    it("returns absolute path unchanged", () => {
      const config = {
        ...validConfig,
        local: { ...validConfig.local, docsDir: "/absolute/path/docs" },
      };
      const result = configManager.getDocsDir(config);
      expect(result).toBe("/absolute/path/docs");
    });
  });

  describe("ensureDocsDir()", () => {
    it("creates docs directory and returns expanded path", async () => {
      const docsDir = path.join(tmpDir, "test-docs-dir");
      const config = {
        ...validConfig,
        local: { ...validConfig.local, docsDir: docsDir },
      };

      const result = await configManager.ensureDocsDir(config);
      expect(result).toBe(docsDir);

      const stat = await fs.stat(docsDir);
      expect(stat.isDirectory()).toBe(true);
    });

    it("succeeds when directory already exists", async () => {
      const docsDir = path.join(tmpDir, "existing-docs");
      await fs.mkdir(docsDir, { recursive: true });
      const config = {
        ...validConfig,
        local: { ...validConfig.local, docsDir: docsDir },
      };

      const result = await configManager.ensureDocsDir(config);
      expect(result).toBe(docsDir);
    });
  });

  describe("resolveToken()", () => {
    const originalEnv = process.env.GITHUB_TOKEN;

    afterEach(() => {
      if (originalEnv !== undefined) {
        process.env.GITHUB_TOKEN = originalEnv;
      } else {
        delete process.env.GITHUB_TOKEN;
      }
    });

    it("returns explicit token from config (priority 1)", async () => {
      process.env.GITHUB_TOKEN = "env-token-should-not-be-used";
      const config = {
        ...validConfig,
        auth: { token: "config-token-123", tokenCommand: null },
      };

      const token = await configManager.resolveToken(config);
      expect(token).toBe("config-token-123");
    });

    it("returns GITHUB_TOKEN env var when config token is null (priority 2)", async () => {
      process.env.GITHUB_TOKEN = "env-token-456";
      const config = {
        ...validConfig,
        auth: { token: null, tokenCommand: null },
      };

      const token = await configManager.resolveToken(config);
      expect(token).toBe("env-token-456");
    });

    it("returns token from tokenCommand when both token and env are empty (priority 3)", async () => {
      delete process.env.GITHUB_TOKEN;
      const config = {
        ...validConfig,
        auth: { token: null, tokenCommand: "echo command-token-789" },
      };

      const token = await configManager.resolveToken(config);
      expect(token).toBe("command-token-789");
    });

    it("throws when no token source is available", async () => {
      delete process.env.GITHUB_TOKEN;
      const config = {
        ...validConfig,
        auth: { token: null, tokenCommand: null },
      };

      await expect(configManager.resolveToken(config)).rejects.toThrow(
        "No GitHub token found",
      );
    });

    it("throws when tokenCommand fails and no other source is available", async () => {
      delete process.env.GITHUB_TOKEN;
      const config = {
        ...validConfig,
        auth: { token: null, tokenCommand: "nonexistent-command-12345" },
      };

      await expect(configManager.resolveToken(config)).rejects.toThrow(
        "No GitHub token found",
      );
    });

    it("prioritizes config token over env var", async () => {
      process.env.GITHUB_TOKEN = "env-token";
      const config = {
        ...validConfig,
        auth: { token: "config-token", tokenCommand: "echo cmd-token" },
      };

      const token = await configManager.resolveToken(config);
      expect(token).toBe("config-token");
    });

    it("prioritizes env var over tokenCommand", async () => {
      process.env.GITHUB_TOKEN = "env-token";
      const config = {
        ...validConfig,
        auth: { token: null, tokenCommand: "echo cmd-token" },
      };

      const token = await configManager.resolveToken(config);
      expect(token).toBe("env-token");
    });
  });
});
