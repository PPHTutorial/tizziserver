import { z } from "zod";
import { auth as coreAuth } from "@stall/core";
import { withApi } from "@/src/http/route";

const Pin = z.string().regex(/^\d{4,6}$/);

/**
 * Set / replace the transaction PIN. Replacing an existing PIN requires
 * `currentPin`, or `otpCode` from `POST /auth/otp {purpose: "RESET_PIN"}`.
 */
export const POST = withApi(
  {
    auth: true,
    body: z.object({ pin: Pin, currentPin: Pin.optional(), otpCode: z.string().min(4).max(8).optional() }),
    rateLimit: { limit: 10, windowSec: 900, by: "principal" },
    audit: "auth.pin.set",
  },
  async ({ body, ctx }) => {
    await coreAuth.changePin(ctx.principal!.userId, body.pin, { currentPin: body.currentPin, otpCode: body.otpCode });
    return { set: true };
  },
);
