import os from "node:os";

export function getMachineName(): string {
  return os.hostname().replace(/\.local$/, "").toLowerCase();
}
