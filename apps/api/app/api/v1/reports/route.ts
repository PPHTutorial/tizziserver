import { z } from "zod";
import { trust } from "@stall/core";
import { withApi } from "@/src/http/route";
const Body = z.object({
  targetType: z.enum(["USER","PRODUCT","VENDOR","COURIER","CONVERSATION","ORDER","DELIVERY"]),
  targetId: z.string(),
  category: z.string().min(2).max(60),
  body: z.string().min(3).max(2000),
  evidence: z.unknown().optional(),
});
export const POST = withApi({ auth: true, body: Body, audit: "report.submit" }, async ({ ctx, body }) => trust.submitReport(ctx.principal!.userId, body));

