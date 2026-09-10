import { z } from "zod";
import { delivery } from "@stall/core";
import { withApi } from "@/src/http/route";
const Body = z.object({ category: z.string().min(2).max(60), body: z.string().min(3).max(2000), evidence: z.unknown().optional() });
export const POST = withApi({ auth: true, body: Body, audit: "delivery.dispute.open" }, async ({ ctx, params, body }) =>
  delivery.openDeliveryDispute(ctx.principal!.userId, params.id!, body),
);

