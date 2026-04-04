// CLI
export { createCli } from "./cli.js";

// Core APIs for programmatic use
export { ConfigManager, expandHome } from "./config/manager.js";
export { ConfigSchema, type DocsyncConfig } from "./config/schema.js";
export { createTransport } from "./transport/factory.js";
export type { ITransport, FileEntry, TreeEntry } from "./transport/interface.js";
export { SyncEngine, type PushResult } from "./sync/engine.js";
export { formatFileSize } from "./utils/files.js";
export { formatError } from "./utils/errors.js";
