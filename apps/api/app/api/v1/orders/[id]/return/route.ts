import { z } from "zod";
import { commerce } from "@stall/core";
import { withApi } from "@/src/http/route";

const Body = z.object({
  vendorOrderId: z.string().min(6),
  reason: z.string().min(3).max(500),
  items: z.array(z.object({ orderItemId: z.string(), qty: z.number().int().positive() })).min(1),
});

export const POST = withApi(
  { auth: true, body: Body, audit: "commerce.order.return" },
  async ({ ctx, body }) =>
    commerce.requestReturn(ctx.principal!.userId, body.vendorOrderId, { reason: body.reason, items: body.items }),
);
