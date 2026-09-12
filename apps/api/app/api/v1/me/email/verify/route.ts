import { z } from "zod";
import { auth as coreAuth } from "@stall/core";
import { publicUser } from "@/src/http/dto";
import { withApi } from "@/src/http/route";

const Body = z.object({ email: z.string().email(), code: z.string().min(4).max(8) });

/** Confirm the code and mark the caller's email as verified. */
export const POST = withApi(
  { auth: true, body: Body, rateLimit: { limit: 10, windowSec: 60, by: "principal" }, audit: "auth.email.verify" },
  async ({ ctx, body }) => publicUser(await coreAuth.confirmEmailChange(ctx.principal!.userId, body.email, body.code)),
);
