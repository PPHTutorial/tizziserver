/**
 * Courier live-presence index for dispatch shortlisting.
 *
 * Primary path: Redis GEO (`GEOSEARCH`) — fast radius queries over online
 * couriers, refreshed by the `/tracking` realtime namespace and the online
 * toggle. Fallback path (no Redis): PostGIS `ST_DWithin` over
 * `CourierProfile.lastLocation` filtered to `onlineStatus = ONLINE`.
 */
import { prisma, type VehicleKind } from "@stall/db";
import { getRedis } from "../redis.ts";
import { haversineM, type LatLng } from "../maps/index.ts";

const geoKey = (platformSlug: string) => `stall:couriers:${platformSlug}`;
const metaKey = (courierId: string) => `stall:courier:${courierId}`;
const PRESENCE_TTL_S = 90;

export interface CourierPresence {
  courierId: string;
  lat: number;
  lng: number;
  distanceM: number;
  vehicleType: VehicleKind;
}

/** Record a courier's position + mark them dispatchable for `PRESENCE_TTL_S`. */
export async function upsertCourierPresence(input: {
  courierId: string;
  platformSlug: string;
  lat: number;
  lng: number;
  vehicleType: VehicleKind;
  onJob?: boolean;
}): Promise<void> {
  const redis = getRedis();
  if (redis) {
    const meta = metaKey(input.courierId);
    await redis
      .multi()
      .geoadd(geoKey(input.platformSlug), input.lng, input.lat, input.courierId)
      .hset(meta, {
        vehicleType: input.vehicleType,
        onJob: input.onJob ? "1" : "0",
        lat: String(input.lat),
        lng: String(input.lng),
        at: String(Date.now()),
      })
      .expire(meta, PRESENCE_TTL_S)
      .exec()
      .catch(() => {});
  }
  // Always keep the DB projection warm for the fallback path + analytics.
  await prisma.$executeRawUnsafe(
    `UPDATE "courier_profiles"
       SET "lastLocation" = ST_SetSRID(ST_MakePoint($1,$2),4326)::geography,
           "lastLocationAt" = now()
     WHERE "id" = $3`,
    input.lng,
    input.lat,
    input.courierId,
  );
}

/** Drop a courier from the dispatch index (going offline / on a job elsewhere). */
export async function removeCourierPresence(courierId: string, platformSlug: string): Promise<void> {
  const redis = getRedis();
  if (redis) {
    await redis
      .multi()
      .zrem(geoKey(platformSlug), courierId)
      .del(metaKey(courierId))
      .exec()
      .catch(() => {});
  }
}

interface ShortlistOpts {
  platformSlug: string;
  point: LatLng;
  radiusM: number;
  limit: number;
  vehicleTypes?: VehicleKind[];
  excludeCourierIds?: string[];
}

/** Ranked (nearest-first) online couriers within `radiusM` of `point`. */
export async function shortlistCouriers(opts: ShortlistOpts): Promise<CourierPresence[]> {
  const exclude = new Set(opts.excludeCourierIds ?? []);
  const redis = getRedis();

  let raw: CourierPresence[] = [];
  if (redis) {
    try {
      const rows = (await redis.geosearch(
        geoKey(opts.platformSlug),
        "FROMLONLAT",
        opts.point.lng,
        opts.point.lat,
        "BYRADIUS",
        opts.radiusM,
        "m",
        "ASC",
        "COUNT",
        opts.limit * 3,
        "WITHCOORD",
        "WITHDIST",
      )) as [string, string, [string, string]][];
      const metas = await Promise.all(rows.map(([id]) => redis.hgetall(metaKey(id)).catch(() => ({}))));
      raw = rows.map(([id, dist, [lng, lat]], i) => ({
        courierId: id,
        lat: Number(lat),
        lng: Number(lng),
        distanceM: Math.round(Number(dist)),
        vehicleType: ((metas[i] as Record<string, string>)?.vehicleType as VehicleKind) ?? "MOTORBIKE",
      }));
    } catch {
      raw = [];
    }
  }

  if (raw.length === 0) {
    // Fallback: PostGIS radius query over the DB projection.
    const rows = await prisma.$queryRawUnsafe<
      { id: string; lat: number; lng: number; distance_m: number }[]
    >(
      `SELECT cp."id",
              ST_Y(cp."lastLocation"::geometry) AS lat,
              ST_X(cp."lastLocation"::geometry) AS lng,
              ST_Distance(cp."lastLocation", ST_SetSRID(ST_MakePoint($1,$2),4326)::geography) AS distance_m
         FROM "courier_profiles" cp
        WHERE cp."onlineStatus" = 'ONLINE'
          AND cp."status" = 'ACTIVE'
          AND cp."lastLocation" IS NOT NULL
          AND cp."lastLocationAt" > now() - interval '5 minutes'
          AND ST_DWithin(cp."lastLocation", ST_SetSRID(ST_MakePoint($1,$2),4326)::geography, $3)
        ORDER BY distance_m ASC
        LIMIT $4`,
      opts.point.lng,
      opts.point.lat,
      opts.radiusM,
      opts.limit * 3,
    );
    const vehicleById = new Map(
      (
        await prisma.courierProfile.findMany({
          where: { id: { in: rows.map((r) => r.id) } },
          select: { id: true, activeVehicleId: true, vehicles: { select: { id: true, type: true } } },
        })
      ).map((c) => [c.id, c.vehicles.find((v) => v.id === c.activeVehicleId)?.type ?? c.vehicles[0]?.type ?? "MOTORBIKE"]),
    );
    raw = rows.map((r) => ({
      courierId: r.id,
      lat: r.lat,
      lng: r.lng,
      distanceM: Math.round(r.distance_m),
      vehicleType: (vehicleById.get(r.id) as VehicleKind) ?? "MOTORBIKE",
    }));
  }

  return raw
    .filter((c) => !exclude.has(c.courierId))
    .filter((c) => !opts.vehicleTypes || opts.vehicleTypes.includes(c.vehicleType))
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, opts.limit);
}

/** Straight-line distance helper re-exported for ranking tie-breaks. */
export { haversineM };
