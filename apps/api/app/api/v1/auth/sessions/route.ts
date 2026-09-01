import { z } from "zod";
import { auth as coreAuth } from "@stall/core";
import { withApi } from "@/src/http/route";

export const GET = withApi({ auth: true }, async ({ ctx }) => {
  const p = ctx.principal!;
  return coreAuth.listSessions(p.userId, p.sessionId);
});

export const DELETE = withApi(
  { auth: true, body: z.object({ sessionId: z.string().min(6) }), audit: "auth.session.revoke" },
  async ({ body, ctx }) => {
    const p = ctx.principal!;
    const mine = (await coreAuth.listSessions(p.userId)).some((s) => s.id === body.sessionId);
    if (!mine) return { revoked: false };
    await coreAuth.revokeSession(body.sessionId, "user-revoked");
    return { revoked: true };
  },
);
