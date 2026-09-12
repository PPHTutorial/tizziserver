import { z } from "zod";
import { auth as coreAuth } from "@stall/core";
import { withApi } from "@/src/http/route";

const Body = z.object({ phone: z.string().min(8) });

/** Issue a verification code to add/change the caller's phone. */
export const POST = withApi(
  { auth: true, body: Body, rateLimit: { limit: 5, windowSec: 60, by: "principal" } },
  async ({ ctx, body }) => {
    const { code, expiresAt } = await coreAuth.requestPhoneChange(ctx.principal!.userId, body.phone);
    await coreAuth.sendSms(body.phone, `Your Stall verification code is ${code}. Expires in 10 minutes.`);
    return { sent: true, expiresAt: expiresAt.toISOString() };
  },
);
