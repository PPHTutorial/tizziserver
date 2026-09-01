import { prisma } from "../src/index.ts";

const info = await prisma.$queryRaw<
  { db: string; usr: string }[]
>`select current_database() as db, current_user as usr`;
const tables = await prisma.$queryRaw<
  { n: number }[]
>`select count(*)::int as n from information_schema.tables where table_schema = 'public'`;
const users = await prisma.user.count();

console.log("DB connect OK  ->", info[0]);
console.log("public tables  ->", tables[0]?.n);
console.log("users rows     ->", users);
await prisma.$disconnect();
