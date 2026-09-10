-- CreateEnum
CREATE TYPE "AuctionType" AS ENUM ('SEAT_DRAW', 'PREMIUM_ASSET');

-- CreateEnum
CREATE TYPE "AuctionStatus" AS ENUM ('DRAFT', 'ANNOUNCED', 'OPEN', 'FILLING', 'CLOSING', 'DRAW_PENDING', 'DRAWING', 'COMPLETED', 'UNSOLD', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DrawTrigger" AS ENUM ('SOLD_OUT', 'SCHEDULED', 'EITHER');

-- CreateEnum
CREATE TYPE "NonWinnerPolicy" AS ENUM ('REFUND', 'CREDIT', 'VOUCHER');

-- CreateEnum
CREATE TYPE "TicketSource" AS ENUM ('PURCHASE', 'BONUS', 'REFERRAL', 'ENGAGEMENT');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('ACTIVE', 'DRAWN', 'WON', 'REFUNDED', 'VOID');

-- CreateEnum
CREATE TYPE "QualFactor" AS ENUM ('TICKETS', 'ENGAGEMENT', 'SHARE', 'REFERRAL');

-- CreateEnum
CREATE TYPE "DrawMethod" AS ENUM ('VRF', 'COMMIT_REVEAL');

-- CreateEnum
CREATE TYPE "WinnerStatus" AS ENUM ('PENDING_CLAIM', 'CLAIMED', 'FORFEITED');

-- CreateEnum
CREATE TYPE "PrizeClaimStatus" AS ENUM ('OPEN', 'VERIFYING', 'APPROVED', 'FULFILLING', 'DELIVERED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PrizeFulfilMethod" AS ENUM ('DELIVERY', 'PICKUP', 'DIGITAL', 'PAYOUT');

-- CreateEnum
CREATE TYPE "AuctionRefundReason" AS ENUM ('UNSOLD_DRAW', 'NON_WINNER', 'CANCELLED', 'DISPUTE');

-- CreateEnum
CREATE TYPE "AuctionRefundStatus" AS ENUM ('PENDING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "WinTargetStatus" AS ENUM ('PENDING', 'PAID', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AuctionDisputeStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED');

-- CreateTable
CREATE TABLE "auctions" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "AuctionType" NOT NULL DEFAULT 'SEAT_DRAW',
    "status" "AuctionStatus" NOT NULL DEFAULT 'DRAFT',
    "platformSlug" TEXT NOT NULL,
    "regionCodes" TEXT[],
    "productId" TEXT,
    "offerId" TEXT,
    "retailValueMinor" INTEGER NOT NULL,
    "ticketPriceMinor" INTEGER NOT NULL,
    "winTargetMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GHS',
    "seatsTotal" INTEGER NOT NULL,
    "seatsSold" INTEGER NOT NULL DEFAULT 0,
    "minSeatsToDraw" INTEGER NOT NULL DEFAULT 1,
    "drawTrigger" "DrawTrigger" NOT NULL DEFAULT 'EITHER',
    "nonWinnerPolicy" "NonWinnerPolicy" NOT NULL DEFAULT 'REFUND',
    "rules" JSONB,
    "announcedAt" TIMESTAMP(3),
    "opensAt" TIMESTAMP(3),
    "closesAt" TIMESTAMP(3),
    "drawAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auctions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "premium_assets" (
    "id" TEXT NOT NULL,
    "auctionId" TEXT,
    "productId" TEXT,
    "title" TEXT NOT NULL,
    "media" TEXT[],
    "specs" JSONB,
    "retailValueMinor" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "premium_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_packages" (
    "id" TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ticketCount" INTEGER NOT NULL,
    "bonusTickets" INTEGER NOT NULL DEFAULT 0,
    "priceMinor" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ticket_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auction_tickets" (
    "id" TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "packageId" TEXT,
    "serial" TEXT NOT NULL,
    "seatNo" INTEGER,
    "source" "TicketSource" NOT NULL DEFAULT 'PURCHASE',
    "paymentIntentId" TEXT,
    "status" "TicketStatus" NOT NULL DEFAULT 'ACTIVE',
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auction_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_wallets" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "activeCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auction_participants" (
    "id" TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ticketCount" INTEGER NOT NULL DEFAULT 0,
    "qualificationScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rank" INTEGER,
    "eligible" BOOLEAN NOT NULL DEFAULT true,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auction_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qualification_rules" (
    "id" TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "factor" "QualFactor" NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "params" JSONB,

    CONSTRAINT "qualification_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qualification_events" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "factor" "QualFactor" NOT NULL,
    "points" DOUBLE PRECISION NOT NULL,
    "ref" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qualification_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "draws" (
    "id" TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "method" "DrawMethod" NOT NULL DEFAULT 'COMMIT_REVEAL',
    "algorithmVersion" TEXT NOT NULL DEFAULT 'v1',
    "seedCommitHash" TEXT NOT NULL,
    "seedReveal" TEXT,
    "entryCount" INTEGER NOT NULL DEFAULT 0,
    "totalWeight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "resultHash" TEXT,
    "committedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "draws_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "draw_entries" (
    "id" TEXT NOT NULL,
    "drawId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "rangeStart" DOUBLE PRECISION NOT NULL,
    "rangeEnd" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "draw_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "winners" (
    "id" TEXT NOT NULL,
    "drawId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "position" TEXT NOT NULL DEFAULT 'PRIMARY',
    "assetId" TEXT,
    "status" "WinnerStatus" NOT NULL DEFAULT 'PENDING_CLAIM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "winners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backup_winners" (
    "id" TEXT NOT NULL,
    "drawId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "backup_winners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prize_claims" (
    "id" TEXT NOT NULL,
    "winnerId" TEXT NOT NULL,
    "status" "PrizeClaimStatus" NOT NULL DEFAULT 'OPEN',
    "kycCaseId" TEXT,
    "deliveryId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prize_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prize_fulfilments" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "method" "PrizeFulfilMethod" NOT NULL,
    "ref" JSONB,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prize_fulfilments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auction_refunds" (
    "id" TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ticketIds" TEXT[],
    "amountMinor" INTEGER NOT NULL,
    "reason" "AuctionRefundReason" NOT NULL,
    "status" "AuctionRefundStatus" NOT NULL DEFAULT 'PENDING',
    "ledgerTxnId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auction_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "win_target_purchases" (
    "id" TEXT NOT NULL,
    "winnerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GHS',
    "paymentIntentId" TEXT,
    "status" "WinTargetStatus" NOT NULL DEFAULT 'PENDING',
    "orderId" TEXT,
    "deliveryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "win_target_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auction_disputes" (
    "id" TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "evidence" JSONB,
    "status" "AuctionDisputeStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auction_disputes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auctions_slug_key" ON "auctions"("slug");

-- CreateIndex
CREATE INDEX "auctions_platformSlug_status_idx" ON "auctions"("platformSlug", "status");

-- CreateIndex
CREATE INDEX "auctions_status_drawAt_idx" ON "auctions"("status", "drawAt");

-- CreateIndex
CREATE INDEX "premium_assets_auctionId_idx" ON "premium_assets"("auctionId");

-- CreateIndex
CREATE INDEX "ticket_packages_auctionId_idx" ON "ticket_packages"("auctionId");

-- CreateIndex
CREATE UNIQUE INDEX "auction_tickets_serial_key" ON "auction_tickets"("serial");

-- CreateIndex
CREATE INDEX "auction_tickets_auctionId_userId_idx" ON "auction_tickets"("auctionId", "userId");

-- CreateIndex
CREATE INDEX "auction_tickets_auctionId_status_idx" ON "auction_tickets"("auctionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_wallets_userId_auctionId_key" ON "ticket_wallets"("userId", "auctionId");

-- CreateIndex
CREATE INDEX "auction_participants_auctionId_qualificationScore_idx" ON "auction_participants"("auctionId", "qualificationScore");

-- CreateIndex
CREATE UNIQUE INDEX "auction_participants_auctionId_userId_key" ON "auction_participants"("auctionId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "qualification_rules_auctionId_factor_key" ON "qualification_rules"("auctionId", "factor");

-- CreateIndex
CREATE INDEX "qualification_events_participantId_factor_idx" ON "qualification_events"("participantId", "factor");

-- CreateIndex
CREATE UNIQUE INDEX "draws_auctionId_key" ON "draws"("auctionId");

-- CreateIndex
CREATE UNIQUE INDEX "draw_entries_participantId_key" ON "draw_entries"("participantId");

-- CreateIndex
CREATE INDEX "draw_entries_drawId_idx" ON "draw_entries"("drawId");

-- CreateIndex
CREATE UNIQUE INDEX "winners_participantId_key" ON "winners"("participantId");

-- CreateIndex
CREATE INDEX "winners_drawId_idx" ON "winners"("drawId");

-- CreateIndex
CREATE UNIQUE INDEX "backup_winners_participantId_key" ON "backup_winners"("participantId");

-- CreateIndex
CREATE UNIQUE INDEX "backup_winners_drawId_order_key" ON "backup_winners"("drawId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "prize_claims_winnerId_key" ON "prize_claims"("winnerId");

-- CreateIndex
CREATE INDEX "prize_fulfilments_claimId_idx" ON "prize_fulfilments"("claimId");

-- CreateIndex
CREATE INDEX "auction_refunds_auctionId_userId_idx" ON "auction_refunds"("auctionId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "win_target_purchases_winnerId_key" ON "win_target_purchases"("winnerId");

-- CreateIndex
CREATE INDEX "auction_disputes_auctionId_idx" ON "auction_disputes"("auctionId");

-- AddForeignKey
ALTER TABLE "premium_assets" ADD CONSTRAINT "premium_assets_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "auctions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_packages" ADD CONSTRAINT "ticket_packages_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "auctions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auction_tickets" ADD CONSTRAINT "auction_tickets_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "auctions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auction_tickets" ADD CONSTRAINT "auction_tickets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_wallets" ADD CONSTRAINT "ticket_wallets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_wallets" ADD CONSTRAINT "ticket_wallets_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "auctions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auction_participants" ADD CONSTRAINT "auction_participants_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "auctions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auction_participants" ADD CONSTRAINT "auction_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qualification_rules" ADD CONSTRAINT "qualification_rules_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "auctions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qualification_events" ADD CONSTRAINT "qualification_events_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "auction_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draws" ADD CONSTRAINT "draws_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "auctions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draw_entries" ADD CONSTRAINT "draw_entries_drawId_fkey" FOREIGN KEY ("drawId") REFERENCES "draws"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draw_entries" ADD CONSTRAINT "draw_entries_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "auction_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "winners" ADD CONSTRAINT "winners_drawId_fkey" FOREIGN KEY ("drawId") REFERENCES "draws"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "winners" ADD CONSTRAINT "winners_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "auction_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backup_winners" ADD CONSTRAINT "backup_winners_drawId_fkey" FOREIGN KEY ("drawId") REFERENCES "draws"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backup_winners" ADD CONSTRAINT "backup_winners_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "auction_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prize_claims" ADD CONSTRAINT "prize_claims_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "winners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prize_fulfilments" ADD CONSTRAINT "prize_fulfilments_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "prize_claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auction_refunds" ADD CONSTRAINT "auction_refunds_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "auctions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auction_refunds" ADD CONSTRAINT "auction_refunds_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "win_target_purchases" ADD CONSTRAINT "win_target_purchases_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "winners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "win_target_purchases" ADD CONSTRAINT "win_target_purchases_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auction_disputes" ADD CONSTRAINT "auction_disputes_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "auctions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auction_disputes" ADD CONSTRAINT "auction_disputes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
