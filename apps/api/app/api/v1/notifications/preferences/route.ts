import { z } from "zod";
import { comms } from "@stall/core";
import { withApi } from "@/src/http/route";
const CAT = z.enum(["ORDER","PAYMENT","DELIVERY","COURIER","AUCTION","TICKET","COUPON","VENDOR","PROMO","SECURITY","CHAT","SUPPORT"]);
const Body = z.object({ category: CAT, push: z.boolean().optional(), email: z.boolean().optional(), sms: z.boolean().optional(), inApp: z.boolean().optional() });
export const GET = withApi({ auth: true }, async ({ ctx }) => comms.getNotificationPreferences(ctx.principal!.userId));
export const PATCH = withApi({ auth: true, body: Body }, async ({ ctx, body }) => comms.setNotificationPreference(ctx.principal!.userId, body.category, body));

