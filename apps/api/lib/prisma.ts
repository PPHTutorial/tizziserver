/**
 * Compatibility shim — the Prisma singleton now lives in `@grandprice/db`.
 * Existing imports (`import prisma from '@/lib/prisma'`) keep working.
 */
export { prisma as default, prisma } from "@grandprice/db";
