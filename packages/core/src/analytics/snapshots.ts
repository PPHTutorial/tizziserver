/** Nightly platform KPI snapshot cache (worker) + trend reader. */
import { prisma, type Prisma } from "@stall/db";
import { platformAnalytics } from "./platform.ts";

export async function writeDailySnapshot(platformSlug: string, forDay?: Date) {
  const d = forDay ?? new Date();
  const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const a = await platformAnalytics(platformSlug, { days: 1 });
  const snap = await prisma.analyticsSnapshot.upsert({
    where: { platformSlug_day: { platformSlug, day } },
    create: { platformSlug, day, metrics: a.kpis as Prisma.InputJsonValue },
    update: { metrics: a.kpis as Prisma.InputJsonValue },
  });
  return { id: snap.id, day: day.toISOString().slice(0, 10) };
}

export async function snapshotAllPlatforms() {
  const platforms = await prisma.platform.findMany({ where: { status: "ACTIVE" }, select: { slug: true } });
  for (const p of platforms) await writeDailySnapshot(p.slug).catch((e) => console.error("[snapshot]", p.slug, e));
  return { platforms: platforms.length };
}

export async function trend(platformSlug: string, metric: string, days = 30) {
  const rows = await prisma.analyticsSnapshot.findMany({
    where: { platformSlug, day: { gte: new Date(Date.now() - days * 86_400_000) } },
    orderBy: { day: "asc" },
  });
  return {
    metric,
    points: rows.map((r) => ({ day: r.day.toISOString().slice(0, 10), value: Number((r.metrics as Record<string, unknown>)[metric] ?? 0) })),
  };
}
