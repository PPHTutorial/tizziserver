import path from "node:path";
import { config as loadDotenv } from "dotenv";

loadDotenv({ path: path.resolve(import.meta.dirname, "../../../.env") });

const { prisma } = await import("@stall/db");

const PHONE = process.argv[2] ?? "+233555000100";

const rows = await prisma.otp.findMany({
  where: { target: PHONE, purpose: "LOGIN" },
  orderBy: { createdAt: "desc" },
  take: 5,
});
for (const r of rows) {
  console.log(
    r.createdAt.toISOString(),
    "consumedAt=", r.consumedAt?.toISOString() ?? "null",
    "attempts=", r.attempts,
    "expiresAt=", r.expiresAt.toISOString(),
  );
}
await prisma.$disconnect();
