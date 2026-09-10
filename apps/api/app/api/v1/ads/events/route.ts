import { z } from "zod";
import { ads } from "@stall/core";
import { withApi } from "@/src/http/route";
const Body = z.object({
  campaignId: z.string(),
  adId: z.string().optional(),
  kind: z.enum(["IMPRESSION", "CLICK", "CONVERSION"]),
  placement: z.enum(["HOME_RAIL", "SEARCH_TOP", "CATEGORY_TOP", "PRODUCT_RELATED", "CHECKOUT_CROSS_SELL"]).optional(),
  sessionId: z.string().max(64).optional(),
});
/** Log an ad interaction (impression / click). Billing accrues from the campaign's tier;
 *  billable events are de-duped per viewer + creative for 90s. */
export const POST = withApi({ auth: false, body: Body, rateLimit: { limit: 240, windowSec: 60 } }, async ({ ctx, body }) =>
  ads.recordAdEvent({ ...body, userId: ctx.principal?.userId, platformSlug: ctx.platform, clientKey: ctx.ip }),
);
