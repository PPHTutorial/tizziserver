/**
 * Brand logos — auto-illustrates the free-text `Product.brand` field (and any
 * future brand filter chip) instead of leaving every non-curated brand on the
 * client's plain initials tile.
 *
 * Resolution order per brand name: a DB cache shared across every vendor
 * who's ever typed this brand (`BrandLogo`) → a curated domain map (instant,
 * free, always-correct for the obvious cases) → the Brandfetch Search API to
 * find the domain → the Brandfetch Brand API for that domain's logo variants
 * (`BRANDFETCH_API_KEY`, server-only — never sent to the client).
 *
 * On first resolution every variant Brandfetch returns (icon/logo × light/
 * dark theme) is downloaded and re-hosted in our own object storage — from
 * then on we serve our own copy and never call Brandfetch again for that
 * brand, cache miss or hit. A "nothing found" result is cached too (with a
 * TTL) so garbage input isn't re-queried on every product save.
 */
import { prisma } from "@stall/db";
import { env } from "@stall/config";
import { storageProvider } from "../storage/index.ts";

export interface BrandLogo {
  name: string;
  logoUrl: string | null;
}

export interface BrandLogoVariant {
  type: string;
  theme: string;
  format: string;
  key: string;
  width: number | null;
  height: number | null;
}

export function normalizeBrandKey(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Common brands mapped straight to their domain — covers the obvious
 * marketplace staples without spending a Brandfetch search on them (the
 * Brand API + storage download below still runs for these). */
const CURATED_DOMAINS: Record<string, string> = {
  samsung: "samsung.com",
  apple: "apple.com",
  lg: "lg.com",
  htc: "htc.com",
  hyundai: "hyundai.com",
  toyota: "toyota.com",
  sony: "sony.com",
  nokia: "nokia.com",
  huawei: "huawei.com",
  xiaomi: "mi.com",
  oppo: "oppo.com",
  vivo: "vivo.com",
  tecno: "tecno-mobile.com",
  infinix: "infinixmobility.com",
  itel: "itel-mobile.com",
  nike: "nike.com",
  adidas: "adidas.com",
  dell: "dell.com",
  hp: "hp.com",
  lenovo: "lenovo.com",
  asus: "asus.com",
  acer: "acer.com",
  microsoft: "microsoft.com",
  google: "google.com",
  philips: "philips.com",
  panasonic: "panasonic.com",
  nissan: "nissan.com",
  honda: "honda.com",
  kia: "kia.com",
  ford: "ford.com",
  mercedesbenz: "mercedes-benz.com",
  bmw: "bmw.com",
  volkswagen: "vw.com",
  toshiba: "toshiba.com",
  jbl: "jbl.com",
  bose: "bose.com",
  canon: "canon.com",
  nikon: "nikon.com",
  whirlpool: "whirlpool.com",
  bosch: "bosch.com",
};

/** Re-attempt a "nothing found" brand after this long — a typo or an
 * unlisted brand at signup time might be a real, findable one later. */
const NEGATIVE_TTL_DAYS = 30;

// --- Brandfetch (server-only; results are re-hosted, never re-fetched) ----

interface RawFormat {
  src: string;
  format: string;
  width?: number | null;
  height?: number | null;
}
interface RawLogo {
  type?: string;
  theme?: string;
  formats?: RawFormat[];
}

async function searchBrandfetchDomain(name: string): Promise<string | null> {
  const key = env.BRANDFETCH_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`https://api.brandfetch.io/v2/search/${encodeURIComponent(name)}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const results = (await res.json()) as { domain?: string }[];
    return results[0]?.domain ?? null;
  } catch {
    return null;
  }
}

async function fetchBrandfetchLogos(domain: string): Promise<RawLogo[]> {
  const key = env.BRANDFETCH_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch(`https://api.brandfetch.io/v2/brands/${encodeURIComponent(domain)}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { logos?: RawLogo[] };
    return json.logos ?? [];
  } catch {
    return [];
  }
}

/** Raster formats only — the mobile client renders via `Image.network`,
 * which can't decode SVG. Preferred order: png (lossless, transparent) >
 * webp > jpeg. */
const RASTER_PRIORITY = ["png", "webp", "jpeg", "jpg"];

function pickRasterFormat(formats: RawFormat[]): RawFormat | null {
  for (const fmt of RASTER_PRIORITY) {
    const hit = formats.find((f) => f.format?.toLowerCase() === fmt);
    if (hit) return hit;
  }
  return null;
}

const EXT_FOR_FORMAT: Record<string, string> = { png: "png", webp: "webp", jpeg: "jpg", jpg: "jpg" };
const CONTENT_TYPE_FOR_FORMAT: Record<string, string> = {
  png: "image/png",
  webp: "image/webp",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
};

/** Download one Brandfetch-hosted image and re-host it under our own
 * storage key — the whole point being we never hit `src` (Brandfetch) again. */
