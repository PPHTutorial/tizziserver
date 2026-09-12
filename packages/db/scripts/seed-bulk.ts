/**
 * Synthetic load-volume seed — NOT part of the curated `prisma/seed.ts`.
 *
 * Populates the local dev DB with a large, clearly-tagged layer of fake
 * customers (+ a supply-side slice of vendors/products/orders/reviews) so
 * admin-console pagination, catalog search, and vendor/platform analytics
 * can be exercised at realistic scale. Every row this script writes is
 * identifiable and wipeable:
 *
 *   - bulk customers: phone `+23390100####` .. (id `bu_<n>`)
 *   - bulk vendors:   phone `+23390200####` .. (id `bv_<n>`)
 *   - emails:         `bulk+<n>@loadtest.stall.local`
 *   - product slugs:  `bulk-<n>`, order numbers: `BLK-<n>` / `BLKV-<n>`
 *
 * Deterministic (seeded PRNG) — rerunning without --wipe is a safe no-op
 * (`ON CONFLICT DO NOTHING` on every insert; ids/phones/emails are stable
 * per index). Run:
 *
 *   pnpm --filter @stall/db exec tsx scripts/seed-bulk.ts            # seed
 *   pnpm --filter @stall/db exec tsx scripts/seed-bulk.ts --wipe     # remove only the bulk layer
 *
 * Tune volume via env: BULK_USERS (default 50000), BULK_VENDORS (200),
 * BULK_PRODUCTS_PER_VENDOR (4), BULK_ACTIVE_RATE (0.18 — share of bulk
 * customers who have placed at least one order), BULK_BATCH (2000 rows/
 * INSERT), BULK_SEED (42 — PRNG seed, change for a different dataset).
 */
import path from "node:path";
import { config as loadDotenv } from "dotenv";
import type { Prisma } from "../src/index.ts";

loadDotenv({ path: path.resolve(import.meta.dirname, "../../../.env") });

const { Prisma: P, prisma } = await import("../src/index.ts");

// --- config ----------------------------------------------------------------

const N_USERS = int("BULK_USERS", 50_000);
const N_VENDORS = int("BULK_VENDORS", 200);
const PRODUCTS_PER_VENDOR = int("BULK_PRODUCTS_PER_VENDOR", 4);
const ACTIVE_RATE = float("BULK_ACTIVE_RATE", 0.18);
const BATCH = int("BULK_BATCH", 2000);
const SEED = int("BULK_SEED", 42);
const WIPE = process.argv.includes("--wipe");

function int(key: string, dflt: number): number {
  const v = process.env[key];
  return v ? Math.max(0, Math.trunc(Number(v))) : dflt;
}
function float(key: string, dflt: number): number {
  const v = process.env[key];
  return v ? Number(v) : dflt;
}

// --- deterministic PRNG (mulberry32) ---------------------------------------

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(SEED);
const rand = () => rng();
const randInt = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
const pick = <T,>(arr: readonly T[]): T => arr[randInt(0, arr.length - 1)]!;
function weighted<T,>(pairs: [T, number][]): T {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [v, w] of pairs) {
    r -= w;
    if (r <= 0) return v;
  }
  return pairs[pairs.length - 1]![0];
}
function daysAgo(maxDays: number, minDays = 0): Date {
  const ms = randInt(minDays, maxDays) * 86_400_000 + randInt(0, 86_399_000);
  return new Date(Date.now() - ms);
}

// --- name / place pools (kept small on purpose — this is volume data, not
// content quality; realism only needs to be "plausible at a glance") -------

