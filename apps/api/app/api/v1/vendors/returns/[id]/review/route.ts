import { z } from "zod";
import { commerce } from "@stall/core";
import { withApi } from "@/src/http/route";

/** Vendor approves (refunds) or rejects a return on one of their sub-orders. */
export const POST = withApi(
  {
    auth: "VENDOR",
    body: z.object({ decision: z.enum(["APPROVED", "REJECTED"]), note: z.string().max(500).optional() }),
    audit: "commerce.return.review",
  },
  async ({ ctx, params, body }) => commerce.reviewReturn(ctx.principal!.userId, params.id!, body.decision, body.note),
);
