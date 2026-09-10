import { z } from "zod";
import { ok } from "./envelope.ts";

/**
 * Phase 7 — advertising, boosting, campaigns, referrals. Mirrors `@stall/core/{ads,referrals}`
 * and `/api/v1/{ads,vendors/campaigns,vendors/boosts,me/referrals,staff/*}`.
 */

export const AdPlacementSlot = z.enum(["HOME_RAIL", "SEARCH_TOP", "CATEGORY_TOP", "PRODUCT_RELATED", "CHECKOUT_CROSS_SELL"]);
export const AdBillingModel = z.enum(["CPM", "CPC", "FLAT_DAILY"]);
export const CampaignObjective = z.enum(["PRODUCT_SALES", "STORE_TRAFFIC", "PRODUCT_LAUNCH", "AUCTION_PROMO"]);
export const CampaignStatus = z.enum(["DRAFT", "PENDING_REVIEW", "SCHEDULED", "ACTIVE", "PAUSED", "COMPLETED", "REJECTED", "CANCELLED"]);
export const AdEventKind = z.enum(["IMPRESSION", "CLICK", "CONVERSION"]);

// --- boost tiers -----------------------------------------------------
export const BoostTier = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  billingModel: AdBillingModel,
  priceMinor: z.number().int(),
  rankBoostBps: z.number().int(),
  placements: z.array(AdPlacementSlot),
  badge: z.string().nullable(),
  sortOrder: z.number().int(),
});
export const BoostTiersResponse = ok(z.object({ items: z.array(BoostTier) }));

// --- serving -------------------------------------------------------
export const SponsoredCard = z.object({
  campaignId: z.string(),
  adId: z.string().nullable(),
  slot: AdPlacementSlot,
  creativeKind: z.string(),
  headline: z.string().nullable(),
  subtext: z.string().nullable(),
  imageKey: z.string().nullable(),
  destinationRoute: z.string().nullable(),
  badge: z.string().nullable(),
  product: z
    .object({
      id: z.string(),
      slug: z.string(),
      title: z.string(),
      brand: z.string().nullable(),
      image: z.string().nullable(),
      fromPriceMinor: z.number().int().nullable(),
      currency: z.string(),
      ratingAvg: z.number(),
    })
    .nullable(),
});
export const SponsoredResponse = ok(z.object({ items: z.array(SponsoredCard) }));
export const AdEventRequest = z.object({
  campaignId: z.string(),
  adId: z.string().optional(),
  kind: AdEventKind,
  placement: AdPlacementSlot.optional(),
  sessionId: z.string().max(64).optional(),
});
export const AdEventResponse = ok(z.object({ recorded: z.boolean(), costMinor: z.number().int().optional(), reason: z.string().optional() }));

