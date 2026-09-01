# @stall/db

Prisma 7 schema + client for Stall. See `docs/02-DATA-MODEL.md`.

## Scripts

| cmd | what |
|---|---|
| `pnpm --filter @stall/db generate` | regenerate `src/generated/` |
| `pnpm --filter @stall/db migrate` | `prisma migrate dev` (interactive; dev only) |
| `pnpm --filter @stall/db migrate:deploy` | apply pending migrations (CI / prod) |
| `pnpm --filter @stall/db seed` | Domain-0 seed (platforms, flags, currencies) |
| `pnpm --filter @stall/db studio` | Prisma Studio |

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
