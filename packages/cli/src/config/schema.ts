import { z } from "zod";

export const ConfigSchema = z.object({
  version: z.literal(1),
  repo: z.object({
    owner: z.string().min(1),
    name: z.string().min(1),
    branch: z.string().default("main"),
  }),
  auth: z.object({
    token: z.string().nullable().default(null),
    tokenCommand: z.string().nullable().default(null),
  }),
  local: z.object({
    docsDir: z.string().default("~/.docsync/docs"),
    machineName: z.string().min(1),
    filePatterns: z.array(z.string()).default(["**/*.md", "**/*.mdx"]),
  }),
  transport: z.enum(["auto", "api", "git"]).default("auto"),
});

export type DocsyncConfig = z.infer<typeof ConfigSchema>;
