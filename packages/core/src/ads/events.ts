/**
 * Ad interaction logging + billing accrual.
 *
 * `recordAdEvent` computes the marginal cost from the campaign's `BoostTier`
 * billing model (CPM → per-impression, CPC → per-click, FLAT_DAILY → free at the
 * event, charged by the daily sweep), bumps `Campaign.spentMinor`, and auto-pauses
 * the campaign once the budget (or a daily cap) is exhausted.
 */
import { prisma, type AdEventKind, type AdPlacementSlot } from "@stall/db";
import { env } from "@stall/config";
import { getRedis } from "../redis.ts";

/**
 * Cheap anti-fraud on billable events: collapse repeat CLICK/CONVERSION from the
 * same viewer for the same creative inside a short window. Impressions are not
 * de-duped (they're cheap and volume is expected). Cloudflare's rate-limit +
 * Turnstile are the frontline — this is defence in depth for spend integrity.
 */
async function isDuplicateBillable(
  campaignId: string,
  adId: string | undefined,
  kind: AdEventKind,
  clientKey: string | undefined,
  sessionId: string | undefined,
): Promise<boolean> {
  if (kind === "IMPRESSION") return false;
  const redis = getRedis();
  if (!redis) return false;
  // Anchor on the server-derived clientKey (IP) — a self-reported sessionId is
  // folded in as an extra signal, never a substitute, so a client can't defeat
  // de-dup for free by simply sending a fresh sessionId on every request.
  const identity = [clientKey, sessionId].filter(Boolean).join("|");
  if (!identity) return false;
  const key = `adfraud:${kind}:${campaignId}:${adId ?? "-"}:${identity}`;
  const set = await redis.set(key, "1", "EX", 90, "NX");
  return set === null;
}

export interface RecordAdEventInput {
  campaignId: string;
  adId?: string;
  kind: AdEventKind;
  userId?: string;
  platformSlug: string;
  placement?: AdPlacementSlot;
  sessionId?: string;
  /** IP or another coarse viewer id — used only for billable-event de-dup. */
  clientKey?: string;
  meta?: Record<string, unknown>;
}

function marginalCostMinor(
  billingModel: string,
  priceMinor: number,
  kind: AdEventKind,
): number {
  if (kind === "IMPRESSION" && billingModel === "CPM") return Math.max(1, Math.round(priceMinor / 1000));
  if (kind === "CLICK" && billingModel === "CPC") return priceMinor;
  return 0; // conversions are free; FLAT_DAILY is charged by the rollup sweep
}

export async function recordAdEvent(input: RecordAdEventInput) {
  const c = await prisma.campaign.findUnique({
    where: { id: input.campaignId },
    include: { boostTier: true },
  });
  if (!c || c.status !== "ACTIVE") return { recorded: false, reason: "campaign-inactive" as const };

  if (await isDuplicateBillable(input.campaignId, input.adId, input.kind, input.clientKey, input.sessionId)) {
    return { recorded: false, reason: "duplicate" as const };
  }

  const price = c.boostTier?.priceMinor ?? (c.boostTier?.billingModel === "CPC" ? env.ADS_DEFAULT_CPC_MINOR : env.ADS_DEFAULT_CPM_MINOR);
  const model = c.boostTier?.billingModel ?? "CPM";
  let cost = marginalCostMinor(model, price, input.kind);
  const remaining = Math.max(0, c.budgetMinor - c.spentMinor);
  if (cost > remaining) cost = remaining;

  await prisma.$transaction(async (tx) => {
    await tx.adEvent.create({
      data: {
        adId: input.adId,
        campaignId: input.campaignId,
        kind: input.kind,
        userId: input.userId,
        platformSlug: input.platformSlug,
        placement: input.placement,
        costMinor: cost,
        sessionId: input.sessionId,
        meta: (input.meta ?? undefined) as never,
      },
    });
    if (cost > 0) {
      const updated = await tx.campaign.update({ where: { id: input.campaignId }, data: { spentMinor: { increment: cost } } });
      if (updated.spentMinor >= updated.budgetMinor) {
        await tx.campaign.update({ where: { id: input.campaignId }, data: { status: "PAUSED" } });
        await tx.outboxEvent.create({ data: { type: "campaign.budget_exhausted", aggregateType: "Campaign", aggregateId: input.campaignId, payload: { vendorId: updated.vendorId } } });
      }
    }
  });
  return { recorded: true, costMinor: cost };
}

/** Bulk impression logging for a served placement — one row per creative shown. */
export async function recordImpressions(
  campaignAds: { campaignId: string; adId?: string }[],
  ctx: { userId?: string; platformSlug: string; placement: AdPlacementSlot; sessionId?: string },
) {
  for (const ca of campaignAds) {
    await recordAdEvent({ ...ca, kind: "IMPRESSION", ...ctx }).catch(() => {});
  }
}
