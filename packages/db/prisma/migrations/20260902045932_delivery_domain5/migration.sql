-- CreateEnum
CREATE TYPE "KycLevel" AS ENUM ('BASIC', 'FULL');

-- CreateEnum
CREATE TYPE "KycDocKind" AS ENUM ('ID_FRONT', 'ID_BACK', 'SELFIE', 'PROOF_ADDRESS', 'BUSINESS_REG', 'DRIVER_LICENSE', 'VEHICLE_REG', 'INSURANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "DeliveryZoneStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "DeliverySourceType" AS ENUM ('FULFILMENT', 'AUCTION', 'ADHOC');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('REQUESTED', 'SEARCHING_COURIER', 'COURIER_ASSIGNED', 'COURIER_EN_ROUTE_PICKUP', 'ARRIVED_PICKUP', 'PICKED_UP', 'EN_ROUTE_DROPOFF', 'ARRIVED_DROPOFF', 'DELIVERED', 'COMPLETED', 'FAILED_RECIPIENT_UNAVAILABLE', 'REASSIGNING', 'RESCHEDULED', 'CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_COURIER', 'CANCELLED_BY_SYSTEM');

-- CreateEnum
CREATE TYPE "DeliveryJobState" AS ENUM ('OPEN', 'OFFERING', 'ASSIGNED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeliveryOfferResponse" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'TIMEOUT');

-- CreateEnum
CREATE TYPE "PickupVerifyMethod" AS ENUM ('OTP', 'QR', 'PHOTO', 'VENDOR_CONFIRM');

-- CreateEnum
CREATE TYPE "DeliveryVerifyMethod" AS ENUM ('OTP', 'QR', 'SIGNATURE', 'PHOTO');

-- CreateEnum
CREATE TYPE "DeliveryPartyRole" AS ENUM ('CUSTOMER', 'COURIER');

-- CreateEnum
CREATE TYPE "CourierEarningKind" AS ENUM ('DELIVERY', 'BONUS', 'TIP', 'ADJUSTMENT', 'FEE');

-- CreateEnum
CREATE TYPE "DeliveryDisputeStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED');

-- AlterEnum
ALTER TYPE "KycSubject" ADD VALUE 'USER';

-- NOTE: Prisma's differ emits spurious `DROP INDEX` for the PostGIS GiST + the
-- pg_trgm/GIN indexes it can't model (see packages/db/README.md). Those 8 lines
-- were stripped here. The one new geo index is hand-added at the bottom.

-- AlterTable
ALTER TABLE "kyc_cases" ADD COLUMN     "level" "KycLevel" NOT NULL DEFAULT 'BASIC',
ADD COLUMN     "providerRef" TEXT;

-- CreateTable
CREATE TABLE "kyc_documents" (
    "id" TEXT NOT NULL,
    "kycCaseId" TEXT NOT NULL,
    "type" "KycDocKind" NOT NULL,
    "fileKey" TEXT NOT NULL,
    "ocr" JSONB,
    "status" "DocStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kyc_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "liveness_checks" (
    "id" TEXT NOT NULL,
    "kycCaseId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'mock',
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "passed" BOOLEAN NOT NULL DEFAULT false,
    "ref" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "liveness_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_zones" (
    "id" TEXT NOT NULL,
    "platformSlug" TEXT,
    "regionCode" TEXT,
    "name" TEXT NOT NULL,
    "area" geography(Polygon, 4326),
    "centerLat" DOUBLE PRECISION,
    "centerLng" DOUBLE PRECISION,
    "radiusM" INTEGER,
    "baseFeeMinor" INTEGER NOT NULL DEFAULT 0,
    "perKmMinor" INTEGER NOT NULL DEFAULT 0,
    "status" "DeliveryZoneStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deliveries" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "platformSlug" TEXT NOT NULL,
    "sourceType" "DeliverySourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'REQUESTED',
    "customerId" TEXT,
    "courierId" TEXT,
    "vehicleType" "VehicleKind" NOT NULL DEFAULT 'MOTORBIKE',
    "pickupLat" DOUBLE PRECISION NOT NULL,
    "pickupLng" DOUBLE PRECISION NOT NULL,
    "pickupAddress" JSONB NOT NULL,
    "pickupContact" JSONB,
    "dropoffLat" DOUBLE PRECISION NOT NULL,
    "dropoffLng" DOUBLE PRECISION NOT NULL,
    "dropoffAddress" JSONB NOT NULL,
    "dropoffContact" JSONB,
    "distanceM" INTEGER NOT NULL DEFAULT 0,
    "durationS" INTEGER NOT NULL DEFAULT 0,
    "feeMinor" INTEGER NOT NULL DEFAULT 0,
    "courierPayoutMinor" INTEGER NOT NULL DEFAULT 0,
    "tipMinor" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'GHS',
    "scheduledFor" TIMESTAMP(3),
    "assignedAt" TIMESTAMP(3),
    "pickedUpAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "reassignCount" INTEGER NOT NULL DEFAULT 0,
    "etaAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_items" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "photoKey" TEXT,
    "valueMinor" INTEGER,
    "fragile" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "delivery_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_jobs" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "state" "DeliveryJobState" NOT NULL DEFAULT 'OPEN',
    "payoutMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GHS',
    "pickupAreaLabel" TEXT NOT NULL,
    "dropoffAreaLabel" TEXT NOT NULL,
    "distanceM" INTEGER NOT NULL DEFAULT 0,
    "durationS" INTEGER NOT NULL DEFAULT 0,
    "vehicleType" "VehicleKind" NOT NULL DEFAULT 'MOTORBIKE',
    "requirements" JSONB,
    "offeredCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_offers" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "courierId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "distanceM" INTEGER NOT NULL DEFAULT 0,
    "payoutMinor" INTEGER NOT NULL DEFAULT 0,
    "response" "DeliveryOfferResponse" NOT NULL DEFAULT 'PENDING',
    "declineReason" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "delivery_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_events" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actorType" "ActorType" NOT NULL DEFAULT 'SYSTEM',
    "actorId" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "data" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_locations" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "courierId" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "heading" DOUBLE PRECISION,
    "speed" DOUBLE PRECISION,
    "accuracy" DOUBLE PRECISION,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pickup_verifications" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "method" "PickupVerifyMethod" NOT NULL DEFAULT 'OTP',
    "otpHash" TEXT,
    "packageCount" INTEGER,
    "conditionNote" TEXT,
    "photoKeys" TEXT[],
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pickup_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_verifications" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "method" "DeliveryVerifyMethod" NOT NULL DEFAULT 'OTP',
    "otpHash" TEXT,
    "signatureKey" TEXT,
    "photoKeys" TEXT[],
    "recipientName" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proofs_of_delivery" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "photoKeys" TEXT[],
    "notes" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proofs_of_delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_ratings" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "byUserId" TEXT NOT NULL,
    "role" "DeliveryPartyRole" NOT NULL,
    "stars" INTEGER NOT NULL,
    "tags" TEXT[],
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_disputes" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "openedById" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "evidence" JSONB,
    "status" "DeliveryDisputeStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_disputes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courier_earnings" (
    "id" TEXT NOT NULL,
    "courierId" TEXT NOT NULL,
    "deliveryId" TEXT,
    "kind" "CourierEarningKind" NOT NULL DEFAULT 'DELIVERY',
    "grossMinor" INTEGER NOT NULL DEFAULT 0,
    "deductionMinor" INTEGER NOT NULL DEFAULT 0,
    "netMinor" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'GHS',
    "ledgerTxnId" TEXT,
    "memo" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "courier_earnings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "kyc_documents_kycCaseId_idx" ON "kyc_documents"("kycCaseId");

-- CreateIndex
CREATE INDEX "liveness_checks_kycCaseId_idx" ON "liveness_checks"("kycCaseId");

-- CreateIndex
CREATE INDEX "delivery_zones_platformSlug_status_idx" ON "delivery_zones"("platformSlug", "status");

-- CreateIndex
CREATE UNIQUE INDEX "deliveries_code_key" ON "deliveries"("code");

-- CreateIndex
CREATE INDEX "deliveries_courierId_status_idx" ON "deliveries"("courierId", "status");

-- CreateIndex
CREATE INDEX "deliveries_customerId_createdAt_idx" ON "deliveries"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "deliveries_platformSlug_status_idx" ON "deliveries"("platformSlug", "status");

-- CreateIndex
CREATE INDEX "deliveries_sourceType_sourceId_idx" ON "deliveries"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "delivery_items_deliveryId_idx" ON "delivery_items"("deliveryId");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_jobs_deliveryId_key" ON "delivery_jobs"("deliveryId");

-- CreateIndex
CREATE INDEX "delivery_jobs_state_expiresAt_idx" ON "delivery_jobs"("state", "expiresAt");

-- CreateIndex
CREATE INDEX "delivery_offers_courierId_response_idx" ON "delivery_offers"("courierId", "response");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_offers_deliveryId_courierId_key" ON "delivery_offers"("deliveryId", "courierId");

-- CreateIndex
CREATE INDEX "delivery_events_deliveryId_at_idx" ON "delivery_events"("deliveryId", "at");

-- CreateIndex
CREATE INDEX "delivery_locations_deliveryId_at_idx" ON "delivery_locations"("deliveryId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "pickup_verifications_deliveryId_key" ON "pickup_verifications"("deliveryId");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_verifications_deliveryId_key" ON "delivery_verifications"("deliveryId");

-- CreateIndex
CREATE UNIQUE INDEX "proofs_of_delivery_deliveryId_key" ON "proofs_of_delivery"("deliveryId");

-- CreateIndex
CREATE INDEX "delivery_ratings_deliveryId_idx" ON "delivery_ratings"("deliveryId");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_ratings_deliveryId_role_key" ON "delivery_ratings"("deliveryId", "role");

-- CreateIndex
CREATE INDEX "delivery_disputes_deliveryId_idx" ON "delivery_disputes"("deliveryId");

-- CreateIndex
CREATE INDEX "delivery_disputes_status_idx" ON "delivery_disputes"("status");

-- CreateIndex
CREATE INDEX "courier_earnings_courierId_at_idx" ON "courier_earnings"("courierId", "at");

-- AddForeignKey
ALTER TABLE "kyc_documents" ADD CONSTRAINT "kyc_documents_kycCaseId_fkey" FOREIGN KEY ("kycCaseId") REFERENCES "kyc_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liveness_checks" ADD CONSTRAINT "liveness_checks_kycCaseId_fkey" FOREIGN KEY ("kycCaseId") REFERENCES "kyc_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "courier_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_items" ADD CONSTRAINT "delivery_items_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_jobs" ADD CONSTRAINT "delivery_jobs_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_offers" ADD CONSTRAINT "delivery_offers_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_offers" ADD CONSTRAINT "delivery_offers_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "courier_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_events" ADD CONSTRAINT "delivery_events_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_locations" ADD CONSTRAINT "delivery_locations_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_locations" ADD CONSTRAINT "delivery_locations_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "courier_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickup_verifications" ADD CONSTRAINT "pickup_verifications_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_verifications" ADD CONSTRAINT "delivery_verifications_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proofs_of_delivery" ADD CONSTRAINT "proofs_of_delivery_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_ratings" ADD CONSTRAINT "delivery_ratings_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_ratings" ADD CONSTRAINT "delivery_ratings_byUserId_fkey" FOREIGN KEY ("byUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_disputes" ADD CONSTRAINT "delivery_disputes_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_disputes" ADD CONSTRAINT "delivery_disputes_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courier_earnings" ADD CONSTRAINT "courier_earnings_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "courier_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courier_earnings" ADD CONSTRAINT "courier_earnings_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "deliveries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Hand-added: GiST index for the DeliveryZone service-area polygon (Prisma can't
-- express indexes on Unsupported() geography columns — see packages/db/README.md).
CREATE INDEX "delivery_zones_area_gist" ON "delivery_zones" USING GIST ("area");
