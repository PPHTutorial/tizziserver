-- AlterEnum
ALTER TYPE "ProductStatus" ADD VALUE 'PENDING_REVIEW';

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT;