const FIRST = [
  "Kwame", "Ama", "Kofi", "Akua", "Yaw", "Efua", "Kwabena", "Abena", "Kwaku", "Adwoa",
  "Kojo", "Afia", "Yaw", "Esi", "Nana", "Akosua", "Fiifi", "Adjoa", "Kwasi", "Akoto",
  "Sena", "Selorm", "Elorm", "Naa", "Mawuli", "Delali", "Kekeli", "Abla", "Aku", "Enam",
  "John", "Mary", "David", "Grace", "Samuel", "Comfort", "Emmanuel", "Gifty", "Daniel", "Linda",
];
const LAST = [
  "Mensah", "Owusu", "Boateng", "Asante", "Osei", "Agyeman", "Appiah", "Adjei", "Amoah", "Darko",
  "Sarpong", "Antwi", "Ofori", "Nkrumah", "Tetteh", "Addo", "Yeboah", "Frimpong", "Acheampong", "Gyasi",
  "Ansah", "Bediako", "Quansah", "Aidoo", "Dogbe", "Klutse", "Amenyo", "Attah", "Kufuor", "Danso",
];
const CITIES: [string, number, number][] = [
  ["Accra", 5.6037, -0.187],
  ["Kumasi", 6.6885, -1.6244],
  ["Takoradi", 4.8845, -1.7554],
];
const CATEGORY_SLUGS = ["phones", "laptops", "home-kitchen", "fashion"] as const;
const PRODUCT_NOUNS: Record<(typeof CATEGORY_SLUGS)[number], string[]> = {
  phones: ["Orbit Phone", "Nova Smartphone", "Pulse Handset", "Aria Phone", "Vertex Mobile"],
  laptops: ["Nimbus Laptop", "Stratus Notebook", "Cirrus Ultrabook", "Summit Laptop", "Drift Chromebook"],
  "home-kitchen": ["Blend Master Blender", "Aroma Kettle", "Crisp Air Fryer", "Steady Iron", "Chill Cooler Box"],
  fashion: ["Weave Cotton Shirt", "Stride Sneakers", "Drape Kaftan", "Glide Sandals", "Layer Jacket"],
};

// --- batched raw insert helper ----------------------------------------------

async function insertBatch(
  label: string,
  table: string,
  columns: string[],
  rows: unknown[][],
  batchSize = BATCH,
) {
  if (rows.length === 0) return;
  const cols = P.join(columns.map((c) => P.raw(`"${c}"`)));
  let done = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const values = P.join(chunk.map((r) => P.sql`(${P.join(r)})`));
    await prisma.$executeRaw`INSERT INTO ${P.raw(`"${table}"`)} (${cols}) VALUES ${values} ON CONFLICT DO NOTHING`;
    done += chunk.length;
    process.stdout.write(`\r  ${label}: ${done}/${rows.length}`);
  }
  process.stdout.write("\n");
}

// --- wipe --------------------------------------------------------------------

async function wipe() {
  console.log("Wiping the bulk layer (cascades from users) ...");
  const res = await prisma.$executeRaw`DELETE FROM "users" WHERE "phone" LIKE '+23390%'`;
  console.log(`  deleted ${res} bulk users (cascaded rows removed automatically)`);
}

// --- main --------------------------------------------------------------------

