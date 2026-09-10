import { commerce } from "@stall/core";
import { withApi } from "@/src/http/route";

/** Coupons a shopper can apply on this tenant (coupon centre). */
export const GET = withApi({ auth: true, capability: "coupons" }, async ({ ctx }) => ({
  items: await commerce.listCoupons(ctx.platform),
}));
