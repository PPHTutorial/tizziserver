import { prisma } from "../src/index.ts";

const tables = await prisma.$queryRaw<{ n: number }[]>`
  select count(*)::int as n from information_schema.tables where table_schema = 'public'`;
const gist = await prisma.$queryRaw<{ n: number }[]>`
  select count(*)::int as n from pg_indexes
  where schemaname = 'public' and indexdef ilike '%USING gist%'`;
const postgis = await prisma.$queryRaw<{ v: string }[]>`
  select extversion as v from pg_extension where extname = 'postgis'`;

const gp = await prisma.platformFeature.findMany({
  where: { platformSlug: "grandprice", flagKey: { in: ["auction", "advertising", "catalog.scope"] } },
  select: { flagKey: true, value: true },
});
const tg = await prisma.platformFeature.findMany({
  where: { platformSlug: "tizzi-gas", flagKey: { in: ["auction", "advertising", "catalog.scope"] } },
  select: { flagKey: true, value: true },
});

console.log("public tables :", tables[0]?.n);
console.log("GiST indexes  :", gist[0]?.n);
console.log("PostGIS       :", postgis[0]?.v ?? "(missing)");
console.log("users         :", await prisma.user.count());
console.log("grandprice    :", JSON.stringify(gp));
console.log("tizzi-gas     :", JSON.stringify(tg));

await prisma.$disconnect();
