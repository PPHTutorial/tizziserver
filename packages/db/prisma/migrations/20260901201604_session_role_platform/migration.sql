-- Session: carry the active role + platform across refresh-token rotation.
-- NOTE: `prisma migrate dev` also emitted `DROP INDEX` for the 5 PostGIS GiST
-- indexes (it can't see indexes on Unsupported() columns). Those DROPs were
-- removed by hand. Geo DDL is managed manually — see packages/db/README.md.

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "activeRole" "Role" NOT NULL DEFAULT 'CUSTOMER',
ADD COLUMN     "platformSlug" TEXT;
