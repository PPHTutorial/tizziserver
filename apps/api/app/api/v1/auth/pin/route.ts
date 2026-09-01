import { z } from "zod";
import { auth as coreAuth } from "@stall/core";
import { withApi } from "@/src/http/route";

/** Set / replace the transaction PIN. A production flow should re-verify identity first. */
export const POST = withApi(
  { auth: true, body: z.object({ pin: z.string().regex(/^\d{4,6}$/) }), audit: "auth.pin.set" },
  async ({ body, ctx }) => {
    await coreAuth.setPin(ctx.principal!.userId, body.pin);
    return { set: true };
  },
);
