import { prisma } from "@stall/db";
import { clampLimit } from "./util.ts";
import { activeAuctionsFor, cardDescription, type ProductCard } from "./products.ts";

export interface SearchInput {
  platformSlug: string;
  q: string;
  minPriceMinor?: number;
  maxPriceMinor?: number;
  categorySlug?: string;
  sort?: "relevance" | "price_asc" | "price_desc" | "newest";
  page?: number;
  limit?: number;
}

interface SearchRow {
  id: string;
  slug: string;
  title: string;
  brand: string | null;
  description: string | null;
  ratingAvg: number;
  ratingCount: number;
  image: string | null;
  fromPriceMinor: number | null;
  offerCount: bigint | number;
  vendorCount: bigint | number;
}

/**
 * Full-text (weighted `tsvector`) OR trigram-similarity match, ranked. Falls
 * through gracefully for typos via `pg_trgm`.
 */
export async function searchProducts(input: SearchInput): Promise<{
  items: ProductCard[];
  page: number;
  limit: number;
  total: number;
}> {
  const limit = clampLimit(input.limit);
  const page = Math.max(1, Math.trunc(input.page ?? 1));
  const offset = (page - 1) * limit;
  const q = input.q.trim();

  if (!q) return { items: [], page, limit, total: 0 };

  const orderSql =
    input.sort === "price_asc"
      ? `"fromPriceMinor" ASC NULLS LAST`
      : input.sort === "price_desc"
        ? `"fromPriceMinor" DESC NULLS LAST`
        : input.sort === "newest"
          ? `p."publishedAt" DESC`
          : `rank DESC, sim DESC, p."publishedAt" DESC`;

  const rows = await prisma.$queryRawUnsafe<(SearchRow & { rank: number; sim: number })[]>(
    `
    SELECT p.id, p.slug, p.title, p.brand, p.description, p."ratingAvg", p."ratingCount",
      (SELECT m."fileKey" FROM product_media m WHERE m."productId" = p.id ORDER BY m."sortOrder" ASC LIMIT 1) AS image,
      (SELECT MIN(o."priceMinor") FROM vendor_offers o WHERE o."productId" = p.id AND o.status = 'ACTIVE') AS "fromPriceMinor",
      (SELECT COUNT(*) FROM vendor_offers o WHERE o."productId" = p.id AND o.status = 'ACTIVE') AS "offerCount",
      (SELECT COUNT(DISTINCT o."vendorId") FROM vendor_offers o WHERE o."productId" = p.id AND o.status = 'ACTIVE') AS "vendorCount",
      ts_rank(p."searchVector", websearch_to_tsquery('simple', $2)) AS rank,
      similarity(p.title, $2) AS sim
    FROM products p
    LEFT JOIN categories c ON c.id = p."categoryId"
    WHERE p.status = 'PUBLISHED' AND p."deletedAt" IS NULL
      AND (cardinality(p."platformSlugs") = 0 OR $1 = ANY(p."platformSlugs"))
      AND (p."searchVector" @@ websearch_to_tsquery('simple', $2) OR p.title % $2 OR COALESCE(p.brand,'') % $2)
      AND ($3::int IS NULL OR $3 = 0 OR c.id IN (SELECT id FROM categories WHERE path = $4 OR path LIKE $4 || '/%'))
      AND ($5::int IS NULL OR (SELECT MIN(o."priceMinor") FROM vendor_offers o WHERE o."productId" = p.id AND o.status='ACTIVE') >= $5)
      AND ($6::int IS NULL OR (SELECT MIN(o."priceMinor") FROM vendor_offers o WHERE o."productId" = p.id AND o.status='ACTIVE') <= $6)
    ORDER BY ${orderSql}
    LIMIT $7 OFFSET $8
    `,
    input.platformSlug,
    q,
    input.categorySlug ? 1 : 0,
    input.categorySlug ? `/${input.categorySlug}` : "",
    input.minPriceMinor ?? null,
    input.maxPriceMinor ?? null,
    limit,
    offset,
  );

  const totalRows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `
    SELECT COUNT(*)::bigint AS n
    FROM products p
    WHERE p.status = 'PUBLISHED' AND p."deletedAt" IS NULL
      AND (cardinality(p."platformSlugs") = 0 OR $1 = ANY(p."platformSlugs"))
      AND (p."searchVector" @@ websearch_to_tsquery('simple', $2) OR p.title % $2 OR COALESCE(p.brand,'') % $2)
    `,
    input.platformSlug,
    q,
  );

  const auctions = await activeAuctionsFor(rows.map((r) => r.id));
  const items: ProductCard[] = rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    brand: r.brand,
    description: cardDescription(r.description),
    image: r.image,
    ratingAvg: r.ratingAvg,
    ratingCount: r.ratingCount,
    fromPriceMinor: r.fromPriceMinor == null ? null : Number(r.fromPriceMinor),
    currency: "GHS",
    offerCount: Number(r.offerCount),
    vendorCount: Number(r.vendorCount),
    activeAuction: auctions.get(r.id) ?? null,
  }));

  return { items, page, limit, total: Number(totalRows[0]?.n ?? 0) };
}

export interface NearbyVendor {
  id: string;
  displayName: string;
  logo: string | null;
  ratingAvg: number;
  ratingCount: number;
  distanceM: number;
  /** Business location, WGS84. Present whenever the vendor has a geocoded address. */
  lat: number | null;
  lng: number | null;
}

/** Vendors with a business location within `radiusM` of a point (PostGIS). */
export async function nearbyVendors(input: {
  platformSlug: string;
  lat: number;
  lng: number;
  radiusM?: number;
  limit?: number;
}): Promise<NearbyVendor[]> {
  const radius = Math.min(Math.max(input.radiusM ?? 5000, 100), 50_000);
  const limit = clampLimit(input.limit, 20, 50);

  const rows = await prisma.$queryRawUnsafe<
    (Omit<NearbyVendor, "distanceM" | "lat" | "lng"> & { distanceM: number; lat: number | null; lng: number | null })[]
  >(
    `
    SELECT vp.id, vp."displayName", vp.logo, vp."ratingAvg", vp."ratingCount",
      ST_Distance(b.location, ST_SetSRID(ST_MakePoint($3, $2), 4326)::geography) AS "distanceM",
      ST_Y(b.location::geometry) AS lat,
      ST_X(b.location::geometry) AS lng
    FROM vendor_profiles vp
    JOIN businesses b ON b."vendorId" = vp.id
    WHERE vp.status = 'ACTIVE'
      AND $1 = ANY(vp."platformIds")
      AND b.location IS NOT NULL
      AND ST_DWithin(b.location, ST_SetSRID(ST_MakePoint($3, $2), 4326)::geography, $4)
    ORDER BY "distanceM" ASC
    LIMIT $5
    `,
    input.platformSlug,
    input.lat,
    input.lng,
    radius,
    limit,
  );
  return rows.map((r) => ({
    ...r,
    distanceM: Math.round(Number(r.distanceM)),
    lat: r.lat == null ? null : Number(r.lat),
    lng: r.lng == null ? null : Number(r.lng),
  }));
}
