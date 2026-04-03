import os from "node:os";

export function getDefaultMachineName(): string {
  return os.hostname().replace(/\.local$/, "").toLowerCase();
}

export function getDefaultDocsDir(): string {
  return "~/.docsync/docs";
}

export function getDefaultConfigDir(): string {
  return "~/.docsync";
}
