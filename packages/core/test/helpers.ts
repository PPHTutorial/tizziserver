import { prisma, type Role } from "@stall/db";

/**
 * Create a throwaway ACTIVE user holding a single ACTIVE role, with a
 * TokenEpoch row. Phone is randomised so parallel/repeat runs never collide.
 */
export async function makeUser(role: Role = "CUSTOMER") {
  const phone = `+1999${Date.now().toString().slice(-7)}${Math.floor(Math.random() * 900 + 100)}`;
  return prisma.user.create({
    data: {
      phone,
      status: "ACTIVE",
      roles: { create: { role, status: "ACTIVE", activatedAt: new Date() } },
      tokenEpoch: { create: {} },
    },
  });
}

/** Remove a user and every row the auth flows attach to it. */
export async function dropUser(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
  await prisma.auditLog.deleteMany({ where: { actorId: userId } });
  await prisma.userRole.deleteMany({ where: { userId } });
  await prisma.tokenEpoch.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
}
