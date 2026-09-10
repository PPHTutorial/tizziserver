/** Campaign creatives (the actual cards / banners shown in a placement slot). */
import { prisma, type AdCreativeKind, type AdPlacementSlot } from "@stall/db";
import { AppError } from "../errors.ts";

export interface AdCreativeInput {
  slot: AdPlacementSlot;
  creativeKind?: AdCreativeKind;
  headline?: string;
  subtext?: string;
  imageKey?: string;
  productId?: string;
  destinationRoute?: string;
  weight?: number;
}

async function mustOwnCampaign(vendorId: string, campaignId: string) {
  const c = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { id: true, vendorId: true, status: true } });
  if (!c || c.vendorId !== vendorId) throw new AppError("NOT_FOUND", "Campaign not found");
  return c;
}

export async function addCreative(vendorId: string, campaignId: string, input: AdCreativeInput) {
  await mustOwnCampaign(vendorId, campaignId);
  const a = await prisma.advertisement.create({
    data: {
      campaignId,
      slot: input.slot,
      creativeKind: input.creativeKind ?? "PRODUCT_CARD",
      headline: input.headline,
      subtext: input.subtext,
      imageKey: input.imageKey,
      productId: input.productId,
      destinationRoute: input.destinationRoute,
      weight: input.weight ?? 100,
    },
  });
  return { id: a.id, slot: a.slot, creativeKind: a.creativeKind };
}

export async function updateCreative(vendorId: string, adId: string, patch: Partial<AdCreativeInput> & { isActive?: boolean }) {
  const a = await prisma.advertisement.findUnique({ where: { id: adId }, include: { campaign: { select: { vendorId: true } } } });
  if (!a || a.campaign.vendorId !== vendorId) throw new AppError("NOT_FOUND", "Creative not found");
  const updated = await prisma.advertisement.update({
    where: { id: adId },
    data: {
      slot: patch.slot,
      creativeKind: patch.creativeKind,
      headline: patch.headline,
      subtext: patch.subtext,
      imageKey: patch.imageKey,
      productId: patch.productId,
      destinationRoute: patch.destinationRoute,
      weight: patch.weight,
      isActive: patch.isActive,
    },
  });
  return { id: updated.id, isActive: updated.isActive };
}

export async function removeCreative(vendorId: string, adId: string) {
  const a = await prisma.advertisement.findUnique({ where: { id: adId }, include: { campaign: { select: { vendorId: true } } } });
  if (!a || a.campaign.vendorId !== vendorId) throw new AppError("NOT_FOUND", "Creative not found");
  await prisma.advertisement.delete({ where: { id: adId } });
  return { id: adId, removed: true };
}
