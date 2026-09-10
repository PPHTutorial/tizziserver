import { z } from "zod";
import { commerce } from "@stall/core";
import { withApi } from "@/src/http/route";

const Body = z.object({
  fulfilmentMethod: z.enum(["DELIVERY", "PICKUP", "VENDOR_LOGISTICS"]).optional(),
  addressId: z.string().min(6).optional(),
  couponCode: z.string().max(40).optional(),
  payment: z.object({
    method: z.enum(["wallet", "gateway"]),
    gateway: z.string().max(24).optional(),
  }),
});

/**
 * Place the order from the caller's cart. Multi-vendor → one `Order` with a
 * `VendorOrder` per seller. `Idempotency-Key` header is honoured (replay-safe).
 */
export const POST = withApi(
  { auth: true, body: Body, idempotent: true, rateLimit: { limit: 20, windowSec: 60, by: "principal" }, audit: "commerce.checkout" },
  async ({ ctx, body }) =>
    commerce.placeOrder({
      userId: ctx.principal!.userId,
      platformSlug: ctx.platform,
      addressId: body.addressId,
      fulfilmentMethod: body.fulfilmentMethod,
      couponCode: body.couponCode,
      payment: body.payment,
    }),
);
