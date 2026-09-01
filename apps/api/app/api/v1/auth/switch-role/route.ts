import type { NextRequest } from "next/server";
import { z } from "zod";
import { auth as coreAuth } from "@stall/core";
import { handle, ok } from "@/src/http/envelope";
import { getContext, requireAuth } from "@/src/http/context";

const Body = z.object({ role: z.enum(["CUSTOMER", "VENDOR", "COURIER", "STAFF", "ADMIN"]) });

export const POST = handle(async (req: NextRequest) => {
  const ctx = await getContext(req);
  const p = requireAuth(ctx);
  const { role } = Body.parse(await req.json());

  const res = await coreAuth.switchRole({
    userId: p.userId,
    sessionId: p.sessionId,
    toRole: role,
    platform: ctx.platform,
  });
  return ok(res);
});
