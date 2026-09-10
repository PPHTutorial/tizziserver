-- NOTE: Prisma's differ emits spurious `DROP INDEX` for the 5 PostGIS GiST +
-- 3 pg_trgm/GIN indexes it can't model (see packages/db/README.md) — stripped.

-- AlterTable
ALTER TABLE "deliveries" ADD COLUMN     "dropoffCode" TEXT,
ADD COLUMN     "pickupCode" TEXT;
