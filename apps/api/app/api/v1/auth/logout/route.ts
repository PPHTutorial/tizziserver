import { z } from "zod";
import { auth as coreAuth } from "@stall/core";
import { withApi } from "@/src/http/route";

const Body = z.object({ everywhere: z.boolean().default(false) });

export const POST = withApi(
  { body: Body, auth: true, audit: "auth.logout" },
  async ({ body, ctx }) => {
    const p = ctx.principal!;
    if (body.everywhere) await coreAuth.revokeAllForUser(p.userId);
    else await coreAuth.revokeSession(p.sessionId);
    return { loggedOut: true, everywhere: body.everywhere };
  },
);