async function downloadAndStore(src: string, key: string, format: string): Promise<string | null> {
  try {
    const res = await fetch(src, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const body = Buffer.from(await res.arrayBuffer());
    const contentType = CONTENT_TYPE_FOR_FORMAT[format.toLowerCase()] ?? "application/octet-stream";
    await storageProvider().putObject(key, body, contentType);
    return key;
  } catch {
    return null;
  }
}

/** Download + store every theme/type variant Brandfetch returned for a
 * domain, one storage object per variant. */
async function materializeVariants(brandKey: string, logos: RawLogo[]): Promise<BrandLogoVariant[]> {
  const variants: BrandLogoVariant[] = [];
  for (const logo of logos) {
    const format = pickRasterFormat(logo.formats ?? []);
    if (!format) continue; // svg-only entry — nothing our client can render yet
    const type = logo.type ?? "logo";
    const theme = logo.theme ?? "default";
    const ext = EXT_FOR_FORMAT[format.format.toLowerCase()] ?? "bin";
    const storageKey = await downloadAndStore(format.src, `brand-logos/${brandKey}/${type}-${theme}.${ext}`, format.format);
    if (storageKey) {
      variants.push({
        type,
        theme,
        format: format.format,
        key: storageKey,
        width: format.width ?? null,
        height: format.height ?? null,
      });
    }
  }
  return variants;
}

/** The one variant a simple `logoUrl`-only consumer gets by default —
 * prefer a full logo over a bare icon, and a light theme (most UI is
 * light-background) over dark. */
function pickPrimary(variants: BrandLogoVariant[]): BrandLogoVariant | null {
  const score = (v: BrandLogoVariant) =>
    (v.type === "logo" ? 2 : 0) + (v.theme === "light" ? 1 : 0);
  return variants.slice().sort((a, b) => score(b) - score(a))[0] ?? null;
}

// --- public API -----------------------------------------------------------

/** Resolve one brand name to a logo, writing through the DB cache. Returned
 * `logoUrl` is a storage key (like every other image key in this API),
 * resolved to a servable URL client-side the same way product images are. */
export async function resolveBrandLogo(rawName: string): Promise<BrandLogo> {
  const name = rawName.trim();
  const key = normalizeBrandKey(name);
  if (!key) return { name, logoUrl: null };

  const cached = await prisma.brandLogo.findUnique({ where: { key } });
  if (cached) {
    const isStaleMiss =
      cached.logoUrl == null && Date.now() - cached.fetchedAt.getTime() > NEGATIVE_TTL_DAYS * 86_400_000;
    if (!isStaleMiss) return { name: cached.name, logoUrl: cached.logoUrl };
  }

  const domain = CURATED_DOMAINS[key] ?? (await searchBrandfetchDomain(name));
  if (!domain) {
    await prisma.brandLogo.upsert({
      where: { key },
      create: { key, name, domain: null, logoUrl: null, variants: [], source: "none" },
      update: { name, domain: null, logoUrl: null, variants: [], source: "none", fetchedAt: new Date() },
    });
    return { name, logoUrl: null };
  }

  const rawLogos = await fetchBrandfetchLogos(domain);
  const variants = await materializeVariants(key, rawLogos);
  const primary = pickPrimary(variants);
  const logoUrl = primary?.key ?? null;
  const source = variants.length ? "brandfetch" : "none";

  await prisma.brandLogo.upsert({
    where: { key },
    create: { key, name, domain, logoUrl, variants: variants as unknown as object[], source },
    update: { name, domain, logoUrl, variants: variants as unknown as object[], source, fetchedAt: new Date() },
  });

  return { name, logoUrl };
}

/** Resolve many brand names at once (e.g. a product grid's distinct
 * brands) — cache hits cost one DB read each; only genuine first-time
 * misses ever reach Brandfetch, and each of those is stored so it never
 * happens again for that brand. */
export async function resolveBrandLogos(names: string[]): Promise<BrandLogo[]> {
  const unique = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean)));
  return Promise.all(unique.map(resolveBrandLogo));
}

export interface BrandCandidate {
  name: string;
  domain: string;
  /** Brandfetch-hosted icon URL for live-typeahead preview only — small and
   * disposable, so unlike `resolveBrandLogo` this is never downloaded/
   * re-hosted here. We only pay the storage cost once the vendor actually
   * commits to a brand and `resolveBrandLogo` runs for it. */
  icon: string | null;
}

/** Search-as-you-type brand suggestions, backed by the Brandfetch Search
 * API (already used internally by `resolveBrandLogo` for single-name
 * resolution) — this is what lets the product-editor brand field offer
 * real suggestions instead of a free-text field, without us owning a
 * brand-name dataset. Returns [] (not an error) when unconfigured, too
 * short a query, or the upstream call fails — callers should treat "no
 * suggestions" as a normal, silent outcome. */
export async function searchBrandCandidates(rawQuery: string, limit = 10): Promise<BrandCandidate[]> {
  const query = rawQuery.trim();
  if (query.length < 2) return [];
  const key = env.BRANDFETCH_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch(`https://api.brandfetch.io/v2/search/${encodeURIComponent(query)}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return [];
    const results = (await res.json()) as { name?: string; domain?: string; icon?: string }[];
    return results
      .filter((r): r is { name: string; domain: string; icon?: string } => !!r.name && !!r.domain)
      .slice(0, limit)
      .map((r) => ({ name: r.name, domain: r.domain, icon: r.icon ?? null }));
  } catch {
    return [];
  }
}
