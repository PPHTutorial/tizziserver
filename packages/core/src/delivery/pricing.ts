/**
 * Distance-based delivery pricing. Replaces the Phase-3 flat delivery fee.
 *
 * Config: `PricingRule(scope=DELIVERY, platformSlug)` `params`
 * (`{ baseMinor, perKmMinor, perMinMinor, minMinor, currency }` — the seed
 * shape), falling back to env defaults. The courier's cut ratio comes from
 * `FeeSchedule(COURIER, PAYOUT).params.percent` (default from env).
 */
import { prisma, type VehicleKind } from "@stall/db";
import { env } from "@stall/config";

export interface DeliveryPricingConfig {
  baseMinor: number;
  perKmMinor: number;
  perMinMinor: number;
  minMinor: number;
  currency: string;
  courierShareBps: number;
  vehicleMultipliers: Partial<Record<VehicleKind, number>>;
}

const DEFAULTS: Omit<DeliveryPricingConfig, "courierShareBps"> = {
  baseMinor: env.DELIVERY_BASE_FEE_MINOR,
  perKmMinor: env.DELIVERY_PER_KM_MINOR,
  perMinMinor: 0,
  minMinor: env.DELIVERY_BASE_FEE_MINOR,
  currency: "GHS",
  vehicleMultipliers: { BICYCLE: 0.9, MOTORBIKE: 1, CAR: 1.25, VAN: 1.6, TRUCK: 2.2 },
};

export async function deliveryPricingConfig(platformSlug: string): Promise<DeliveryPricingConfig> {
  const now = new Date();
  const [rules, payoutFee] = await Promise.all([
    prisma.pricingRule.findMany({
      where: {
        scope: "DELIVERY",
        OR: [{ platformSlug }, { platformSlug: null }],
        AND: [
          { OR: [{ activeFrom: null }, { activeFrom: { lte: now } }] },
          { OR: [{ activeTo: null }, { activeTo: { gt: now } }] },
        ],
      },
      orderBy: { priority: "desc" },
    }),
    prisma.feeSchedule.findMany({ where: { party: "COURIER", kind: "PAYOUT", OR: [{ platformSlug }, { platformSlug: null }] } }),
  ]);
  const rule = rules.find((r) => r.platformSlug === platformSlug) ?? rules[0];
  const p = (rule?.params ?? {}) as Partial<DeliveryPricingConfig> & { vehicleMultipliers?: Record<string, number> };

  const payoutRow = payoutFee.find((r) => r.platformSlug === platformSlug) ?? payoutFee[0];
  const percent = (payoutRow?.params as { percent?: number } | null)?.percent;
  const courierShareBps = typeof percent === "number" ? Math.round(percent * 100) : env.DELIVERY_COURIER_SHARE_BPS;

  return {
    baseMinor: p.baseMinor ?? DEFAULTS.baseMinor,
    perKmMinor: p.perKmMinor ?? DEFAULTS.perKmMinor,
    perMinMinor: p.perMinMinor ?? DEFAULTS.perMinMinor,
    minMinor: p.minMinor ?? DEFAULTS.minMinor,
    currency: p.currency ?? DEFAULTS.currency,
    courierShareBps,
    vehicleMultipliers: { ...DEFAULTS.vehicleMultipliers, ...(p.vehicleMultipliers ?? {}) },
  };
}

export interface DeliveryQuote {
  distanceM: number;
  durationS: number;
  feeMinor: number;
  courierPayoutMinor: number;
  currency: string;
}

export async function quoteDeliveryFee(input: {
  platformSlug: string;
  distanceM: number;
  durationS: number;
  vehicleType?: VehicleKind;
  currency?: string;
}): Promise<DeliveryQuote> {
  const cfg = await deliveryPricingConfig(input.platformSlug);
  const km = input.distanceM / 1000;
  const min = input.durationS / 60;
  const mult = cfg.vehicleMultipliers[input.vehicleType ?? "MOTORBIKE"] ?? 1;
  const raw = (cfg.baseMinor + cfg.perKmMinor * km + cfg.perMinMinor * min) * mult;
  const feeMinor = Math.max(cfg.minMinor, Math.round(raw / 10) * 10); // round to nearest 10 minor
  const courierPayoutMinor = Math.round((feeMinor * cfg.courierShareBps) / 10_000);
  return {
    distanceM: input.distanceM,
    durationS: input.durationS,
    feeMinor,
    courierPayoutMinor,
    currency: input.currency ?? cfg.currency,
  };
}
