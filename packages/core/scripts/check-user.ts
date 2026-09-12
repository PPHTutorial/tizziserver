import path from "node:path";
import { config as loadDotenv } from "dotenv";

loadDotenv({ path: path.resolve(import.meta.dirname, "../../../.env") });

const { prisma } = await import("@stall/db");

const PHONE = process.argv[2] ?? "+233555000100";

const u = await prisma.user.findUnique({
  where: { phone: PHONE },
  include: { roles: true, credentials: true, sessions: { orderBy: { createdAt: "desc" }, take: 3 } },
});
console.log(JSON.stringify(u, null, 2));
await prisma.$disconnect();
