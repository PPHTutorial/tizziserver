import { z } from "zod";
import { delivery } from "@stall/core";
import { withApi } from "@/src/http/route";
const Body = z.object({ scheduledFor: z.string().datetime() });
export const POST = withApi({ auth: true, body: Body }, async ({ ctx, params, body }) =>
  delivery.rescheduleDelivery(ctx.principal!.userId, "customer", params.id!, new Date(body.scheduledFor)),
);

