import { prisma, type AddressKind } from "@stall/db";
import { AppError } from "../errors.ts";

export interface AddressInput {
  label?: string;
  recipientName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  region?: string;
  country: string;
  postalCode?: string;
  kind?: AddressKind;
  isDefault?: boolean;
}

const shape = (a: {
  id: string;
  label: string | null;
  recipientName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  region: string | null;
  country: string;
  postalCode: string | null;
  kind: AddressKind;
  isDefault: boolean;
}) => ({
  id: a.id,
  label: a.label,
  recipientName: a.recipientName,
  phone: a.phone,
  line1: a.line1,
  line2: a.line2,
  city: a.city,
  region: a.region,
  country: a.country,
  postalCode: a.postalCode,
  kind: a.kind,
  isDefault: a.isDefault,
});

export async function listAddresses(userId: string) {
  const rows = await prisma.address.findMany({
    where: { userId, deletedAt: null },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });
  return rows.map(shape);
}

export async function getAddress(userId: string, id: string) {
  const a = await prisma.address.findFirst({ where: { id, userId, deletedAt: null } });
  if (!a) throw new AppError("NOT_FOUND", "Address not found");
  return a;
}

export async function createAddress(userId: string, input: AddressInput) {
  const count = await prisma.address.count({ where: { userId, deletedAt: null } });
  const isDefault = input.isDefault ?? count === 0;
  const created = await prisma.$transaction(async (tx) => {
    if (isDefault) await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
    return tx.address.create({
      data: {
        userId,
        label: input.label,
        recipientName: input.recipientName,
        phone: input.phone,
        line1: input.line1,
        line2: input.line2,
        city: input.city,
        region: input.region,
        country: input.country.toUpperCase().slice(0, 2),
        postalCode: input.postalCode,
        kind: input.kind ?? "HOME",
        isDefault,
      },
    });
  });
  return shape(created);
}

export async function updateAddress(userId: string, id: string, input: Partial<AddressInput>) {
  await getAddress(userId, id);
  const updated = await prisma.$transaction(async (tx) => {
    if (input.isDefault) await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
    return tx.address.update({
      where: { id },
      data: {
        label: input.label,
        recipientName: input.recipientName,
        phone: input.phone,
        line1: input.line1,
        line2: input.line2,
        city: input.city,
        region: input.region,
        country: input.country ? input.country.toUpperCase().slice(0, 2) : undefined,
        postalCode: input.postalCode,
        kind: input.kind,
        isDefault: input.isDefault,
      },
    });
  });
  return shape(updated);
}

export async function deleteAddress(userId: string, id: string) {
  await getAddress(userId, id);
  await prisma.address.update({ where: { id }, data: { deletedAt: new Date(), isDefault: false } });
  return { deleted: true as const };
}

export async function setDefaultAddress(userId: string, id: string) {
  await getAddress(userId, id);
  await prisma.$transaction([
    prisma.address.updateMany({ where: { userId }, data: { isDefault: false } }),
    prisma.address.update({ where: { id }, data: { isDefault: true } }),
  ]);
  return listAddresses(userId);
}

/** Frozen copy stored on the order (survives later address edits/deletes). */
export function addressSnapshot(a: {
  recipientName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  region: string | null;
  country: string;
  postalCode: string | null;
}) {
  return {
    recipientName: a.recipientName,
    phone: a.phone,
    line1: a.line1,
    line2: a.line2,
    city: a.city,
    region: a.region,
    country: a.country,
    postalCode: a.postalCode,
  };
}
