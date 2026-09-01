import type { NextRequest } from "next/server";
import { z } from "zod";
import { auth as coreAuth } from "@stall/core";
import { handle, ok } from "@/src/http/envelope";
import { getContext, requireAuth } from "@/src/http/context";

export const GET = handle(async (req: NextRequest) => {
  const ctx = await getContext(req);
  const p = requireAuth(ctx);
  return ok(await coreAuth.listSessions(p.userId, p.sessionId));
});

const DelBody = z.object({ sessionId: z.string().min(6) });

export const DELETE = handle(async (req: NextRequest) => {
  const ctx = await getContext(req);
  const p = requireAuth(ctx);
  const { sessionId } = DelBody.parse(await req.json());
  // A user may only revoke their own sessions; listSessions already scopes to the user,
  // and revokeSession is a no-op for ids that aren't theirs + still active.
  const mine = (await coreAuth.listSessions(p.userId)).some((s) => s.id === sessionId);
  if (!mine) return ok({ revoked: false });
  await coreAuth.revokeSession(sessionId, "user-revoked");
  return ok({ revoked: true });
});
