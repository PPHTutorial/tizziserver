/**
 * Brand logos — auto-illustrates the free-text `Product.brand` field (and any
 * future brand filter chip) instead of leaving every non-curated brand on the
 * client's plain initials tile.
 *
 * Resolution order per brand name: a small curated domain map (instant, free,
 * always-correct for the obvious cases) → a DB cache shared across every
 * vendor who's ever typed this brand (`BrandLogo`) → the Brandfetch Search
 * API (`BRANDFETCH_API_KEY`, server-only — never sent to the client) → give
 * up and cache the miss so garbage input isn't re-queried on every save.
 * The actual image always comes from Brandfetch's public CDN "Logo Link"
 * (`BRANDFETCH_CLIENT_ID`, safe to be a hotlink parameter), so the DB only
 * ever needs to remember a domain.
 */
import { prisma } from "@stall/db";
import { env } from "@stall/config";

export interface BrandLogo {
  name: string;
  logoUrl: string | null;
}

export function normalizeBrandKey(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Common brands mapped straight to their domain — covers the obvious
 * marketplace staples without spending a Brandfetch lookup on them. */
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

function cdnLogoUrl(domain: string): string {
  const clientId = env.BRANDFETCH_CLIENT_ID;
  return clientId ? `https://cdn.brandfetch.io/${domain}?c=${clientId}` : `https://cdn.brandfetch.io/${domain}`;
}

async function searchBrandfetch(name: string): Promise<string | null> {
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

/** Resolve one brand name to a logo URL, writing through the DB cache. */
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

  const domain = CURATED_DOMAINS[key] ?? (await searchBrandfetch(name));
  const logoUrl = domain ? cdnLogoUrl(domain) : null;
  const source = CURATED_DOMAINS[key] ? "curated" : domain ? "brandfetch" : "none";

  await prisma.brandLogo.upsert({
    where: { key },
    create: { key, name, domain, logoUrl, source },
    update: { name, domain, logoUrl, source, fetchedAt: new Date() },
  });

  return { name, logoUrl };
}

/** Resolve many brand names at once (e.g. a product grid's distinct
 * brands) — cache hits cost one DB read each; only genuine first-time
 * misses ever reach Brandfetch. */
export async function resolveBrandLogos(names: string[]): Promise<BrandLogo[]> {
  const unique = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean)));
  return Promise.all(unique.map(resolveBrandLogo));
}
