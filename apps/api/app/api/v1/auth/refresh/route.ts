import type { NextRequest } from "next/server";
import { z } from "zod";
import { auth as coreAuth } from "@stall/core";
import { handle, ok } from "@/src/http/envelope";
import { getContext } from "@/src/http/context";
import { tokenResponse } from "@/src/http/dto";

const Body = z.object({ refreshToken: z.string().min(20) });

export const POST = handle(async (req: NextRequest) => {
  const ctx = await getContext(req);
  const { refreshToken } = Body.parse(await req.json());

  const pair = await coreAuth.rotateTokenPair({
    refreshToken,
    platform: ctx.platform,
    userAgent: ctx.userAgent,
    ip: ctx.ip,
  });

  return ok(tokenResponse(pair));
});
