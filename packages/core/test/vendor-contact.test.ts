/**
 * Seller contact (tap-to-reveal phone) + product media editing.
 * Covers catalog/vendors.ts `revealVendorPhone` / `hasRevealablePhone`,
 * `updateMyVendorProfile`'s `showPhone`, onboarding resubmits, and
 * `updateProductDraft`'s independent IMAGE / VIDEO handling.
 */
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@stall/db";
import {
  createProductDraft,
  getProductDetail,
  hasRevealablePhone,
  publishProduct,
  revealVendorPhone,
  reviewProduct,
  reviewVendorKyc,
  startVendorOnboarding,
  updateMyVendorProfile,
  updateProductDraft,
} from "../src/catalog/index.ts";
import { dropUser, makeUser } from "./helpers.ts";

const trashUsers: string[] = [];
const trashVendors: string[] = [];

afterAll(async () => {
  for (const id of trashVendors) {
    await prisma.product.deleteMany({ where: { vendorId: id } }).catch(() => {});
    await prisma.kycCase.deleteMany({ where: { subjectId: id } }).catch(() => {});
    await prisma.business.deleteMany({ where: { vendorId: id } }).catch(() => {});
    await prisma.vendorProfile.deleteMany({ where: { id } }).catch(() => {});
  }
  for (const id of trashUsers) await dropUser(id).catch(() => {});
  await prisma.$disconnect();
});

const uniquePhone = () => `+23355${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`;

/** An onboarded vendor; `approve` makes it ACTIVE so it can author products. */
async function makeVendor(opts: { businessPhone?: string; verifiedLogin?: boolean; showPhone?: boolean; approve?: boolean } = {}) {
  const user = await makeUser();
  trashUsers.push(user.id);
  if (opts.verifiedLogin) {
    await prisma.user.update({ where: { id: user.id }, data: { phoneVerifiedAt: new Date() } });
  }
  const onboard = await startVendorOnboarding({
    userId: user.id,
    platformSlug: "grandprice",
    displayName: "Contact Test Store",
    showPhone: opts.showPhone,
    business: { legalName: "Contact Test Ltd", country: "GH", city: "Accra", phone: opts.businessPhone },
  });
  trashVendors.push(onboard.vendorId);
  if (opts.approve) await reviewVendorKyc(onboard.vendorId, "APPROVED");
  return { user, vendorId: onboard.vendorId };
}

const rejectsNotFound = (p: Promise<unknown>) => expect(p).rejects.toMatchObject({ code: "NOT_FOUND" });

describe("revealVendorPhone / hasRevealablePhone", () => {
  it("prefers Business.phones[0] over the owner's login phone", async () => {
    const biz = uniquePhone();
    const { vendorId } = await makeVendor({ businessPhone: biz, verifiedLogin: true });
    await expect(revealVendorPhone(vendorId)).resolves.toEqual({ phone: biz });
  });

  it("falls back to the owner's verified login phone", async () => {
    const { user, vendorId } = await makeVendor({ verifiedLogin: true });
    await expect(revealVendorPhone(vendorId)).resolves.toEqual({ phone: user.phone });
  });

  it("never reveals an unverified login phone", async () => {
    const { vendorId } = await makeVendor({ verifiedLogin: false });
    await rejectsNotFound(revealVendorPhone(vendorId));
  });

  it("honours the showPhone=false opt-out even with a business phone", async () => {
    const { vendorId } = await makeVendor({ businessPhone: uniquePhone(), verifiedLogin: true, showPhone: false });
    await rejectsNotFound(revealVendorPhone(vendorId));
  });

  it("does not reveal a deleted owner's number", async () => {
    const { user, vendorId } = await makeVendor({ businessPhone: uniquePhone(), verifiedLogin: true });
    await prisma.user.update({ where: { id: user.id }, data: { deletedAt: new Date() } });
    await rejectsNotFound(revealVendorPhone(vendorId));
  });

  it("404s an unknown vendor", async () => {
    await rejectsNotFound(revealVendorPhone("no-such-vendor"));
  });

  it("hasRevealablePhone mirrors the reveal rules", () => {
    const live = { phoneVerifiedAt: null, deletedAt: null };
    expect(hasRevealablePhone({ showPhone: true, business: { phones: ["+233200000000"] }, user: live })).toBe(true);
    expect(hasRevealablePhone({ showPhone: true, business: { phones: ["  "] }, user: live })).toBe(false);
    expect(hasRevealablePhone({ showPhone: true, business: null, user: { ...live, phoneVerifiedAt: new Date() } })).toBe(true);
    expect(hasRevealablePhone({ showPhone: false, business: { phones: ["+233200000000"] }, user: live })).toBe(false);
    expect(
      hasRevealablePhone({ showPhone: true, business: { phones: ["+233200000000"] }, user: { ...live, deletedAt: new Date() } }),
    ).toBe(false);
  });
});

