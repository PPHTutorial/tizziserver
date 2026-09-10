-- CreateEnum
CREATE TYPE "CampaignObjective" AS ENUM ('PRODUCT_SALES', 'STORE_TRAFFIC', 'PRODUCT_LAUNCH', 'AUCTION_PROMO');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AdBillingModel" AS ENUM ('CPM', 'CPC', 'FLAT_DAILY');

-- CreateEnum
CREATE TYPE "AdPlacementSlot" AS ENUM ('HOME_RAIL', 'SEARCH_TOP', 'CATEGORY_TOP', 'PRODUCT_RELATED', 'CHECKOUT_CROSS_SELL');

-- CreateEnum
CREATE TYPE "AdCreativeKind" AS ENUM ('PRODUCT_CARD', 'BANNER');

-- CreateEnum
CREATE TYPE "BoostKind" AS ENUM ('SEARCH_RANK', 'CATEGORY_PIN', 'HOME_FEATURE');

-- CreateEnum
CREATE TYPE "BoostStatus" AS ENUM ('PENDING', 'ACTIVE', 'PAUSED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AdEventKind" AS ENUM ('IMPRESSION', 'CLICK', 'CONVERSION');

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('PENDING', 'QUALIFIED', 'REWARDED', 'EXPIRED');

-- CreateTable
CREATE TABLE "boost_tiers" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "platformSlugs" TEXT[],
    "billingModel" "AdBillingModel" NOT NULL DEFAULT 'CPM',
    "priceMinor" INTEGER NOT NULL,
    "rankBoostBps" INTEGER NOT NULL DEFAULT 10000,
    "placements" "AdPlacementSlot"[],
    "badge" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "boost_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "platformSlug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "objective" "CampaignObjective" NOT NULL DEFAULT 'PRODUCT_SALES',
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "boostTierId" TEXT,
    "budgetMinor" INTEGER NOT NULL,
    "dailyCapMinor" INTEGER,
    "spentMinor" INTEGER NOT NULL DEFAULT 0,
    "targeting" JSONB,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "paymentIntentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_items" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,

    CONSTRAINT "campaign_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "advertisements" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "slot" "AdPlacementSlot" NOT NULL,
    "creativeKind" "AdCreativeKind" NOT NULL DEFAULT 'PRODUCT_CARD',
    "headline" TEXT,
    "subtext" TEXT,
    "imageKey" TEXT,
    "productId" TEXT,
    "destinationRoute" TEXT,
    "weight" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "advertisements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_events" (
    "id" TEXT NOT NULL,
    "adId" TEXT,
    "campaignId" TEXT NOT NULL,
    "kind" "AdEventKind" NOT NULL,
    "userId" TEXT,
    "platformSlug" TEXT NOT NULL,
    "placement" "AdPlacementSlot",
    "costMinor" INTEGER NOT NULL DEFAULT 0,
    "sessionId" TEXT,
    "meta" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ad_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_daily_stats" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "conversions" INTEGER NOT NULL DEFAULT 0,
    "spendMinor" INTEGER NOT NULL DEFAULT 0,
    "revenueMinor" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ad_daily_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boosts" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "platformSlug" TEXT NOT NULL,
    "boostTierId" TEXT NOT NULL,
    "kind" "BoostKind" NOT NULL DEFAULT 'SEARCH_RANK',
    "status" "BoostStatus" NOT NULL DEFAULT 'PENDING',
    "categoryId" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "priceMinor" INTEGER NOT NULL,
    "spentMinor" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "boosts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_codes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referrals" (
    "id" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "refereeId" TEXT,
    "code" TEXT NOT NULL,
    "channel" TEXT,
    "status" "ReferralStatus" NOT NULL DEFAULT 'PENDING',
    "rewardMinor" INTEGER NOT NULL DEFAULT 0,
    "qualifyingOrderId" TEXT,
    "rewardedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_snapshots" (
    "id" TEXT NOT NULL,
    "platformSlug" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "metrics" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "boost_tiers_key_key" ON "boost_tiers"("key");

-- CreateIndex
CREATE INDEX "boost_tiers_isActive_sortOrder_idx" ON "boost_tiers"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "campaigns_vendorId_status_idx" ON "campaigns"("vendorId", "status");

-- CreateIndex
CREATE INDEX "campaigns_platformSlug_status_idx" ON "campaigns"("platformSlug", "status");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_items_campaignId_productId_key" ON "campaign_items"("campaignId", "productId");

-- CreateIndex
CREATE INDEX "advertisements_slot_isActive_idx" ON "advertisements"("slot", "isActive");

-- CreateIndex
CREATE INDEX "ad_events_campaignId_kind_at_idx" ON "ad_events"("campaignId", "kind", "at");

-- CreateIndex
CREATE INDEX "ad_events_adId_at_idx" ON "ad_events"("adId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "ad_daily_stats_campaignId_day_key" ON "ad_daily_stats"("campaignId", "day");

-- CreateIndex
CREATE INDEX "boosts_productId_status_endsAt_idx" ON "boosts"("productId", "status", "endsAt");

-- CreateIndex
CREATE INDEX "boosts_vendorId_status_idx" ON "boosts"("vendorId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "referral_codes_userId_key" ON "referral_codes"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "referral_codes_code_key" ON "referral_codes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "referrals_refereeId_key" ON "referrals"("refereeId");

-- CreateIndex
CREATE INDEX "referrals_referrerId_status_idx" ON "referrals"("referrerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "analytics_snapshots_platformSlug_day_key" ON "analytics_snapshots"("platformSlug", "day");

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_boostTierId_fkey" FOREIGN KEY ("boostTierId") REFERENCES "boost_tiers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_items" ADD CONSTRAINT "campaign_items_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advertisements" ADD CONSTRAINT "advertisements_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_events" ADD CONSTRAINT "ad_events_adId_fkey" FOREIGN KEY ("adId") REFERENCES "advertisements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_events" ADD CONSTRAINT "ad_events_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_events" ADD CONSTRAINT "ad_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_daily_stats" ADD CONSTRAINT "ad_daily_stats_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boosts" ADD CONSTRAINT "boosts_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boosts" ADD CONSTRAINT "boosts_boostTierId_fkey" FOREIGN KEY ("boostTierId") REFERENCES "boost_tiers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_refereeId_fkey" FOREIGN KEY ("refereeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
