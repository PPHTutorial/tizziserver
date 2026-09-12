/**
 * Maps — server-side geo helpers + a Directions / Distance-Matrix proxy.
 *
 * When `GOOGLE_MAPS_API_KEY` is set, route estimates come from the Google
 * Distance Matrix API and are cached in Redis (`MAPS_CACHE_TTL_SECONDS`).
 * Otherwise a haversine distance with a road-winding factor and a fixed average
 * speed (`MAPS_AVG_SPEED_KMH`) is used — good enough for dev and for the B5
 * blocker window. The call sites don't care which path ran.
 */
import { env } from "@stall/config";
import { getRedis } from "../redis.ts";

export interface LatLng {
  lat: number;
  lng: number;
}

/** Accra city centre — the platform-wide fallback point for dev / missing geo. */
export const DEFAULT_LATLNG: LatLng = { lat: 5.6037, lng: -0.187 };

export interface RouteEstimate {
  distanceM: number;
  durationS: number;
  /** Google-encoded polyline of the road route; null on the haversine fallback. */
  polyline: string | null;
  source: "google" | "osrm" | "haversine";
}

const R_EARTH_M = 6_371_000;
const ROAD_WINDING_FACTOR = 1.32; // straight-line → plausible driving distance

const toRad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in metres. */
export function haversineM(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R_EARTH_M * Math.asin(Math.sqrt(h)));
}

/** Initial bearing a→b in degrees (0 = north, clockwise). */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return (Math.atan2(y, x) * 180) / Math.PI;
}

function fallbackRoute(origin: LatLng, dest: LatLng): RouteEstimate {
  const straight = haversineM(origin, dest);
  const distanceM = Math.round(straight * ROAD_WINDING_FACTOR);
  const speedMs = (env.MAPS_AVG_SPEED_KMH * 1000) / 3600;
  const durationS = Math.max(60, Math.round(distanceM / speedMs));
  return { distanceM, durationS, polyline: null, source: "haversine" };
}

const cacheKey = (o: LatLng, d: LatLng) =>
  `maps:route:${o.lat.toFixed(4)},${o.lng.toFixed(4)}:${d.lat.toFixed(4)},${d.lng.toFixed(4)}`;

async function googleRoute(origin: LatLng, dest: LatLng): Promise<RouteEstimate | null> {
  const key = env.GOOGLE_MAPS_API_KEY;
  if (!key) return null;
  const url = new URL("https://maps.googleapis.com/maps/api/distancematrix/json");
  url.searchParams.set("origins", `${origin.lat},${origin.lng}`);
  url.searchParams.set("destinations", `${dest.lat},${dest.lng}`);
  url.searchParams.set("mode", "driving");
  url.searchParams.set("key", key);
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    const json = (await res.json()) as {
      rows?: { elements?: { status?: string; distance?: { value: number }; duration?: { value: number } }[] }[];
    };
    const el = json.rows?.[0]?.elements?.[0];
    if (!el || el.status !== "OK" || !el.distance || !el.duration) return null;
    return {
      distanceM: el.distance.value,
      durationS: el.duration.value,
      polyline: null,
      source: "google",
    };
  } catch {
    return null;
  }
}

async function osrmRoute(origin: LatLng, dest: LatLng): Promise<RouteEstimate | null> {
  if (!env.OSRM_URL) return null;
  const coords = `${origin.lng},${origin.lat};${dest.lng},${dest.lat}`;
  const url = `${env.OSRM_URL.replace(/\/$/, "")}/route/v1/driving/${coords}?overview=full&geometries=polyline`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    const json = (await res.json()) as {
      code?: string;
      routes?: { distance?: number; duration?: number; geometry?: string }[];
    };
    const r = json.routes?.[0];
    if (json.code !== "Ok" || !r || r.distance == null || r.duration == null || !r.geometry) return null;
    return {
      distanceM: Math.round(r.distance),
      durationS: Math.max(60, Math.round(r.duration)),
      polyline: r.geometry,
      source: "osrm",
    };
  } catch {
    return null;
  }
}

/** Distance + duration + road polyline between two points, cached, provider-or-fallback. */
export async function estimateRoute(origin: LatLng, dest: LatLng): Promise<RouteEstimate> {
  const redis = getRedis();
  const k = cacheKey(origin, dest);
  if (redis) {
    const hit = await redis.get(k).catch(() => null);
    if (hit) {
      try {
        return JSON.parse(hit) as RouteEstimate;
      } catch {
        /* fall through */
      }
    }
  }
  const estimate = (await googleRoute(origin, dest)) ?? (await osrmRoute(origin, dest)) ?? fallbackRoute(origin, dest);
  if (redis) {
    await redis.set(k, JSON.stringify(estimate), "EX", env.MAPS_CACHE_TTL_SECONDS).catch(() => {});
  }
  return estimate;
}

/**
 * A coarse, PII-safe area label for a point — used on the courier job feed
 * before a courier accepts. Falls back to a ~1 km rounded grid string.
 */
export function coarseAreaLabel(p: LatLng, zoneName?: string | null): string {
  if (zoneName) return zoneName;
  return `~${p.lat.toFixed(2)}, ${p.lng.toFixed(2)}`;
}

/** ETA timestamp `durationS` from now. */
export const etaFrom = (durationS: number, from = new Date()): Date =>
  new Date(from.getTime() + durationS * 1000);
