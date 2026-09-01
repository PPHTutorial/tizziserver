import { z } from "zod";
import { auth as coreAuth } from "@stall/core";
import { withApi } from "@/src/http/route";
import { tokenResponse } from "@/src/http/dto";

const Body = z.object({ refreshToken: z.string().min(20) });

export const POST = withApi(
  { body: Body, rateLimit: { limit: 30, windowSec: 60, by: "ip" } },
  async ({ body, ctx }) => {
    const pair = await coreAuth.rotateTokenPair({
      refreshToken: body.refreshToken,
      platform: ctx.platform,
      userAgent: ctx.userAgent,
      ip: ctx.ip,
    });
    return tokenResponse(pair);
  },
);
