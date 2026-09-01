import { z } from "zod";
import { prisma } from "@stall/db";
import { auth as coreAuth, AppError } from "@stall/core";
import { withApi } from "@/src/http/route";
import { publicUser, tokenResponse } from "@/src/http/dto";

const Device = z.object({
  deviceId: z.string().min(4),
  platform: z.enum(["IOS", "ANDROID", "WEB"]),
  model: z.string().optional(),
  pushToken: z.string().optional(),
  appVersion: z.string().optional(),
});

const Body = z
  .object({
    phone: z.string().min(8).optional(),
    email: z.string().email().optional(),
    code: z.string().min(4).max(8),
    purpose: z.enum(["LOGIN", "VERIFY_PHONE"]).default("LOGIN"),
    device: Device.optional(),
    activeRole: z.enum(["CUSTOMER", "VENDOR", "COURIER"]).optional(),
    /** required once the user has confirmed 2FA */
    totpCode: z.string().min(6).max(10).optional(),
  })
  .refine((b) => b.phone || b.email, { message: "phone or email is required" });

export const POST = withApi(
  {
    body: Body,
    rateLimit: { limit: 10, windowSec: 60, by: "ip" },
    audit: (r) => {
      const d = r.data as { user?: { id: string }; mfaRequired?: boolean };
      return d.user ? { action: "auth.login", actorId: d.user.id, targetType: "user", targetId: d.user.id } : null;
    },
  },
  async ({ body, ctx }) => {
    const channel = body.phone ? "SMS" : "EMAIL";
    const target = (body.phone ?? body.email)!;
    await coreAuth.verifyOtp({ target, channel, purpose: body.purpose, code: body.code });

    if (!body.phone) throw new AppError("VALIDATION", "Phone OTP is required to sign in");

    const user = await coreAuth.findOrCreateUserByPhone(body.phone);

    // 2FA gate
    if (await coreAuth.hasTotp(user.id)) {
      if (!body.totpCode) return { mfaRequired: true, methods: ["totp"] as const };
      if (!(await coreAuth.verifyTotp(user.id, body.totpCode))) {
        await prisma.loginActivity.create({
          data: { userId: user.id, ip: ctx.ip, ua: ctx.userAgent, result: "FAILED", reason: "totp" },
        });
        throw new AppError("INVALID_OTP", "Incorrect 2FA code");
      }
    }

    await coreAuth.markPhoneVerified(user.id);
    if (body.device) await coreAuth.registerDevice(user.id, body.device);

    const pair = await coreAuth.issueTokenPair({
      userId: user.id,
      platform: ctx.platform,
      deviceId: body.device?.deviceId ?? ctx.deviceId,
      userAgent: ctx.userAgent,
      ip: ctx.ip,
      activeRole: body.activeRole,
    });

    await prisma.loginActivity.create({
      data: { userId: user.id, deviceId: body.device?.deviceId, ip: ctx.ip, ua: ctx.userAgent, result: "SUCCESS" },
    });

    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    return { user: publicUser(fresh), ...tokenResponse(pair) };
  },
);
