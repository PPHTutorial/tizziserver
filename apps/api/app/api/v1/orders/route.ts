import { z } from "zod";
import { commerce } from "@stall/core";
import { withApi } from "@/src/http/route";

const Query = z.object({
  status: z.enum([
    "PENDING_PAYMENT",
    "PLACED",
    "CONFIRMED",
    "PARTIALLY_FULFILLED",
    "FULFILLED",
    "CANCELLED",
    "REFUNDED",
  ]).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(50).optional(),
});

export const GET = withApi({ auth: true, query: Query }, async ({ ctx, query }) =>
  commerce.listOrders(ctx.principal!.userId, query),
);
