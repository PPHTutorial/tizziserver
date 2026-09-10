import { z } from "zod";
import { delivery } from "@stall/core";
import { withApi } from "@/src/http/route";
const Body = z.object({ reason: z.string().max(300).optional() });
export const POST = withApi({ auth: true, body: Body, audit: "delivery.cancel" }, async ({ ctx, params, body }) =>
  delivery.customerCancelDelivery(ctx.principal!.userId, params.id!, body.reason),
);

