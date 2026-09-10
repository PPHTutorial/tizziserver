import { z } from "zod";
import { trust } from "@stall/core";
import { withApi } from "@/src/http/route";
const Body = z.object({
  kind: z.enum(["ORDER","PAYMENT","DELIVERY","VENDOR","COURIER","AUCTION"]),
  refId: z.string(),
  category: z.string().min(2).max(60),
  body: z.string().min(3).max(2000),
  evidence: z.array(z.object({ kind: z.enum(["TEXT","IMAGE","DOC"]).optional(), fileKey: z.string().optional(), body: z.string().optional() })).max(10).optional(),
});
export const GET = withApi({ auth: true }, async ({ ctx }) => trust.listDisputes(ctx.principal!.userId));
export const POST = withApi({ auth: true, body: Body, audit: "dispute.open" }, async ({ ctx, body }) => trust.openDispute(ctx.principal!.userId, body));

