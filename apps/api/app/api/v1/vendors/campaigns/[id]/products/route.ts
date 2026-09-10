import { z } from "zod";
import { ads } from "@stall/core";
import { withApi } from "@/src/http/route";
const Body = z.object({ productIds: z.array(z.string()).max(50) });
export const POST = withApi({ auth: "VENDOR", capability: "advertising", body: Body }, async ({ ctx, body, params }) =>
  ads.setCampaignProducts(ctx.principal!.userId, params.id!, body.productIds),
);
