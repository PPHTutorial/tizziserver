/**
 * Boost / ad tiers. **Backend-editable — no tier is hardcoded anywhere.**
 * The admin console is the only writer; mobile + the ranker read the active set.
 */
import { prisma, type Prisma, type AdBillingModel, type AdPlacementSlot } from "@stall/db";
import { AppError } from "../errors.ts";

export interface BoostTierView {
  id: string;
  key: string;
  name: string;
  description: string | null;
  billingModel: AdBillingModel;
  priceMinor: number;
  rankBoostBps: number;
  placements: AdPlacementSlot[];
  badge: string | null;
  sortOrder: number;
}

const shape = (t: {
  id: string; key: string; name: string; description: string | null; billingModel: AdBillingModel;
  priceMinor: number; rankBoostBps: number; placements: AdPlacementSlot[]; badge: string | null; sortOrder: number;
}): BoostTierView => ({
  id: t.id, key: t.key, name: t.name, description: t.description, billingModel: t.billingModel,
  priceMinor: t.priceMinor, rankBoostBps: t.rankBoostBps, placements: t.placements, badge: t.badge, sortOrder: t.sortOrder,
});

export async function listBoostTiers(platformSlug?: string): Promise<{ items: BoostTierView[] }> {
  const rows = await prisma.boostTier.findMany({
    where: { isActive: true, ...(platformSlug ? { platformSlugs: { has: platformSlug } } : {}) },
    orderBy: [{ sortOrder: "asc" }, { priceMinor: "asc" }],
  });
  return { items: rows.map(shape) };
}

/** Admin listing — includes inactive tiers. */
export async function listAllBoostTiers() {
  const rows = await prisma.boostTier.findMany({ orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }] });
  return {
    items: rows.map((t) => ({ ...shape(t), platformSlugs: t.platformSlugs, isActive: t.isActive, updatedAt: t.updatedAt.toISOString() })),
  };
}

export async function getBoostTier(idOrKey: string) {
  const t =
    (await prisma.boostTier.findUnique({ where: { id: idOrKey } })) ??
    (await prisma.boostTier.findUnique({ where: { key: idOrKey } }));
  if (!t) throw new AppError("NOT_FOUND", "Boost tier not found");
  return t;
}

// --- admin ------------------------------------------------------------

export interface UpsertBoostTierInput {
  key: string;
  name: string;
  description?: string;
  platformSlugs: string[];
  billingModel: AdBillingModel;
  priceMinor: number;
  rankBoostBps?: number;
  placements: AdPlacementSlot[];
  badge?: string;
  sortOrder?: number;
  isActive?: boolean;
}

export async function upsertBoostTier(input: UpsertBoostTierInput) {
  if (input.priceMinor < 0) throw new AppError("VALIDATION", "priceMinor must be non-negative");
  if ((input.rankBoostBps ?? 10000) < 10000) throw new AppError("VALIDATION", "rankBoostBps must be ≥ 10000 (1.0×)");
  const data = {
    name: input.name,
    description: input.description,
    platformSlugs: input.platformSlugs,
    billingModel: input.billingModel,
    priceMinor: input.priceMinor,
    rankBoostBps: input.rankBoostBps ?? 10000,
    placements: input.placements,
    badge: input.badge,
    sortOrder: input.sortOrder ?? 0,
    isActive: input.isActive ?? true,
  } satisfies Prisma.BoostTierUncheckedUpdateInput;
  const t = await prisma.boostTier.upsert({
    where: { key: input.key },
    create: { key: input.key, ...data } as Prisma.BoostTierUncheckedCreateInput,
    update: data,
  });
  return shape(t);
}

export async function deactivateBoostTier(idOrKey: string) {
  const t = await getBoostTier(idOrKey);
  await prisma.boostTier.update({ where: { id: t.id }, data: { isActive: false } });
  return { id: t.id, isActive: false };
}
