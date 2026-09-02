-- CreateEnum
CREATE TYPE "PromotionKind" AS ENUM ('FLASH_DEAL', 'CAMPAIGN', 'BANNER');

-- NOTE: the differ can't see indexes on Unsupported()/tsvector columns, so it
-- emits DROP INDEX for the 5 GiST + 3 trigram/GIN indexes on every migration.
-- Those lines are intentionally removed. See packages/db/README.md.

-- CreateTable
CREATE TABLE "promotions" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "kind" "PromotionKind" NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "imageKey" TEXT,
    "ctaRoute" TEXT,
    "platformSlugs" TEXT[],
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotion_items" (
    "id" TEXT NOT NULL,
    "promotionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "discountBps" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "promotion_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "promotions_slug_key" ON "promotions"("slug");

-- CreateIndex
CREATE INDEX "promotions_kind_idx" ON "promotions"("kind");

-- CreateIndex
CREATE INDEX "promotion_items_productId_idx" ON "promotion_items"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "promotion_items_promotionId_productId_key" ON "promotion_items"("promotionId", "productId");

-- AddForeignKey
ALTER TABLE "promotion_items" ADD CONSTRAINT "promotion_items_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "promotions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_items" ADD CONSTRAINT "promotion_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
