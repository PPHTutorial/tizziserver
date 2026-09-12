import { prisma, type DevicePlatform, type Role } from "@stall/db";
import { AppError } from "../errors.ts";
import { issueOtp, verifyOtp } from "./otp.ts";

const normPhone = (p: string) => p.replace(/[^\d+]/g, "");
const USERNAME_RE = /^[a-zA-Z0-9_.]{3,24}$/;

/** Find or create a user by phone, ensuring they hold at least the CUSTOMER role. */
export async function findOrCreateUserByPhone(phoneRaw: string) {
  const phone = normPhone(phoneRaw);
  let user = await prisma.user.findUnique({ where: { phone }, include: { roles: true } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        phone,
        roles: { create: { role: "CUSTOMER", status: "PENDING" } },
        tokenEpoch: { create: {} },
      },
      include: { roles: true },
    });
  } else if (!user.roles.some((r) => r.role === "CUSTOMER")) {
    await prisma.userRole.create({ data: { userId: user.id, role: "CUSTOMER", status: "PENDING" } });
    user = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, include: { roles: true } });
  }
  return user;
}

/** After OTP: promote the user + their CUSTOMER role to ACTIVE. */
export async function markPhoneVerified(userId: string): Promise<void> {
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { status: "ACTIVE", lastLoginAt: new Date(), phoneVerifiedAt: new Date() },
    }),
    prisma.userRole.updateMany({
      where: { userId, role: "CUSTOMER", status: "PENDING" },
      data: { status: "ACTIVE", activatedAt: new Date() },
    }),
    prisma.tokenEpoch.upsert({ where: { userId }, create: { userId }, update: {} }),
  ]);
}

export async function activeRolesFor(userId: string): Promise<Role[]> {
  const rows = await prisma.userRole.findMany({
    where: { userId, status: "ACTIVE" },
    select: { role: true },
  });
  return rows.map((r) => r.role);
}

export interface ProfileUpdateInput {
  firstName?: string;
  lastName?: string;
  /** Storage object key from `POST /api/v1/media/upload` (kind: "avatar"). */
  avatar?: string;
  username?: string;
}

const PUBLIC_USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  avatar: true,
  phone: true,
  email: true,
  username: true,
  emailVerifiedAt: true,
  phoneVerifiedAt: true,
  status: true,
  locale: true,
} as const;

/** Edit the caller's own display name / avatar / username — the "Edit Profile" row in Settings. */
export async function updateProfile(userId: string, input: ProfileUpdateInput) {
  let username: string | undefined;
  if (input.username !== undefined) {
    username = input.username.trim();
    if (username) {
      if (!USERNAME_RE.test(username)) {
        throw new AppError("VALIDATION", "Username must be 3-24 characters: letters, numbers, underscore, or dot");
      }
      const taken = await prisma.user.findUnique({ where: { username } });
      if (taken && taken.id !== userId) throw new AppError("CONFLICT", "That username is taken");
    }
  }

  try {
    return await prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.firstName !== undefined ? { firstName: input.firstName.trim() || null } : {}),
        ...(input.lastName !== undefined ? { lastName: input.lastName.trim() || null } : {}),
        ...(input.avatar !== undefined ? { avatar: input.avatar.trim() || null } : {}),
        ...(username !== undefined ? { username: username || null } : {}),
      },
      select: PUBLIC_USER_SELECT,
    });
  } catch (e) {
    // Race-condition backstop for the uniqueness pre-check above.
    if (e && typeof e === "object" && "code" in e && e.code === "P2002") {
      throw new AppError("CONFLICT", "That username is taken");
    }
    throw e;
  }
}

/** Request an OTP to add/change the caller's email — sending happens at the route layer. */
export async function requestEmailChange(userId: string, email: string) {
  const norm = email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: norm } });
  if (existing && existing.id !== userId) throw new AppError("CONFLICT", "That email is already in use");
  return issueOtp({ target: norm, channel: "EMAIL", purpose: "VERIFY_EMAIL", userId });
}

/** Verify the OTP and set the caller's email as verified. */
export async function confirmEmailChange(userId: string, email: string, code: string) {
  const norm = email.trim().toLowerCase();
  await verifyOtp({ target: norm, channel: "EMAIL", purpose: "VERIFY_EMAIL", code });
  const existing = await prisma.user.findUnique({ where: { email: norm } });
  if (existing && existing.id !== userId) throw new AppError("CONFLICT", "That email is already in use");
  return prisma.user.update({
    where: { id: userId },
    data: { email: norm, emailVerifiedAt: new Date() },
    select: PUBLIC_USER_SELECT,
  });
}

/** Request an OTP to add/change the caller's phone — sending happens at the route layer. */
export async function requestPhoneChange(userId: string, phone: string) {
  const norm = normPhone(phone);
  const existing = await prisma.user.findUnique({ where: { phone: norm } });
  if (existing && existing.id !== userId) throw new AppError("CONFLICT", "That phone number is already in use");
  return issueOtp({ target: norm, channel: "SMS", purpose: "VERIFY_PHONE", userId });
}

/** Verify the OTP and set the caller's phone as verified. */
export async function confirmPhoneChange(userId: string, phone: string, code: string) {
  const norm = normPhone(phone);
  await verifyOtp({ target: norm, channel: "SMS", purpose: "VERIFY_PHONE", code });
  const existing = await prisma.user.findUnique({ where: { phone: norm } });
  if (existing && existing.id !== userId) throw new AppError("CONFLICT", "That phone number is already in use");
  return prisma.user.update({
    where: { id: userId },
    data: { phone: norm, phoneVerifiedAt: new Date() },
    select: PUBLIC_USER_SELECT,
  });
}

export interface DeviceInput {
  deviceId: string;
  platform: DevicePlatform;
  model?: string;
  pushToken?: string;
  appVersion?: string;
}

export async function registerDevice(userId: string, d: DeviceInput): Promise<void> {
  await prisma.device.upsert({
    where: { deviceId: d.deviceId },
    create: { userId, ...d },
    update: {
      userId,
      platform: d.platform,
      model: d.model,
      pushToken: d.pushToken,
      appVersion: d.appVersion,
      lastSeenAt: new Date(),
    },
  });
}
