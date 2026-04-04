import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  ConfigManager,
  expandHome,
  createTransport,
  SyncEngine,
  type DocsyncConfig,
  type ITransport,
  type TreeEntry,
  type PushResult,
} from "docsync-cli";

export class DocsyncService {
  private configManager: ConfigManager;
  private transport: ITransport | null = null;
  private engine: SyncEngine | null = null;
  private config: DocsyncConfig | null = null;
  private initialized = false;

  constructor() {
    this.configManager = new ConfigManager();
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  async initialize(): Promise<boolean> {
    try {
      if (!(await this.configManager.exists())) {
        return false;
      }

      this.config = await this.configManager.load();
      this.transport = await createTransport(this.config, this.configManager);
      await this.transport.connect();
      this.engine = new SyncEngine(this.transport, this.config);
      this.initialized = true;
      return true;
    } catch {
      this.initialized = false;
      return false;
    }
  }

  async initWithConfig(config: DocsyncConfig): Promise<void> {
    await this.configManager.save(config);
    await this.configManager.ensureDocsDir(config);
    this.config = config;
    this.transport = await createTransport(this.config, this.configManager);
    await this.transport.connect();
    this.engine = new SyncEngine(this.transport, this.config);
    this.initialized = true;
  }

  async getTree(): Promise<TreeEntry[]> {
    this.ensureInitialized();
    return this.engine!.getTree();
  }

  async viewFile(filePath: string): Promise<string> {
    this.ensureInitialized();
    const { content } = await this.engine!.getFileContent(filePath);
    return content;
  }

  async pushFiles(
    localPaths: string[],
    destFolder: string,
  ): Promise<PushResult> {
    this.ensureInitialized();

    const files = await Promise.all(
      localPaths.map(async (localPath) => {
        const content = await fs.readFile(localPath, "utf-8");
        const fileName = path.basename(localPath);
        return { localPath, fileName, content };
      }),
    );

    return this.engine!.push(files, destFolder);
  }

  async deleteFile(filePath: string): Promise<void> {
    this.ensureInitialized();
    await this.engine!.removeFiles([filePath]);
  }

  async moveFile(from: string, to: string): Promise<void> {
    this.ensureInitialized();
    await this.engine!.moveFile(from, to);
  }

  async pullAll(): Promise<number> {
    this.ensureInitialized();
    const files = await this.engine!.pullAll();
    const docsDir = expandHome(this.config!.local.docsDir);

    let count = 0;
    for (const file of files) {
      const localPath = path.join(docsDir, file.remotePath);
      await fs.mkdir(path.dirname(localPath), { recursive: true });
      await fs.writeFile(localPath, file.content, "utf-8");
      count++;
    }

    return count;
  }

  async refresh(): Promise<void> {
    if (this.transport) {
      try {
        await this.transport.disconnect();
      } catch {
        // ignore disconnect errors
      }
    }
    await this.initialize();
  }

  async getFolders(): Promise<string[]> {
    this.ensureInitialized();
    return this.engine!.listFolders();
  }

  getConfig(): DocsyncConfig | null {
    return this.config;
  }

  dispose(): void {
    if (this.transport) {
      this.transport.disconnect().catch(() => {});
      this.transport = null;
    }
    this.engine = null;
    this.config = null;
    this.initialized = false;
  }

  private ensureInitialized(): void {
    if (!this.initialized || !this.engine) {
      throw new Error(
        "DocSync is not initialized. Run 'DocSync: Initialize' first.",
      );
    }
  }
}
