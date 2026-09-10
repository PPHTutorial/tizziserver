import { prisma } from "@stall/db";
import { AppError } from "../errors.ts";

const shape = (m: {
  id: string;
  gateway: string;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
  isDefault: boolean;
}) => ({
  id: m.id,
  gateway: m.gateway,
  brand: m.brand,
  last4: m.last4,
  expMonth: m.expMonth,
  expYear: m.expYear,
  isDefault: m.isDefault,
});

export async function listPaymentMethods(userId: string) {
  const rows = await prisma.paymentMethod.findMany({
    where: { userId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });
  return rows.map(shape);
}

/** Save a tokenized method (the token comes from the gateway's client SDK). */
export async function addPaymentMethod(
  userId: string,
  input: { gateway: string; token: string; brand?: string; last4?: string; expMonth?: number; expYear?: number; makeDefault?: boolean },
) {
  const count = await prisma.paymentMethod.count({ where: { userId } });
  const isDefault = input.makeDefault ?? count === 0;
  const created = await prisma.$transaction(async (tx) => {
    if (isDefault) await tx.paymentMethod.updateMany({ where: { userId }, data: { isDefault: false } });
    return tx.paymentMethod.create({
      data: {
        userId,
        gateway: input.gateway,
        token: input.token,
        brand: input.brand,
        last4: input.last4,
        expMonth: input.expMonth,
        expYear: input.expYear,
        isDefault,
      },
    });
  });
  return shape(created);
}

export async function removePaymentMethod(userId: string, id: string) {
  const m = await prisma.paymentMethod.findFirst({ where: { id, userId } });
  if (!m) throw new AppError("NOT_FOUND", "Payment method not found");
  await prisma.paymentMethod.delete({ where: { id } });
  return { deleted: true as const };
}
