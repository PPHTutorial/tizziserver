import { prisma, type Role } from "@stall/db";
import { AppError } from "../errors.ts";

export type FeatureValue = boolean | number | string | Record<string, unknown> | unknown[];
export type Features = Readonly<Record<string, FeatureValue>>;

const asValue = (v: unknown): FeatureValue => v as FeatureValue;

export interface ResolveInput {
  platformSlug: string;
  role?: Role;
  userId?: string;
  regionCode?: string;
}

/**
 * Effective capability set = platform ∩ role ∩ region ∩ user-override,
 * later sources win. Missing key ⇒ absent (treated as off by `hasFeature`).
 */
export async function resolveFeatures(input: ResolveInput): Promise<Features> {
  const [platformRows, roleRows, regionRows, overrideRows] = await Promise.all([
    prisma.platformFeature.findMany({ where: { platformSlug: input.platformSlug } }),
    input.role
      ? prisma.roleFeature.findMany({ where: { role: input.role } })
      : Promise.resolve([]),
    input.regionCode
      ? prisma.regionRule.findMany({ where: { regionCode: input.regionCode } })
      : Promise.resolve([]),
    input.userId
      ? prisma.userFeatureOverride.findMany({
          where: {
            userId: input.userId,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
        })
      : Promise.resolve([]),
  ]);

  const out: Record<string, FeatureValue> = {};
  for (const r of platformRows) out[r.flagKey] = asValue(r.value);
  for (const r of roleRows) out[r.flagKey] = asValue(r.value);
  for (const r of regionRows) out[r.flagKey] = asValue(r.value);
  for (const r of overrideRows) out[r.flagKey] = asValue(r.value);
  return Object.freeze(out);
}

export function hasFeature(features: Features, key: string): boolean {
  const v = features[key];
  if (v === undefined || v === null || v === false) return false;
  if (v === 0 || v === "" || v === "off" || v === "false") return false;
  return true;
}

export function featureValue<T extends FeatureValue>(features: Features, key: string, fallback: T): T {
  const v = features[key];
  return (v === undefined ? fallback : (v as T));
}

export function assertFeature(features: Features, key: string): void {
  if (!hasFeature(features, key)) {
    throw new AppError("FEATURE_DISABLED", `Feature "${key}" is not enabled for this platform`);
  }
}
