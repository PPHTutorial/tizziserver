/**
 * Delivery zones — serviceable areas. Polygon (`area`) is authoritative for
 * point-in-zone; `centerLat/Lng` + `radiusM` is the fallback when no polygon is
 * set. Used for serviceability checks + coarse area labels on the job feed.
 */
import { prisma, type Prisma } from "@stall/db";
import { AppError } from "../errors.ts";
import { haversineM } from "../maps/index.ts";

export interface ZoneMatch {
  id: string;
  name: string;
  baseFeeMinor: number;
  perKmMinor: number;
}

/** The zone containing (or nearest, within radius) a point for a platform. */
export async function zoneForPoint(platformSlug: string, lat: number, lng: number): Promise<ZoneMatch | null> {
  const byPolygon = await prisma.$queryRawUnsafe<ZoneMatch[]>(
    `SELECT "id", "name", "baseFeeMinor", "perKmMinor"
       FROM "delivery_zones"
      WHERE "status" = 'ACTIVE'
        AND ("platformSlug" = $1 OR "platformSlug" IS NULL)
        AND "area" IS NOT NULL
        AND ST_Covers("area", ST_SetSRID(ST_MakePoint($2,$3),4326)::geography)
      LIMIT 1`,
    platformSlug,
    lng,
    lat,
  );
  if (byPolygon[0]) return byPolygon[0];

  const circles = await prisma.deliveryZone.findMany({
    where: { status: "ACTIVE", OR: [{ platformSlug }, { platformSlug: null }], centerLat: { not: null }, radiusM: { not: null } },
    select: { id: true, name: true, baseFeeMinor: true, perKmMinor: true, centerLat: true, centerLng: true, radiusM: true },
  });
  for (const z of circles) {
    if (haversineM({ lat, lng }, { lat: z.centerLat!, lng: z.centerLng! }) <= z.radiusM!) {
      return { id: z.id, name: z.name, baseFeeMinor: z.baseFeeMinor, perKmMinor: z.perKmMinor };
    }
  }
  return null;
}

export async function isServiceable(platformSlug: string, lat: number, lng: number): Promise<boolean> {
  // No zones configured at all ⇒ serve everywhere (dev default).
  const count = await prisma.deliveryZone.count({ where: { status: "ACTIVE", OR: [{ platformSlug }, { platformSlug: null }] } });
  if (count === 0) return true;
  return (await zoneForPoint(platformSlug, lat, lng)) !== null;
}

export async function listZones(platformSlug?: string) {
  const rows = await prisma.deliveryZone.findMany({
    where: platformSlug ? { OR: [{ platformSlug }, { platformSlug: null }] } : {},
    orderBy: { createdAt: "asc" },
  });
  return rows.map((z) => ({
    id: z.id,
    name: z.name,
    platformSlug: z.platformSlug,
    regionCode: z.regionCode,
    centerLat: z.centerLat,
    centerLng: z.centerLng,
    radiusM: z.radiusM,
    baseFeeMinor: z.baseFeeMinor,
    perKmMinor: z.perKmMinor,
    status: z.status,
  }));
}

export interface UpsertZoneInput {
  id?: string;
  name: string;
  platformSlug?: string | null;
  regionCode?: string | null;
  centerLat?: number;
  centerLng?: number;
  radiusM?: number;
  /** GeoJSON polygon coordinates ([[ [lng,lat], ... ]]) — sets `area`. */
  polygon?: number[][][];
  baseFeeMinor?: number;
  perKmMinor?: number;
  status?: "ACTIVE" | "INACTIVE";
}

export async function upsertZone(input: UpsertZoneInput) {
  const data: Prisma.DeliveryZoneUncheckedCreateInput = {
    name: input.name,
    platformSlug: input.platformSlug ?? null,
    regionCode: input.regionCode ?? null,
    centerLat: input.centerLat ?? null,
    centerLng: input.centerLng ?? null,
    radiusM: input.radiusM ?? null,
    baseFeeMinor: input.baseFeeMinor ?? 0,
    perKmMinor: input.perKmMinor ?? 0,
    status: input.status ?? "ACTIVE",
  };
  const row = input.id
    ? await prisma.deliveryZone.update({ where: { id: input.id }, data })
    : await prisma.deliveryZone.create({ data });

  if (input.polygon) {
    const geojson = JSON.stringify({ type: "Polygon", coordinates: input.polygon });
    await prisma.$executeRawUnsafe(
      `UPDATE "delivery_zones" SET "area" = ST_SetSRID(ST_GeomFromGeoJSON($1),4326)::geography WHERE "id" = $2`,
      geojson,
      row.id,
    );
  }
  return row.id;
}

export async function deleteZone(id: string) {
  const found = await prisma.deliveryZone.findUnique({ where: { id } });
  if (!found) throw new AppError("NOT_FOUND", "Zone not found");
  await prisma.deliveryZone.delete({ where: { id } });
  return { deleted: true };
}
