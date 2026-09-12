/**
 * One-off local dev helper: upserts a STAFF/ADMIN test user and issues a
 * login OTP for it, printing the plaintext code (dev only — SMS_PROVIDER=log
 * already does this, but that goes to whatever terminal runs `next dev`,
 * which isn't visible here).
 *
 * Run: pnpm --filter @stall/db exec tsx ../core/scripts/admin-otp.ts
 */
import path from "node:path";
import { config as loadDotenv } from "dotenv";

loadDotenv({ path: path.resolve(import.meta.dirname, "../../../.env") });

const { prisma } = await import("@stall/db");
const { issueOtp } = await import("../src/auth/otp.ts");

const PHONE = process.argv[2] ?? "+233555000100";

async function main() {
  const existing = await prisma.user.findUnique({ where: { phone: PHONE } });
  const user =
    existing ??
    (await prisma.user.create({
      data: {
        phone: PHONE,
        status: "ACTIVE",
        firstName: "Test",
        lastName: "Admin",
        roles: { create: [{ role: "ADMIN", status: "ACTIVE", activatedAt: new Date() }] },
        tokenEpoch: { create: {} },
      },
    }));

  await prisma.userRole.upsert({
    where: { userId_role: { userId: user.id, role: "ADMIN" } },
    create: { userId: user.id, role: "ADMIN", status: "ACTIVE", activatedAt: new Date() },
    update: { status: "ACTIVE" },
  });

  const { code, expiresAt } = await issueOtp({ target: PHONE, channel: "SMS", purpose: "LOGIN", userId: user.id });

  console.log(`\nAdmin user: ${PHONE} (id ${user.id}, role ADMIN)`);
  console.log(`OTP code: ${code}`);
  console.log(`Expires at: ${expiresAt.toISOString()}\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
