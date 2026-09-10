import { env } from "@stall/config";
import { AppError } from "../errors.ts";
import { MockStorage } from "./mock.ts";
import { S3Storage } from "./s3.ts";
import type { StorageProvider } from "./provider.ts";

export type { StorageProvider, StoredObject } from "./provider.ts";

const REGISTRY: Record<string, () => StorageProvider> = {
  mock: () => new MockStorage(),
  s3: () => new S3Storage(),
};

/** Resolve the configured object-storage provider (`STORAGE_PROVIDER`). */
export function storageProvider(): StorageProvider {
  const make = REGISTRY[env.STORAGE_PROVIDER];
  if (!make) throw new AppError("VALIDATION", `Unknown storage provider: ${env.STORAGE_PROVIDER}`);
  return make();
}
