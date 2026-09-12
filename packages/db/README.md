# @stall/db

Prisma 7 schema + client for Stall. See `docs/02-DATA-MODEL.md`.

## Scripts

| cmd | what |
|---|---|
| `pnpm --filter @stall/db generate` | regenerate `src/generated/` |
| `pnpm --filter @stall/db migrate` | `prisma migrate dev` (interactive; dev only) |
| `pnpm --filter @stall/db migrate:deploy` | apply pending migrations (CI / prod) |
| `pnpm --filter @stall/db seed` | Domain-0 seed (platforms, flags, currencies) |
| `pnpm --filter @stall/db seed:bulk` | synthetic load-volume layer — 50k+ customers, vendors, orders, reviews (see below) |
| `pnpm --filter @stall/db seed:bulk:wipe` | remove only the bulk layer, curated seed data untouched |
| `pnpm --filter @stall/db studio` | Prisma Studio |

## Load-volume seed (`scripts/seed-bulk.ts`)

A separate, non-idempotent-in-content but *rerun-safe* script for stress-testing pagination,
full-text search, and analytics aggregates at real scale — not part of the curated
`prisma/seed.ts`. Run `pnpm --filter @stall/db seed` first (it needs the `grandprice` platform
and its leaf categories to exist). Defaults to 50,000 customers, 200 vendors × 4 products each,
~18k orders across a realistic status mix, and reviews on ~35% of completed order items — all
generated in-process with a seeded PRNG (deterministic, tune via `BULK_SEED`) and written via
batched raw `INSERT ... ON CONFLICT DO NOTHING` (the full default run takes well under a minute).
Every row is tagged for easy identification and clean removal: customer phones `+233901######`,
vendor phones `+233902######`, emails `bulk+<n>@loadtest.stall.local`, product slugs `bulk-<n>`,
order numbers `BLK-<n>`/`BLKV-<n>`. Tune volume via env — `BULK_USERS`, `BULK_VENDORS`,
`BULK_PRODUCTS_PER_VENDOR`, `BULK_ACTIVE_RATE` (share of customers with order history),
`BULK_BATCH` (rows per INSERT). `seed:bulk:wipe` deletes only rows matching the bulk phone
prefixes — the curated seed data is a separate, untouched set of rows throughout.

**Wipe before running `packages/core`'s test suite.** `catalog.test.ts`/`promotions.test.ts`
assert on specific curated slugs showing up in unbounded/limited category and search queries
(e.g. `similarProducts`, full-text search) — with the bulk layer's ~800 same-category products
also live, those queries legitimately return bulk rows instead and the assertions fail. This
isn't a code bug, just the two data sets not being isolated from each other; `seed:bulk:wipe`
before `pnpm --filter @stall/core test`, then re-seed bulk afterward if you still want it for
manual exploration.

## PostGIS geo columns — **manual DDL**

`geography(Point/Polygon, 4326)` columns are modelled as `Unsupported(...)`. Prisma cannot
represent their **GiST indexes**, so every `prisma migrate dev` run emits spurious
`DROP INDEX` for them and can't create new ones.

**Workflow for geo changes:**

1. Edit `schema.prisma` as usual.
2. Generate the SQL without applying:
   `prisma migrate dev --name <n> --create-only`
3. **Delete any `DROP INDEX "..._gist"` lines** from the generated `migration.sql`.
4. If you added/changed a geo column, hand-add its index:
   `CREATE INDEX "<table>_<col>_gist" ON "<table>" USING GIST ("<col>");`
   (and `CREATE EXTENSION IF NOT EXISTS postgis;` in the very first migration only).
5. `prisma migrate deploy`.

The 5 baseline GiST indexes live in `migrations/20260901191354_init/migration.sql`:
`addresses.location`, `saved_locations.location`, `businesses.location`,
`courier_profiles.lastLocation`, `courier_service_areas.area`.

## Product search — **manual DDL** (`20260901231947_catalog_domain3`)

`Product.searchVector` is `Unsupported("tsvector")`. The migration hand-adds:

- `CREATE EXTENSION pg_trgm`
- `products_search_vector_refresh()` + a `BEFORE INSERT/UPDATE` trigger that rebuilds
  `searchVector` from `title` (weight A) / `brand` (B) / `description` (C)
- GIN indexes: `products_search_vector_gin`, `products_title_trgm`, `products_brand_trgm`

Query it from `@stall/core/catalog` via `$queryRawUnsafe` (`websearch_to_tsquery('simple', …)`
with a `title % :q` trigram fallback). If you add searchable columns, extend the trigger
function and the `UPDATE "products" SET "title"="title"` backfill line.

**Every subsequent `migrate dev`** also emits `DROP INDEX` for
`products_search_vector_gin` / `products_title_trgm` / `products_brand_trgm` (same blind spot
as the GiST indexes). Strip those lines too — 8 `DROP INDEX`s total to remove per migration.
