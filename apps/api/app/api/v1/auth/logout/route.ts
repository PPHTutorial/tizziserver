import type { NextRequest } from "next/server";
import { z } from "zod";
import { auth as coreAuth } from "@stall/core";
import { handle, ok } from "@/src/http/envelope";
import { getContext, requireAuth } from "@/src/http/context";

const Body = z.object({ everywhere: z.boolean().default(false) });

export const POST = handle(async (req: NextRequest) => {
  const ctx = await getContext(req);
  const p = requireAuth(ctx);
  const { everywhere } = Body.parse(await req.json().catch(() => ({})));

  if (everywhere) await coreAuth.revokeAllForUser(p.userId);
  else await coreAuth.revokeSession(p.sessionId);

  return ok({ loggedOut: true, everywhere });
});
