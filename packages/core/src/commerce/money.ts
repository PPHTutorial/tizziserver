import { prisma } from "@stall/db";

/** Apply a basis-points rate to a minor-unit amount (banker-free round-half-up). */
export const applyBps = (amountMinor: number, bps: number): number => Math.round((amountMinor * bps) / 10_000);

export interface CheckoutFeeConfig {
  serviceFeeBps: number;
  taxBps: number;
  deliveryFlatMinor: number;
  freeDeliveryThresholdMinor: number;
}

const DEFAULT_FEES: CheckoutFeeConfig = {
  serviceFeeBps: 200, // 2%
  taxBps: 0,
  deliveryFlatMinor: 1500, // GHS 15.00 — a flat fee until Phase 4 wires real distance pricing
  freeDeliveryThresholdMinor: 20_000,
};

/** Per-platform checkout fee config from `AppConfig(key="checkout.fees")`, with safe defaults. */
export async function checkoutFeeConfig(platformSlug: string): Promise<CheckoutFeeConfig> {
  const rows = await prisma.appConfig.findMany({
    where: { key: "checkout.fees", OR: [{ platformSlug }, { platformSlug: null }] },
  });
  const row = rows.find((r) => r.platformSlug === platformSlug) ?? rows[0];
  const v = (row?.value ?? {}) as Partial<CheckoutFeeConfig>;
  return { ...DEFAULT_FEES, ...v };
}

/** Vendor commission in basis points from `FeeSchedule(VENDOR, COMMISSION)`. Default 10%. */
export async function commissionBps(platformSlug: string): Promise<number> {
  const rows = await prisma.feeSchedule.findMany({
    where: { party: "VENDOR", kind: "COMMISSION", OR: [{ platformSlug }, { platformSlug: null }] },
  });
  const row = rows.find((r) => r.platformSlug === platformSlug) ?? rows[0];
  const percent = (row?.params as { percent?: number } | null)?.percent;
  return typeof percent === "number" ? Math.round(percent * 100) : 1000;
}
