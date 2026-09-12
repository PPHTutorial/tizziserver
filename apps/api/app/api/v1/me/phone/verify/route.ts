import { z } from "zod";
import { auth as coreAuth } from "@stall/core";
import { publicUser } from "@/src/http/dto";
import { withApi } from "@/src/http/route";

const Body = z.object({ phone: z.string().min(8), code: z.string().min(4).max(8) });

/** Confirm the code and mark the caller's phone as verified. */
export const POST = withApi(
  { auth: true, body: Body, rateLimit: { limit: 10, windowSec: 60, by: "principal" }, audit: "auth.phone.verify" },
  async ({ ctx, body }) => publicUser(await coreAuth.confirmPhoneChange(ctx.principal!.userId, body.phone, body.code)),
);