// --- campaigns ---------------------------------------------------
export const Targeting = z.object({
  categoryIds: z.array(z.string()).optional(),
  regionCodes: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional(),
});
export const Campaign = z.object({
  id: z.string(),
  name: z.string(),
  objective: CampaignObjective,
  status: CampaignStatus,
  platformSlug: z.string(),
  budgetMinor: z.number().int(),
  spentMinor: z.number().int(),
  dailyCapMinor: z.number().int().nullable(),
  targeting: z.unknown().nullable(),
  productIds: z.array(z.string()),
  tier: z.object({ key: z.string().nullable(), name: z.string(), badge: z.string().nullable() }).nullable(),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  rejectionReason: z.string().nullable(),
  createdAt: z.string(),
});
export const CampaignsResponse = ok(z.object({ items: z.array(Campaign) }));
export const CampaignDetail = Campaign.extend({
  ads: z.array(z.object({ id: z.string(), slot: AdPlacementSlot, creativeKind: z.string(), headline: z.string().nullable(), imageKey: z.string().nullable(), productId: z.string().nullable(), isActive: z.boolean() })),
  performance: z.object({
    impressions: z.number().int(),
    clicks: z.number().int(),
    conversions: z.number().int(),
    ctr: z.number(),
    spentMinor: z.number().int(),
    budgetMinor: z.number().int(),
    remainingMinor: z.number().int(),
  }),
});
export const CampaignDetailResponse = ok(CampaignDetail);
export const CreateCampaignRequest = z.object({
  name: z.string().min(2).max(120),
  objective: CampaignObjective.optional(),
  boostTierKey: z.string().optional(),
  budgetMinor: z.number().int().positive(),
  dailyCapMinor: z.number().int().positive().optional(),
  productIds: z.array(z.string()).max(50).optional(),
  targeting: Targeting.optional(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
});
export const UpdateCampaignRequest = CreateCampaignRequest.partial();
export const SetProductsRequest = z.object({ productIds: z.array(z.string()).max(50) });
export const CreativeRequest = z.object({
  slot: AdPlacementSlot,
  creativeKind: z.enum(["PRODUCT_CARD", "BANNER"]).optional(),
  headline: z.string().max(120).optional(),
  subtext: z.string().max(200).optional(),
  imageKey: z.string().optional(),
  productId: z.string().optional(),
  destinationRoute: z.string().optional(),
  weight: z.number().int().min(1).max(1000).optional(),
});
export const SubmitCampaignRequest = z.object({ payment: z.object({ method: z.enum(["wallet", "gateway"]), gateway: z.string().optional() }) });

// --- boosts -----------------------------------------------------
export const Boost = z.object({
  id: z.string(),
  productId: z.string(),
  kind: z.string(),
  status: z.string(),
  tier: z.string(),
  priceMinor: z.number().int(),
  startsAt: z.string(),
  endsAt: z.string(),
});
export const BoostsResponse = ok(z.object({ items: z.array(Boost) }));
export const CreateBoostRequest = z.object({
  productId: z.string(),
  boostTierKey: z.string(),
  kind: z.enum(["SEARCH_RANK", "CATEGORY_PIN", "HOME_FEATURE"]).optional(),
  categoryId: z.string().optional(),
  days: z.number().int().min(1).max(30),
});

// --- referrals -----------------------------------------------
export const ReferralSummary = ok(
  z.object({
    code: z.string(),
    rewardPerReferralMinor: z.number().int(),
    qualifyMinOrderMinor: z.number().int(),
    counts: z.object({ pending: z.number().int(), qualified: z.number().int(), rewarded: z.number().int() }),
    rewardedMinor: z.number().int(),
    items: z.array(z.object({ id: z.string(), status: z.string(), rewardMinor: z.number().int(), at: z.string(), rewardedAt: z.string().nullable() })),
  }),
);
export const ApplyReferralRequest = z.object({ code: z.string().min(4).max(16), channel: z.string().max(32).optional() });
export const ApplyReferralResponse = ok(z.object({ id: z.string(), status: z.string() }));

// --- analytics ---------------------------------------------
const Series = z.array(z.object({ day: z.string(), value: z.number() }));
export const VendorAnalyticsResponse = ok(
  z.object({
    range: z.object({ from: z.string(), to: z.string(), days: z.number().int() }),
    sales: z.object({ grossMinor: z.number().int(), netMinor: z.number().int(), commissionMinor: z.number().int(), orderCount: z.number().int(), units: z.number().int(), aovMinor: z.number().int(), series: Series }),
    topProducts: z.array(z.object({ productId: z.string(), title: z.string(), units: z.number().int(), revenueMinor: z.number().int() })),
    customers: z.object({ unique: z.number().int(), returning: z.number().int(), new: z.number().int() }),
    payouts: z.object({ balanceMinor: z.number().int(), paidOutMinor: z.number().int(), pendingPayoutMinor: z.number().int(), recent: z.array(z.object({ id: z.string(), amountMinor: z.number().int(), status: z.string(), at: z.string() })) }),
    ratings: z.object({ avg: z.number(), count: z.number().int() }),
    advertising: z.object({ spendMinor: z.number().int(), revenueMinor: z.number().int(), roas: z.number(), impressions: z.number().int(), clicks: z.number().int(), ctr: z.number() }),
  }),
);
export const CourierAnalyticsResponse = ok(
  z.object({
    range: z.object({ from: z.string(), to: z.string(), days: z.number().int() }),
    deliveries: z.object({ completed: z.number().int(), cancelled: z.number().int(), lifetimeCompleted: z.number().int(), distanceKm: z.number(), series: Series }),
    acceptance: z.object({ offered: z.number().int(), accepted: z.number().int(), rate: z.number() }),
    onTime: z.object({ onTime: z.number().int(), of: z.number().int(), rate: z.number() }),
    earnings: z.object({ netMinor: z.number().int(), perDeliveryMinor: z.number().int(), series: Series }),
    ratings: z.object({ avg: z.number(), count: z.number().int() }),
  }),
);

// --- staff ---------------------------------------------------
export const StaffMutationResponse = ok(z.record(z.string(), z.unknown()));
export const CampaignReviewRequest = z.object({ approve: z.boolean(), reason: z.string().max(400).optional() });
export const ReviewQueueResponse = ok(z.object({ items: z.array(z.record(z.string(), z.unknown())) }));
