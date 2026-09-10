import { z } from "zod";
import { referrals } from "@stall/core";
import { withApi } from "@/src/http/route";
const Body = z.object({ code: z.string().min(4).max(16), channel: z.string().max(32).optional() });
export const POST = withApi({ auth: true, body: Body, rateLimit: { limit: 10, windowSec: 60, by: "principal" }, audit: "referral.apply" }, async ({ ctx, body }) =>
  referrals.applyReferralCode(ctx.principal!.userId, body.code, body.channel),
);