async function main() {
  if (WIPE) {
    await wipe();
    await prisma.$disconnect();
    return;
  }

  console.log(
    `Seeding bulk volume: ${N_USERS} customers, ${N_VENDORS} vendors × ${PRODUCTS_PER_VENDOR} products, ` +
      `~${Math.round(N_USERS * ACTIVE_RATE)} customers with order history (seed=${SEED}).`,
  );
  const t0 = Date.now();

  const grandprice = await prisma.platform.findUnique({ where: { slug: "grandprice" } });
  if (!grandprice) throw new Error("Run `pnpm --filter @stall/db seed` first (no `grandprice` platform found).");
  const cats = await prisma.category.findMany({ where: { slug: { in: [...CATEGORY_SLUGS] } } });
  const catIdBySlug = new Map(cats.map((c) => [c.slug, c.id]));
  for (const slug of CATEGORY_SLUGS) {
    if (!catIdBySlug.has(slug)) throw new Error(`Run \`pnpm --filter @stall/db seed\` first (missing category '${slug}').`);
  }

  // --- 1. bulk customers: users + roles + profiles + addresses -------------
  const userRows: unknown[][] = [];
  const roleRows: unknown[][] = [];
  const profileRows: unknown[][] = [];
  const addressRows: Prisma.Sql[][] = [];
  const custIds: string[] = [];

  for (let i = 1; i <= N_USERS; i++) {
    const id = `bu_${i}`;
    custIds.push(id);
    const first = pick(FIRST);
    const last = pick(LAST);
    const phone = `+233901${String(i).padStart(6, "0")}`;
    const email = `bulk+${i}@loadtest.stall.local`;
    const createdAt = daysAgo(180);
    userRows.push([id, phone, email, first, last, "ACTIVE", "en", createdAt, createdAt]);
    roleRows.push([`bur_${i}`, id, "CUSTOMER", "ACTIVE", createdAt, createdAt, createdAt]);
    profileRows.push([`bcp_${i}`, id, false, createdAt, createdAt]);

    const [city, lat0, lng0] = pick(CITIES);
    const lat = lat0 + (rand() - 0.5) * 0.3;
    const lng = lng0 + (rand() - 0.5) * 0.3;
    addressRows.push([
      P.sql`${`ba_${i}`}`,
      P.sql`${id}`,
      P.sql`${`${first} ${last}`}`,
      P.sql`${phone}`,
      P.sql`${`House ${randInt(1, 400)}, ${pick(["Ring Rd", "Liberation Ave", "Spintex Rd", "Oxford St", "High St"])}`}`,
      P.sql`${city}`,
      P.sql`${"Greater Accra"}`,
      P.sql`${"Ghana"}`,
      P.sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`,
      P.sql`${true}`,
      P.sql`${"HOME"}`,
      P.sql`${createdAt}`,
      P.sql`${createdAt}`,
    ]);
  }

  await insertBatch("users", "users", ["id", "phone", "email", "firstName", "lastName", "status", "locale", "createdAt", "updatedAt"], userRows);
  await insertBatch(
    "user_roles",
    "user_roles",
    ["id", "userId", "role", "status", "activatedAt", "createdAt", "updatedAt"],
    roleRows,
  );
  await insertBatch("customer_profiles", "customer_profiles", ["id", "userId", "marketingOptIn", "createdAt", "updatedAt"], profileRows);

  // addresses need a raw geography expression per row — insert with the
  // pre-built Prisma.sql column values (insertBatch expects unknown[], and
  // Prisma.sql fragments pass through $executeRaw's tagged-template
  // interpolation the same as any other value).
  await insertBatch(
    "addresses",
    "addresses",
    ["id", "userId", "recipientName", "phone", "line1", "city", "region", "country", "location", "isDefault", "kind", "createdAt", "updatedAt"],
    addressRows,
  );

  // --- 2. bulk vendors: users + roles + vendor_profiles ---------------------
  const vUserRows: unknown[][] = [];
  const vRoleRows: unknown[][] = [];
  const vendorRows: unknown[][] = [];
  const vendorIds: string[] = [];

  for (let i = 1; i <= N_VENDORS; i++) {
    const userId = `bvu_${i}`;
    const vendorId = `bv_${i}`;
    vendorIds.push(vendorId);
    const name = `${pick(["Prime", "Metro", "Urban", "Swift", "Golden", "Cedar", "Delta", "Anchor"])} ${pick(["Traders", "Mart", "Store", "Outlet", "Depot", "Gadgets", "Emporium"])} ${i}`;
    const phone = `+233902${String(i).padStart(6, "0")}`;
    const createdAt = daysAgo(180);
    vUserRows.push([userId, phone, `[Bulk] ${name}`, "ACTIVE", "en", createdAt, createdAt]);
    vRoleRows.push([`bvur_${i}`, userId, "VENDOR", "ACTIVE", createdAt, createdAt, createdAt]);
    vendorRows.push([vendorId, userId, `[Bulk] ${name}`, "ACTIVE", createdAt, 0, 0, ["grandprice"], createdAt, createdAt]);
  }

  await insertBatch("vendor users", "users", ["id", "phone", "firstName", "status", "locale", "createdAt", "updatedAt"], vUserRows);
  await insertBatch(
    "vendor user_roles",
    "user_roles",
    ["id", "userId", "role", "status", "activatedAt", "createdAt", "updatedAt"],
    vRoleRows,
  );
  await insertBatch(
    "vendor_profiles",
    "vendor_profiles",
    ["id", "userId", "displayName", "status", "verifiedAt", "ratingAvg", "ratingCount", "platformIds", "createdAt", "updatedAt"],
    vendorRows,
  );

  // --- 3. products + media + offers, PRODUCTS_PER_VENDOR per vendor --------
  const productRows: unknown[][] = [];
  const mediaRows: unknown[][] = [];
  const offerRows: unknown[][] = [];
  // productId -> { vendorId, priceMinor } for order generation below
  const products: { id: string; vendorId: string; offerId: string; priceMinor: number }[] = [];

  let p = 0;
  for (const vendorId of vendorIds) {
    for (let k = 0; k < PRODUCTS_PER_VENDOR; k++) {
      p++;
      const catSlug = pick(CATEGORY_SLUGS);
      const categoryId = catIdBySlug.get(catSlug)!;
      const noun = pick(PRODUCT_NOUNS[catSlug]);
      const title = `${noun} ${pick(["S1", "X2", "Pro", "Lite", "Max", "Mini", "Plus"])}`;
      const slug = `bulk-${p}`;
      const priceMinor = randInt(2000, 500_000);
      const createdAt = daysAgo(180);
      const productId = `bp_${p}`;
      const offerId = `bo_${p}`;

      const ratingAvg = Math.round((3 + rand() * 2) * 10) / 10;
      const ratingCount = randInt(0, 400);
      productRows.push([
        productId,
        vendorId,
        categoryId,
        title,
        slug,
        `${title} — a solid everyday pick in ${noun.split(" ")[0]?.toLowerCase()} gear.`,
        "NEW",
        ["grandprice"],
        ratingAvg,
        ratingCount,
        "PUBLISHED",
        createdAt,
        createdAt,
        createdAt,
      ]);
      mediaRows.push([`bpm_${p}`, productId, "IMAGE", `https://picsum.photos/seed/bulk-${p}/800/800`, 0, createdAt]);
      offerRows.push([offerId, productId, vendorId, priceMinor, "GHS", "NEW", "ACTIVE", createdAt, createdAt]);
      products.push({ id: productId, vendorId, offerId, priceMinor });
    }
  }

  await insertBatch(
    "products",
    "products",
    [
      "id", "vendorId", "categoryId", "title", "slug", "description", "condition",
      "platformSlugs", "ratingAvg", "ratingCount", "status", "publishedAt", "createdAt", "updatedAt",
    ],
    productRows,
  );
  await insertBatch("product_media", "product_media", ["id", "productId", "kind", "fileKey", "sortOrder", "createdAt"], mediaRows);
  await insertBatch(
    "vendor_offers",
    "vendor_offers",
    ["id", "productId", "vendorId", "priceMinor", "currency", "condition", "status", "createdAt", "updatedAt"],
    offerRows,
  );

  // --- 4. orders: a share of customers get 1-3 orders each -----------------
  const productsByVendor = new Map<string, typeof products>();
  for (const prod of products) {
    const list = productsByVendor.get(prod.vendorId) ?? [];
    list.push(prod);
    productsByVendor.set(prod.vendorId, list);
  }

  const orderRows: unknown[][] = [];
  const vendorOrderRows: unknown[][] = [];
  const orderItemRows: unknown[][] = [];
  const fulfilmentRows: unknown[][] = [];
  // for reviews: completed (productId,userId) pairs
  const reviewCandidates: { productId: string; userId: string; createdAt: Date }[] = [];

  type Journey = { orderStatus: string; voStatus: string; fStatus: string; completed: boolean };
  const journeys: [Journey, number][] = [
    [{ orderStatus: "FULFILLED", voStatus: "COMPLETED", fStatus: "COMPLETED", completed: true }, 55],
    [{ orderStatus: "CONFIRMED", voStatus: "READY_FOR_PICKUP", fStatus: "READY", completed: false }, 15],
    [{ orderStatus: "CONFIRMED", voStatus: "PREPARING", fStatus: "PENDING", completed: false }, 10],
    [{ orderStatus: "PLACED", voStatus: "NEW", fStatus: "PENDING", completed: false }, 10],
    [{ orderStatus: "CANCELLED", voStatus: "CANCELLED", fStatus: "CANCELLED", completed: false }, 10],
  ];

  let orderSeq = 0;
  const activeCount = Math.round(N_USERS * ACTIVE_RATE);
  // sample `activeCount` distinct customer indices deterministically
  const activeIdx = new Set<number>();
  while (activeIdx.size < Math.min(activeCount, N_USERS)) activeIdx.add(randInt(1, N_USERS));

  for (const idx of activeIdx) {
    const customerId = `bu_${idx}`;
    const nOrders = randInt(1, 3);
    for (let o = 0; o < nOrders; o++) {
      orderSeq++;
      const vendorId = pick(vendorIds);
      const catalog = productsByVendor.get(vendorId)!;
      const nItems = randInt(1, Math.min(3, catalog.length));
      const chosen = new Set<number>();
      while (chosen.size < nItems) chosen.add(randInt(0, catalog.length - 1));

      const items = [...chosen].map((ci) => {
        const prod = catalog[ci]!;
        const qty = randInt(1, 3);
        return { prod, qty, totalMinor: qty * prod.priceMinor };
      });
      const subtotalMinor = items.reduce((s, it) => s + it.totalMinor, 0);
      const commissionMinor = Math.round(subtotalMinor * 0.12);
      const payoutMinor = subtotalMinor - commissionMinor;
      const method = rand() < 0.7 ? "DELIVERY" : "PICKUP";
      const deliveryFeeMinor = method === "DELIVERY" ? randInt(500, 2500) : 0;

      const j = weighted(journeys);
      const createdAt = daysAgo(89);
      const completedAt = j.completed ? new Date(createdAt.getTime() + randInt(2, 72) * 3_600_000) : null;

      const orderId = `bord_${orderSeq}`;
      const vOrderId = `bvord_${orderSeq}`;

      orderRows.push([
        orderId, `BLK-${orderSeq}`, customerId, "grandprice", j.orderStatus, "GHS",
        subtotalMinor, 0, deliveryFeeMinor, 0, subtotalMinor + deliveryFeeMinor,
        method, createdAt, createdAt, createdAt,
      ]);
      vendorOrderRows.push([
        vOrderId, orderId, vendorId, `BLKV-${orderSeq}`, j.voStatus, "GHS",
        subtotalMinor, 0, commissionMinor, payoutMinor, createdAt, createdAt,
      ]);
      fulfilmentRows.push([`bf_${orderSeq}`, vOrderId, method, j.fStatus, completedAt, createdAt, createdAt]);

      for (let ii = 0; ii < items.length; ii++) {
        const it = items[ii]!;
        orderItemRows.push([
          `boi_${orderSeq}_${ii}`, vOrderId, it.prod.offerId, it.prod.id, `Bulk product ${it.prod.id}`,
          it.qty, it.prod.priceMinor, it.totalMinor,
        ]);
        if (j.completed && rand() < 0.35) {
          reviewCandidates.push({ productId: it.prod.id, userId: customerId, createdAt: completedAt ?? createdAt });
        }
      }
    }
  }

  await insertBatch(
    "orders",
    "orders",
    [
      "id", "number", "customerId", "platformSlug", "status", "currency",
      "itemsSubtotalMinor", "discountMinor", "deliveryFeeMinor", "serviceFeeMinor", "totalMinor",
      "fulfilmentMethod", "placedAt", "createdAt", "updatedAt",
    ],
    orderRows,
  );
  await insertBatch(
    "vendor_orders",
    "vendor_orders",
    ["id", "orderId", "vendorId", "number", "status", "currency", "subtotalMinor", "discountMinor", "commissionMinor", "payoutMinor", "createdAt", "updatedAt"],
    vendorOrderRows,
  );
  await insertBatch(
    "order_items",
    "order_items",
    ["id", "vendorOrderId", "offerId", "productId", "titleSnapshot", "qty", "unitPriceMinor", "totalMinor"],
    orderItemRows,
  );
  await insertBatch(
    "fulfilments",
    "fulfilments",
    ["id", "vendorOrderId", "method", "status", "completedAt", "createdAt", "updatedAt"],
    fulfilmentRows,
  );

  // --- 5. reviews: dedupe on (productId, userId) ----------------------------
  const seen = new Set<string>();
  const reviewRows: unknown[][] = [];
  let rSeq = 0;
  for (const c of reviewCandidates) {
    const key = `${c.productId}:${c.userId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rSeq++;
    const rating = weighted<number>([
      [5, 45], [4, 30], [3, 15], [2, 6], [1, 4],
    ]);
    reviewRows.push([
      `brev_${rSeq}`, c.productId, c.userId, rating,
      pick(["Great value", "Does the job", "Would buy again", "As described", "Happy with this"]),
      pick([
        "Arrived on time and works as expected.",
        "Good quality for the price.",
        "Exactly what I needed.",
        "Delivery was quick, product is solid.",
        "No complaints so far.",
      ]),
      c.createdAt, c.createdAt,
    ]);
  }
  await insertBatch("product_reviews", "product_reviews", ["id", "productId", "userId", "rating", "title", "body", "createdAt", "updatedAt"], reviewRows);

  // --- summary -----------------------------------------------------------
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\nDone in ${secs}s:`);
  console.log(`  ${N_USERS} customers, ${N_VENDORS} vendors, ${products.length} products`);
  console.log(`  ${orderRows.length} orders / ${orderItemRows.length} order items, ${reviewRows.length} reviews`);
  console.log(`\nWipe later with: pnpm --filter @stall/db exec tsx scripts/seed-bulk.ts --wipe`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
