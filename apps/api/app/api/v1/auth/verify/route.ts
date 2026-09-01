import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@stall/db";
import { auth as coreAuth, AppError } from "@stall/core";
import { handle, ok } from "@/src/http/envelope";
import { getContext } from "@/src/http/context";
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
  })
  .refine((b) => b.phone || b.email, { message: "phone or email is required" });

export const POST = handle(async (req: NextRequest) => {
  const ctx = await getContext(req);
  const b = Body.parse(await req.json());

  const channel = b.phone ? "SMS" : "EMAIL";
  const target = (b.phone ?? b.email)!;

  await coreAuth.verifyOtp({ target, channel, purpose: b.purpose, code: b.code });

  // Phone is the identity anchor. Email-only login is not a first-class path yet.
  if (!b.phone) throw new AppError("VALIDATION", "Phone OTP is required to sign in");

  const user = await coreAuth.findOrCreateUserByPhone(b.phone);
  await coreAuth.markPhoneVerified(user.id);
  if (b.device) await coreAuth.registerDevice(user.id, b.device);

  const pair = await coreAuth.issueTokenPair({
    userId: user.id,
    platform: ctx.platform,
    deviceId: b.device?.deviceId ?? ctx.deviceId,
    userAgent: ctx.userAgent,
    ip: ctx.ip,
    activeRole: b.activeRole,
  });

  await prisma.loginActivity.create({
    data: { userId: user.id, deviceId: b.device?.deviceId, ip: ctx.ip, ua: ctx.userAgent, result: "SUCCESS" },
  });

  const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  return ok({ user: publicUser(fresh), ...tokenResponse(pair) });
});
