import { z } from "zod";
import { prisma } from "@stall/db";
import { auth as coreAuth } from "@stall/core";
import { withApi } from "@/src/http/route";
import { publicUser, tokenResponse } from "@/src/http/dto";

const Device = z.object({
  deviceId: z.string().min(4),
  platform: z.enum(["IOS", "ANDROID", "WEB"]),
  model: z.string().optional(),
  pushToken: z.string().optional(),
  appVersion: z.string().optional(),
});

const Body = z.object({
  provider: z.enum(["GOOGLE", "APPLE", "FACEBOOK"]),
  token: z.string().min(20),
  device: Device.optional(),
});

export const POST = withApi(
  { body: Body, rateLimit: { limit: 20, windowSec: 60, by: "ip" }, audit: "auth.social" },
  async ({ body, ctx }) => {
    const { tokens, userId, created } = await coreAuth.signInWithSocial({
      provider: body.provider,
      token: body.token,
      platform: ctx.platform,
      deviceId: body.device?.deviceId ?? ctx.deviceId,
      userAgent: ctx.userAgent,
      ip: ctx.ip,
    });
    if (body.device) await coreAuth.registerDevice(userId, body.device);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return { user: publicUser(user), created, ...tokenResponse(tokens) };
  },
);
