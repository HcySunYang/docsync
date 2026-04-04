import { search, checkbox } from "@inquirer/prompts";
import type { ITransport } from "../transport/interface.js";
import { formatFileSize } from "./files.js";

/**
 * Interactive single-select file picker.
 * Fetches remote files and lets user search/filter to pick one.
 */
export async function pickFile(
  transport: ITransport,
  message: string,
): Promise<string> {
  const tree = await transport.getTree();
  const files = tree
    .filter((e) => e.type === "blob")
    .sort((a, b) => a.path.localeCompare(b.path));

  if (files.length === 0) {
    throw new Error("No files found in the remote repo.");
  }

  const fileChoices = files.map((f) => ({
    name: `📄 ${f.path}  ${formatFileSize(f.size).padStart(10)}`,
    value: f.path,
  }));

  const selected = await search({
    message,
    source: (term) => {
      if (!term || !term.trim()) return fileChoices;
      return fileChoices.filter((c) =>
        c.value.toLowerCase().includes(term.toLowerCase()),
      );
    },
  });

  return selected;
}

/**
 * Interactive multi-select file picker.
 * Fetches remote files and lets user toggle multiple selections.
 */
export async function pickFiles(
  transport: ITransport,
  message: string,
): Promise<string[]> {
  const tree = await transport.getTree();
  const files = tree
    .filter((e) => e.type === "blob")
    .sort((a, b) => a.path.localeCompare(b.path));

  if (files.length === 0) {
    throw new Error("No files found in the remote repo.");
  }

  const fileChoices = files.map((f) => ({
    name: `${f.path}  ${formatFileSize(f.size).padStart(10)}`,
    value: f.path,
  }));

  const selected = await checkbox({
    message,
    choices: fileChoices,
  });

  return selected;
}

/**
 * Interactive folder picker.
 * Fetches remote folders and lets user search/filter or type a new path.
 */
export async function pickFolder(
  transport: ITransport,
  message: string,
): Promise<string> {
  const folders = await transport.listFolders();

  const folderChoices = [
    { name: "📂 / (repo root)", value: "/" },
    ...folders.map((f) => ({
      name: `📂 ${f}`,
      value: f,
    })),
  ];

  const selected = await search({
    message,
    source: (term) => {
      const choices = [...folderChoices];

      if (term && term.trim()) {
        const normalized = term.endsWith("/") ? term : term + "/";
        const exists = folders.some((f) => f === normalized);
        if (!exists) {
          choices.push({
            name: `📝 Create: ${normalized}`,
            value: normalized,
          });
        }
        return choices.filter(
          (c) =>
            c.value.toLowerCase().includes(term.toLowerCase()) ||
            c.name.toLowerCase().includes(term.toLowerCase()),
        );
      }

      return choices;
    },
  });

  return selected;
}
