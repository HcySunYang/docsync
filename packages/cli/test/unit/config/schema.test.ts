import { describe, it, expect } from "vitest";
import { ConfigSchema } from "../../../src/config/schema.js";

describe("ConfigSchema", () => {
  const validFullConfig = {
    version: 1,
    repo: {
      owner: "testuser",
      name: "my-docs",
      branch: "main",
    },
    auth: {
      token: "ghp_abc123",
      tokenCommand: null,
    },
    local: {
      docsDir: "~/my-docs",
      machineName: "macbook-pro",
      filePatterns: ["**/*.md"],
    },
    transport: "api",
  };

  describe("valid configs", () => {
    it("accepts a fully specified valid config", () => {
      const result = ConfigSchema.safeParse(validFullConfig);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.version).toBe(1);
        expect(result.data.repo.owner).toBe("testuser");
        expect(result.data.repo.name).toBe("my-docs");
        expect(result.data.repo.branch).toBe("main");
        expect(result.data.transport).toBe("api");
      }
    });

    it("accepts config with optional fields omitted and applies defaults", () => {
      const minimal = {
        version: 1,
        repo: {
          owner: "user",
          name: "repo",
        },
        auth: {},
        local: {
          machineName: "laptop",
        },
      };

      const result = ConfigSchema.safeParse(minimal);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.repo.branch).toBe("main");
        expect(result.data.auth.token).toBeNull();
        expect(result.data.auth.tokenCommand).toBeNull();
        expect(result.data.local.docsDir).toBe("~/.docsync/docs");
        expect(result.data.local.filePatterns).toEqual(["**/*.md", "**/*.mdx"]);
        expect(result.data.transport).toBe("auto");
      }
    });

    it("accepts transport value 'auto'", () => {
      const config = { ...validFullConfig, transport: "auto" };
      const result = ConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("accepts transport value 'api'", () => {
      const config = { ...validFullConfig, transport: "api" };
      const result = ConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("accepts transport value 'git'", () => {
      const config = { ...validFullConfig, transport: "git" };
      const result = ConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("accepts auth with tokenCommand instead of token", () => {
      const config = {
        ...validFullConfig,
        auth: {
          token: null,
          tokenCommand: "gh auth token",
        },
      };
      const result = ConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.auth.token).toBeNull();
        expect(result.data.auth.tokenCommand).toBe("gh auth token");
      }
    });

    it("accepts custom filePatterns array", () => {
      const config = {
        ...validFullConfig,
        local: {
          ...validFullConfig.local,
          filePatterns: ["**/*.md", "**/*.txt", "docs/**/*.rst"],
        },
      };
      const result = ConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.local.filePatterns).toEqual([
          "**/*.md",
          "**/*.txt",
          "docs/**/*.rst",
        ]);
      }
    });

    it("accepts custom branch name", () => {
      const config = {
        ...validFullConfig,
        repo: { ...validFullConfig.repo, branch: "develop" },
      };
      const result = ConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.repo.branch).toBe("develop");
      }
    });
  });

  describe("invalid configs", () => {
    it("rejects wrong version number", () => {
      const config = { ...validFullConfig, version: 2 };
      const result = ConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it("rejects missing version", () => {
      const { version, ...rest } = validFullConfig;
      const result = ConfigSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it("rejects missing repo object", () => {
      const { repo, ...rest } = validFullConfig;
      const result = ConfigSchema.safeParse({ ...rest, version: 1 });
      expect(result.success).toBe(false);
    });

    it("rejects missing repo.owner", () => {
      const config = {
        ...validFullConfig,
        repo: { name: "repo", branch: "main" },
      };
      const result = ConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it("rejects missing repo.name", () => {
      const config = {
        ...validFullConfig,
        repo: { owner: "user", branch: "main" },
      };
      const result = ConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it("rejects empty repo.owner string", () => {
      const config = {
        ...validFullConfig,
        repo: { owner: "", name: "repo", branch: "main" },
      };
      const result = ConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it("rejects empty repo.name string", () => {
      const config = {
        ...validFullConfig,
        repo: { owner: "user", name: "", branch: "main" },
      };
      const result = ConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it("rejects missing local object", () => {
      const { local, ...rest } = validFullConfig;
      const result = ConfigSchema.safeParse({ ...rest, version: 1 });
      expect(result.success).toBe(false);
    });

    it("rejects missing local.machineName", () => {
      const config = {
        ...validFullConfig,
        local: { docsDir: "~/docs" },
      };
      const result = ConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it("rejects empty local.machineName", () => {
      const config = {
        ...validFullConfig,
        local: { ...validFullConfig.local, machineName: "" },
      };
      const result = ConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it("rejects missing auth object", () => {
      const { auth, ...rest } = validFullConfig;
      const result = ConfigSchema.safeParse({ ...rest, version: 1 });
      expect(result.success).toBe(false);
    });

    it("rejects invalid transport value", () => {
      const config = { ...validFullConfig, transport: "invalid" };
      const result = ConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it("rejects version as string", () => {
      const config = { ...validFullConfig, version: "1" };
      const result = ConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it("rejects null as config", () => {
      const result = ConfigSchema.safeParse(null);
      expect(result.success).toBe(false);
    });

    it("rejects empty object", () => {
      const result = ConfigSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it("rejects filePatterns as a string instead of array", () => {
      const config = {
        ...validFullConfig,
        local: { ...validFullConfig.local, filePatterns: "**/*.md" },
      };
      const result = ConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });
  });

  describe("type inference", () => {
    it("parses and returns typed object with all fields", () => {
      const parsed = ConfigSchema.parse(validFullConfig);

      // TypeScript type checks at compile time, runtime checks here
      expect(parsed.version).toBe(1);
      expect(typeof parsed.repo.owner).toBe("string");
      expect(typeof parsed.repo.name).toBe("string");
      expect(typeof parsed.repo.branch).toBe("string");
      expect(Array.isArray(parsed.local.filePatterns)).toBe(true);
    });
  });
});
