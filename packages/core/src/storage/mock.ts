import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "@stall/config";
import { AppError } from "../errors.ts";
import type { StorageProvider, StoredObject } from "./provider.ts";

/**
 * Local-disk storage sandbox — no external accounts (mirrors payments/mock.ts).
 * Writes under `STORAGE_MOCK_DIR` (default `./.storage-mock`, gitignored).
 * Content type is stored alongside each object in a sibling `.meta.json` file
 * since the filesystem doesn't carry one natively.
 */
export class MockStorage implements StorageProvider {
  readonly name = "mock";
  private readonly root: string;

  constructor(root = env.STORAGE_MOCK_DIR) {
    this.root = root;
  }

  private resolve(key: string): string {
    if (key.includes("..")) throw new AppError("VALIDATION", "Invalid storage key");
    return path.join(this.root, key);
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    const file = this.resolve(key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, body);
    await fs.writeFile(`${file}.meta.json`, JSON.stringify({ contentType }));
  }

  async getObject(key: string): Promise<StoredObject> {
    const file = this.resolve(key);
    let body: Buffer;
    try {
      body = await fs.readFile(file);
    } catch {
      throw new AppError("NOT_FOUND", "Stored object not found");
    }
    const metaRaw = await fs.readFile(`${file}.meta.json`, "utf8").catch(() => '{"contentType":"application/octet-stream"}');
    const { contentType } = JSON.parse(metaRaw) as { contentType: string };
    return { body, contentType };
  }
}
