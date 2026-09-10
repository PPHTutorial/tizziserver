import { z } from "zod";
import { delivery } from "@stall/core";
import { withApi } from "@/src/http/route";
const Body = z.object({ stars: z.number().int().min(1).max(5), tags: z.array(z.string().max(40)).max(8).optional(), comment: z.string().max(500).optional() });
export const POST = withApi({ auth: true, body: Body }, async ({ ctx, params, body }) =>
  delivery.rateDelivery(ctx.principal!.userId, params.id!, "CUSTOMER", body),
);