describe("vendor profile phone settings", () => {
  it("startVendorOnboarding resubmit replaces (and can clear) Business.phones", async () => {
    const first = uniquePhone();
    const { user, vendorId } = await makeVendor({ businessPhone: first });
    const second = uniquePhone();
    const base = { userId: user.id, platformSlug: "grandprice", displayName: "Contact Test Store" };

    await startVendorOnboarding({ ...base, business: { legalName: "Contact Test Ltd", phone: second } });
    expect((await prisma.business.findUniqueOrThrow({ where: { vendorId } })).phones).toEqual([second]);

    // Omitting the phone leaves it alone; an empty string clears it.
    await startVendorOnboarding({ ...base, business: { legalName: "Contact Test Ltd" } });
    expect((await prisma.business.findUniqueOrThrow({ where: { vendorId } })).phones).toEqual([second]);
    await startVendorOnboarding({ ...base, business: { legalName: "Contact Test Ltd", phone: "" } });
    expect((await prisma.business.findUniqueOrThrow({ where: { vendorId } })).phones).toEqual([]);
  });

  it("updateMyVendorProfile toggles showPhone, which gates the reveal", async () => {
    const biz = uniquePhone();
    const { user, vendorId } = await makeVendor({ businessPhone: biz });

    expect((await updateMyVendorProfile(user.id, { showPhone: false })).showPhone).toBe(false);
    await rejectsNotFound(revealVendorPhone(vendorId));

    // Unrelated edits don't flip it back.
    expect((await updateMyVendorProfile(user.id, { bio: "hello" })).showPhone).toBe(false);

    expect((await updateMyVendorProfile(user.id, { showPhone: true })).showPhone).toBe(true);
    await expect(revealVendorPhone(vendorId)).resolves.toEqual({ phone: biz });
  });
});

describe("product media + public detail payload", () => {
  async function draftFor(userId: string) {
    const category = await prisma.category.findFirstOrThrow({ where: { slug: "phones" } });
    return createProductDraft({
      userId,
      platformSlug: "grandprice",
      title: "Contact Bench Phone",
      description: "A phone for the contact test bench.",
      categoryId: category.id,
      priceMinor: 120000,
    });
  }
  const mediaOf = async (productId: string) =>
    prisma.productMedia.findMany({ where: { productId }, orderBy: [{ kind: "asc" }, { sortOrder: "asc" }], select: { kind: true, fileKey: true } });

  it("replaces/clears the video without touching images, and vice versa", async () => {
    const { user } = await makeVendor({ approve: true });
    const draft = await draftFor(user.id);
    const userId = user.id;

    await updateProductDraft({ userId, productId: draft.id, images: ["t/a.jpg", "t/b.jpg"], video: "t/v1.mp4" });
    expect(await mediaOf(draft.id)).toEqual([
      { kind: "IMAGE", fileKey: "t/a.jpg" },
      { kind: "IMAGE", fileKey: "t/b.jpg" },
      { kind: "VIDEO", fileKey: "t/v1.mp4" },
    ]);

    // Replace the video only.
    await updateProductDraft({ userId, productId: draft.id, video: "t/v2.mp4" });
    expect(await mediaOf(draft.id)).toEqual([
      { kind: "IMAGE", fileKey: "t/a.jpg" },
      { kind: "IMAGE", fileKey: "t/b.jpg" },
      { kind: "VIDEO", fileKey: "t/v2.mp4" },
    ]);

    // Replace images only — the video survives.
    await updateProductDraft({ userId, productId: draft.id, images: ["t/c.jpg"] });
    expect(await mediaOf(draft.id)).toEqual([
      { kind: "IMAGE", fileKey: "t/c.jpg" },
      { kind: "VIDEO", fileKey: "t/v2.mp4" },
    ]);

    // Clear the video with an empty string.
    await updateProductDraft({ userId, productId: draft.id, video: "" });
    expect(await mediaOf(draft.id)).toEqual([{ kind: "IMAGE", fileKey: "t/c.jpg" }]);
  });

  it("refuses to submit a video-only product", async () => {
    const { user } = await makeVendor({ approve: true });
    const draft = await draftFor(user.id);
    await updateProductDraft({ userId: user.id, productId: draft.id, video: "t/only.mp4", quantity: 2 });
    await expect(publishProduct(user.id, draft.id)).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("exposes vendor.phoneAvailable but never the number itself", async () => {
    const biz = uniquePhone();
    const { user } = await makeVendor({ businessPhone: biz, verifiedLogin: true, approve: true });
    const draft = await draftFor(user.id);
    await updateProductDraft({ userId: user.id, productId: draft.id, images: ["t/p.jpg"], quantity: 3 });
    await publishProduct(user.id, draft.id);
    const admin = await makeUser();
    trashUsers.push(admin.id);
    await reviewProduct(admin.id, draft.id, "APPROVE");

    const detail = await getProductDetail(draft.id, "grandprice");
    const offer = detail.offers[0]!;
    expect(offer.vendor.phoneAvailable).toBe(true);
    expect(offer.vendor).not.toHaveProperty("phone");
    expect(offer.vendor).not.toHaveProperty("business");
    expect(offer.vendor).not.toHaveProperty("user");
    const json = JSON.stringify(detail);
    expect(json).not.toContain(biz);
    expect(json).not.toContain(user.phone);

    await updateMyVendorProfile(user.id, { showPhone: false });
    expect((await getProductDetail(draft.id, "grandprice")).offers[0]!.vendor.phoneAvailable).toBe(false);
  });
});
