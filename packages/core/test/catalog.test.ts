import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@stall/db";
import {
  createProductDraft,
  getProductDetail,
  listMyProducts,
  listProducts,
  publishProduct,
  reviewVendorKyc,
  searchProducts,
  startVendorOnboarding,
  submitVendorKyc,
  updateProductDraft,
  vendorKycStatus,
} from "../src/catalog/index.ts";
import { isAppError } from "../src/index.ts";
import { dropUser, makeUser } from "./helpers.ts";

const trashUsers: string[] = [];
const trashVendors: string[] = [];

afterAll(async () => {
  for (const id of trashVendors) {
    await prisma.kycCase.deleteMany({ where: { subjectId: id } });
    await prisma.vendorProfile.deleteMany({ where: { id } });
  }
  for (const id of trashUsers) await dropUser(id);
  await prisma.$disconnect();
});

describe("catalog browse — per-tenant scope", () => {
  it("grandprice sees general products, not gas", async () => {
    const { items } = await listProducts({ platformSlug: "grandprice" });
    const slugs = items.map((p) => p.slug);
    expect(slugs).toContain("orbit-a54-phone");
    expect(slugs).not.toContain("swiftgas-12kg-exchange");
  });

  it("tizzi-gas sees gas products, not general", async () => {
    const { items } = await listProducts({ platformSlug: "tizzi-gas" });
    const slugs = items.map((p) => p.slug);
    expect(slugs).toContain("swiftgas-12kg-exchange");
    expect(slugs).not.toContain("orbit-a54-phone");
    expect(slugs).not.toContain("nimbus-14-laptop");
  });

  it("multi-vendor product reports >1 offer / vendor", async () => {
    const { items } = await listProducts({ platformSlug: "grandprice" });
    const phone = items.find((p) => p.slug === "orbit-a54-phone")!;
    expect(phone.offerCount).toBeGreaterThanOrEqual(2);
    expect(phone.vendorCount).toBeGreaterThanOrEqual(2);
    expect(phone.fromPriceMinor).toBe(184900); // the cheaper second-vendor offer
  });
});

