/**
 * Test-only DB helpers for the Playwright admin E2E suite. These run in Node
 * (inside the Playwright test process, not the browser) against the same
 * database the dev server under test is connected to — the same technique
 * `packages/core/test/helpers.ts` and the opt-in `phaseN-e2e.test.ts` suites
 * use for the Vitest HTTP e2e tests.
 */
import { prisma } from "@stall/db";
import { hashSecret, auth } from "@stall/core";
import { Secret, TOTP } from "otpauth";

const rand = () => Math.floor(Math.random() * 900_000 + 100_000);

/** A throwaway ADMIN user with a phone number the login flow can target. */
export async function makeAdminUser() {
  const phone = `+1998${Date.now().toString().slice(-7)}${rand().toString().slice(-3)}`;
  const user = await prisma.user.create({
    data: {
      phone,
      status: "ACTIVE",
      roles: { create: { role: "ADMIN", status: "ACTIVE", activatedAt: new Date() } },
      tokenEpoch: { create: {} },
    },
  });
  return { userId: user.id, phone };
}

/** A throwaway CUSTOMER user, e.g. as the subject of a USER-level KYC case. */
export async function makeCustomerUser() {
  const phone = `+1997${Date.now().toString().slice(-7)}${rand().toString().slice(-3)}`;
  const user = await prisma.user.create({
    data: {
      phone,
      status: "ACTIVE",
      roles: { create: { role: "CUSTOMER", status: "ACTIVE", activatedAt: new Date() } },
      tokenEpoch: { create: {} },
    },
  });
  return { userId: user.id, phone };
}

/**
 * Enrolls and confirms TOTP 2FA for a user (ADMIN_2FA_REQUIRED defaults to
 * true, so the admin login flow requires this before a session can be
 * minted) and returns the base32 secret for generating live codes with
 * `totpCode()`.
 */
export async function enrollAndConfirmTotp(userId: string): Promise<string> {
  const { secret } = await auth.enrollTotp(userId, `e2e-${userId}`);
  const code = totpCode(secret);
  await auth.confirmTotp(userId, code);
  return secret;
}

/** A currently-valid 6-digit TOTP code for a base32 secret. */
export function totpCode(base32Secret: string): string {
  const totp = new TOTP({ algorithm: "SHA1", digits: 6, period: 30, secret: Secret.fromBase32(base32Secret) });
  return totp.generate();
}

/**
 * Overwrites the newest pending OTP for (phone, purpose) with a known code
 * the test controls, so the UI's real "send code" flow can be exercised
 * end-to-end without needing to intercept an actual SMS/log line. Requires
 * the real `requestLoginOtp`/`issueOtp` flow to have already created the
 * pending row (e.g. by submitting the phone step in the browser first).
 */
export async function forceKnownOtp(phone: string, purpose: "LOGIN" = "LOGIN"): Promise<string> {
  const normalized = phone.replace(/[^\d+]/g, "");
  const otp = await prisma.otp.findFirst({
    where: { target: normalized, purpose, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!otp) throw new Error(`e2e fixture: no pending OTP found for ${phone} (${purpose})`);
  const code = "123456";
  await prisma.otp.update({ where: { id: otp.id }, data: { codeHash: await hashSecret(code), attempts: 0 } });
  return code;
}

/** A pending USER-level KYC case ready for an admin APPROVE decision. */
export async function makeKycCase(subjectUserId: string) {
  const kyc = await prisma.kycCase.create({
    data: {
      subjectType: "USER",
      subjectId: subjectUserId,
      level: "BASIC",
      status: "PENDING",
      platformSlug: "grandprice",
    },
  });
  return kyc.id;
}

/** An open PAYMENT-kind dispute ready for an admin resolve action — PAYMENT
 * carries no downstream platformSlug/order lookup in resolveDispute, so a
 * placeholder refId is safe here (this is testing the console UI's resolve
 * path, not re-validating openDispute's own party-check business logic,
 * which is already covered by packages/core/test/comms.test.ts). */
export async function makeDispute(openedById: string) {
  const dispute = await prisma.dispute.create({
    data: {
      kind: "PAYMENT",
      refId: `e2e-fixture-${Date.now()}`,
      openedById,
      category: "e2e-test",
      body: "Playwright admin E2E fixture dispute.",
      status: "OPEN",
    },
  });
  return dispute.id;
}

/** A fresh SEAT_DRAW auction with zero participants — runDraw's own
 * minSeatsToDraw/participants check gracefully resolves this to UNSOLD via
 * markUnsold, a real and valid "happy path" outcome for exercising the
 * commit → run admin flow without needing a full ticket-purchase fixture. */
export async function makeSeatDrawAuction() {
  const slug = `e2e-draw-${Date.now()}`;
  const auction = await prisma.auction.create({
    data: {
      slug,
      title: `Playwright E2E draw ${slug}`,
      type: "SEAT_DRAW",
      status: "OPEN",
      platformSlug: "grandprice",
      retailValueMinor: 100_000_00,
      ticketPriceMinor: 5_00,
      winTargetMinor: 50_000_00,
      seatsTotal: 100,
      minSeatsToDraw: 1,
    },
  });
  return auction.id;
}

/** A campaign in PENDING_REVIEW, ready for an admin approve/reject decision. */
export async function makePendingCampaign(vendorId: string): Promise<{ id: string; name: string }> {
  const name = `Playwright E2E campaign ${Date.now()}`;
  const campaign = await prisma.campaign.create({
    data: {
      vendorId,
      platformSlug: "grandprice",
      name,
      status: "PENDING_REVIEW",
      budgetMinor: 10_000_00,
      submittedAt: new Date(),
    },
  });
  return { id: campaign.id, name };
}

/** A boost-tier key unique to this test run (upsertBoostTier keys on it). */
export function uniqueTierKey(): string {
  return `e2e-tier-${Date.now()}`;
}

/** Removes everything an e2e run creates, by id, in FK-safe order. */
export async function cleanup(ids: {
  userIds?: string[];
  kycCaseIds?: string[];
  disputeIds?: string[];
  auctionIds?: string[];
  campaignIds?: string[];
  boostTierKeys?: string[];
}) {
  if (ids.disputeIds?.length) {
    await prisma.dispute.deleteMany({ where: { id: { in: ids.disputeIds } } });
  }
  if (ids.kycCaseIds?.length) {
    await prisma.kycCase.deleteMany({ where: { id: { in: ids.kycCaseIds } } });
  }
  if (ids.auctionIds?.length) {
    await prisma.draw.deleteMany({ where: { auctionId: { in: ids.auctionIds } } });
    await prisma.auction.deleteMany({ where: { id: { in: ids.auctionIds } } });
  }
  if (ids.campaignIds?.length) {
    await prisma.campaign.deleteMany({ where: { id: { in: ids.campaignIds } } });
  }
  if (ids.boostTierKeys?.length) {
    await prisma.boostTier.deleteMany({ where: { key: { in: ids.boostTierKeys } } });
  }
  if (ids.userIds?.length) {
    await prisma.session.deleteMany({ where: { userId: { in: ids.userIds } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: ids.userIds } } });
    await prisma.otp.deleteMany({ where: { userId: { in: ids.userIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: ids.userIds } } });
    await prisma.tokenEpoch.deleteMany({ where: { userId: { in: ids.userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: ids.userIds } } });
  }
}
