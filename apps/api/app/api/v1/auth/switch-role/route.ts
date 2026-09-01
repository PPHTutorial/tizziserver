import { z } from "zod";
import { auth as coreAuth } from "@stall/core";
import { withApi } from "@/src/http/route";

const Body = z.object({ role: z.enum(["CUSTOMER", "VENDOR", "COURIER", "STAFF", "ADMIN"]) });

export const POST = withApi(
  { body: Body, auth: true, rateLimit: { limit: 20, windowSec: 60, by: "principal" }, audit: "auth.role.switch" },
  async ({ body, ctx }) => {
    const p = ctx.principal!;
    return coreAuth.switchRole({ userId: p.userId, sessionId: p.sessionId, toRole: body.role, platform: ctx.platform });
  },
);