describe("product detail", () => {
  it("returns every active offer + a gas listing for gas products", async () => {
    const gas = await getProductDetail("swiftgas-12kg-exchange", "tizzi-gas");
    expect(gas.offers.length).toBeGreaterThanOrEqual(1);
    expect(gas.offers[0]!.gas).not.toBeNull();
    expect(gas.offers[0]!.gas!.weightKg).toBe(12.5);
  });

  it("404s across the tenant boundary", async () => {
    await expect(getProductDetail("orbit-a54-phone", "tizzi-gas")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("search", () => {
  it("full-text finds by title token", async () => {
    const res = await searchProducts({ platformSlug: "grandprice", q: "laptop" });
    expect(res.items.map((p) => p.slug)).toContain("nimbus-14-laptop");
  });

  it("trigram tolerates a typo", async () => {
    const res = await searchProducts({ platformSlug: "grandprice", q: "nimbis" });
    expect(res.items.map((p) => p.slug)).toContain("nimbus-14-laptop");
  });

  it("stays inside the tenant", async () => {
    const res = await searchProducts({ platformSlug: "tizzi-gas", q: "laptop" });
    expect(res.items).toHaveLength(0);
  });
});

describe("vendor onboarding → KYC → publish", () => {
  it("gates product authoring until KYC is approved, then publishes", async () => {
    const user = await makeUser();
    trashUsers.push(user.id);

    const onboard = await startVendorOnboarding({
      userId: user.id,
      platformSlug: "grandprice",
      displayName: "Test Bench Store",
      business: { legalName: "Test Bench Store Ltd", country: "GH", city: "Accra" },
    });
    trashVendors.push(onboard.vendorId);
    expect(onboard.kycStatus).toBe("PENDING");

    const category = await prisma.category.findFirstOrThrow({ where: { slug: "phones" } });

    // Pending vendor can't create products.
    await expect(
      createProductDraft({
        userId: user.id,
        platformSlug: "grandprice",
        title: "Bench Phone",
        description: "A phone for the test bench.",
        categoryId: category.id,
        priceMinor: 100000,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    // Mock reviewer approves.
    await reviewVendorKyc(onboard.vendorId, "APPROVED");
    expect((await vendorKycStatus(user.id)).kycStatus).toBe("APPROVED");

    const draft = await createProductDraft({
      userId: user.id,
      platformSlug: "grandprice",
      title: "Bench Phone",
      description: "A phone for the test bench.",
      categoryId: category.id,
      priceMinor: 100000,
    });
    expect(draft.status).toBe("DRAFT");

    // Can't publish without an image.
    await expect(publishProduct(user.id, draft.id)).rejects.toMatchObject({ code: "VALIDATION" });

    await updateProductDraft({ userId: user.id, productId: draft.id, images: ["bench/phone.jpg"], quantity: 5 });
    const published = await publishProduct(user.id, draft.id);
    expect(published.status).toBe("PUBLISHED");

    const mine = await listMyProducts(user.id, "PUBLISHED");
    expect(mine.map((p) => p.id)).toContain(draft.id);

    // And it now shows in the public tenant listing.
    const pub = await listProducts({ platformSlug: "grandprice", categorySlug: "phones" });
    expect(pub.items.map((p) => p.id)).toContain(draft.id);
  });
});

describe("vendor registration v2 — location, theme, and KYC documents", () => {
  it("round-trips a pinned Business.location through raw SQL", async () => {
    const user = await makeUser();
    trashUsers.push(user.id);

    const onboard = await startVendorOnboarding({
      userId: user.id,
      platformSlug: "grandprice",
      displayName: "Pinned Store",
      themeColors: ["#FF6B35", "#004E89", "#1A659E"],
      services: ["Home delivery", "Installation"],
      business: {
        legalName: "Pinned Store Ltd",
        country: "GH",
        city: "Accra",
        region: "Greater Accra",
        lat: 5.6037,
        lng: -0.187,
      },
    });
    trashVendors.push(onboard.vendorId);

    const status = await vendorKycStatus(user.id);
    if (!status.onboarded) throw new Error("expected onboarded vendor");
    expect(status.themeColors).toEqual(["#FF6B35", "#004E89", "#1A659E"]);
    expect(status.services).toEqual(["Home delivery", "Installation"]);
    expect(status.business?.region).toBe("Greater Accra");
    expect(status.business?.lat).toBeCloseTo(5.6037, 3);
    expect(status.business?.lng).toBeCloseTo(-0.187, 3);
  });

  it("submitVendorKyc creates documents + an auto-pass liveness check on a selfie", async () => {
    const user = await makeUser();
    trashUsers.push(user.id);

    const onboard = await startVendorOnboarding({
      userId: user.id,
      platformSlug: "grandprice",
      displayName: "KYC Test Store",
      business: { legalName: "KYC Test Store Ltd", country: "GH", city: "Accra" },
    });
    trashVendors.push(onboard.vendorId);

    const result = await submitVendorKyc(user.id, {
      documents: [
        { type: "PROOF_ADDRESS", fileKey: "vendors/kyc/proof.jpg" },
        { type: "ID_FRONT", fileKey: "vendors/kyc/id-front.jpg" },
      ],
      selfieKey: "vendors/kyc/selfie.jpg",
    });
    expect(result.status).toBe("IN_REVIEW");

    const kyc = await prisma.kycCase.findUniqueOrThrow({
      where: { subjectType_subjectId: { subjectType: "VENDOR", subjectId: onboard.vendorId } },
      include: { documents: true, liveness: true },
    });
    expect(kyc.status).toBe("IN_REVIEW");
    expect(kyc.documents.map((d) => d.type).sort()).toEqual(["ID_FRONT", "PROOF_ADDRESS", "SELFIE"].sort());
    expect(kyc.liveness).toHaveLength(1);
    expect(kyc.liveness[0]!.passed).toBe(true);
    expect(kyc.liveness[0]!.provider).toBe("mock");

    const role = await prisma.userRole.findUniqueOrThrow({ where: { userId_role: { userId: user.id, role: "VENDOR" } } });
    expect(role.kycStatus).toBe("IN_REVIEW");
  });
});
