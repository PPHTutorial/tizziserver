import { prisma, type DevicePlatform, type Role } from "@stall/db";

const normPhone = (p: string) => p.replace(/[^\d+]/g, "");

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
      data: { status: "ACTIVE", lastLoginAt: new Date() },
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
}

/** Edit the caller's own display name / avatar — the "Edit Profile" row in Settings. */
export async function updateProfile(userId: string, input: ProfileUpdateInput) {
  return prisma.user.update({
    where: { id: userId },
    data: {
      ...(input.firstName !== undefined ? { firstName: input.firstName.trim() || null } : {}),
      ...(input.lastName !== undefined ? { lastName: input.lastName.trim() || null } : {}),
      ...(input.avatar !== undefined ? { avatar: input.avatar.trim() || null } : {}),
    },
    select: { id: true, firstName: true, lastName: true, avatar: true, phone: true, email: true },
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
