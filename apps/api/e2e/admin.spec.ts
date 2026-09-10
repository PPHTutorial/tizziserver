import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import {
  makeAdminUser,
  makeCustomerUser,
  forceKnownOtp,
  makeKycCase,
  makeDispute,
  makeSeatDrawAuction,
  makePendingCampaign,
  uniqueTierKey,
  enrollAndConfirmTotp,
  totpCode,
  cleanup,
} from "./fixtures";

/**
 * Admin-console happy-path E2E — logs in once via the real OTP flow (the
 * plaintext code is swapped in test-side via a direct DB write, since there's
 * no real SMS/email to intercept), then exercises each of the flows named in
 * docs/PROGRESS.md's NEXT ACTIONS: KYC approve, dispute resolve, feature-flag
 * toggle, pricing-rule save, draw commit+run, broadcast compose+send.
 *
 * Fixtures are created directly via Prisma (not by replaying the full
 * business-logic flow, e.g. a real vendor onboarding or ticket purchase) —
 * that logic is already covered by the Vitest integration suite. This suite
 * tests the admin console's pages/forms/server-actions end-to-end against a
 * real browser and a real running server.
 */

let admin: { userId: string; phone: string };
let customer: { userId: string; phone: string };
let context: BrowserContext;
let page: Page;

const kycCaseIds: string[] = [];
const disputeIds: string[] = [];
const auctionIds: string[] = [];
const campaignIds: string[] = [];
const boostTierKeys: string[] = [];
const extraUserIds: string[] = [];

test.beforeAll(async ({ browser }) => {
  admin = await makeAdminUser();
  customer = await makeCustomerUser();
  // ADMIN_2FA_REQUIRED defaults to true — the login flow demands a confirmed
  // TOTP enrollment before it will mint a session at all.
  const totpSecret = await enrollAndConfirmTotp(admin.userId);

  context = await browser.newContext();
  page = await context.newPage();

  await page.goto("/admin/login");
  await page.getByPlaceholder("+23320…").fill(admin.phone);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByPlaceholder("••••••")).toBeVisible();

  const code = await forceKnownOtp(admin.phone);
  await page.getByPlaceholder("••••••").fill(code);
  await page.getByRole("button", { name: "Verify & sign in" }).click();

  await expect(page.getByRole("button", { name: "Verify 2FA" })).toBeVisible();
  await page.getByPlaceholder("••••••").fill(totpCode(totpSecret));
  await page.getByRole("button", { name: "Verify 2FA" }).click();
  await page.waitForURL("**/admin");
});

test.afterAll(async () => {
  await context?.close();
  // Escape hatch for debugging a local failure: rerun with SKIP_E2E_CLEANUP=1
  // to leave the fixtures in the DB for inspection instead of deleting them.
  if (process.env.SKIP_E2E_CLEANUP) return;
  await cleanup({
    userIds: [admin?.userId, customer?.userId, ...extraUserIds].filter((x): x is string => Boolean(x)),
    kycCaseIds,
    disputeIds,
    auctionIds,
    campaignIds,
    boostTierKeys,
  });
});

test("login is refused for an admin without 2FA enrolled", async ({ browser }) => {
  const noTotpAdmin = await makeAdminUser();
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  try {
    await p.goto("/admin/login");
    await p.getByPlaceholder("+23320…").fill(noTotpAdmin.phone);
    await p.getByRole("button", { name: "Send code" }).click();
    await expect(p.getByPlaceholder("••••••")).toBeVisible();

    const code = await forceKnownOtp(noTotpAdmin.phone);
    await p.getByPlaceholder("••••••").fill(code);
    await p.getByRole("button", { name: "Verify & sign in" }).click();

    // Blocked before a session is ever minted — still on the OTP step, no
    // "Verify 2FA" step to advance to, and the console-access requirement is
    // named explicitly.
    await expect(p.getByText(/2FA is required for console access/)).toBeVisible();
    await expect(p.getByRole("button", { name: "Verify 2FA" })).toHaveCount(0);
    await expect(p).toHaveURL(/\/admin\/login$/);
  } finally {
    await ctx.close();
    await cleanup({ userIds: [noTotpAdmin.userId] });
  }
});

test("logs in and reaches the dashboard", async () => {
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByText("STALL · Ops")).toBeVisible();
  await expect(page.getByText("· admin")).toBeVisible();
});

test("KYC: approve a pending case", async () => {
  const kycId = await makeKycCase(customer.userId);
  kycCaseIds.push(kycId);

  await page.goto(`/admin/kyc/${kycId}`);
  await expect(page.getByRole("heading", { name: "KYC case" })).toBeVisible();

  await page.getByRole("button", { name: "Approve" }).click();
  await page.waitForURL(`**/admin/kyc/${kycId}`);

  // The decision form only renders while status is PENDING/IN_REVIEW — once
  // approved it disappears, which is the observable proof the action landed.
  await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0);
});

test("KYC: reject a pending case with a note", async () => {
  // KycCase has a @@unique([subjectType, subjectId]) constraint — a fresh
  // subject is required since `customer` already has one from the approve test.
  const rejectSubject = await makeCustomerUser();
  extraUserIds.push(rejectSubject.userId);
  const kycId = await makeKycCase(rejectSubject.userId);
  kycCaseIds.push(kycId);

  await page.goto(`/admin/kyc/${kycId}`);
  await expect(page.getByRole("heading", { name: "KYC case" })).toBeVisible();

  await page.getByPlaceholder("Reviewer note (optional)").fill("Playwright E2E — document unreadable.");
  await page.getByRole("button", { name: "Reject" }).click();
  await page.waitForURL(`**/admin/kyc/${kycId}`);

  await expect(page.getByRole("button", { name: "Reject" })).toHaveCount(0);
});

test("Disputes: resolve an open dispute", async () => {
  const disputeId = await makeDispute(admin.userId);
  disputeIds.push(disputeId);

  await page.goto(`/admin/disputes/${disputeId}`);
  await expect(page.getByRole("heading", { name: `Dispute ${disputeId.slice(0, 10)}` })).toBeVisible();

  await page.getByPlaceholder("Resolution note").fill("Resolved via Playwright E2E — refund not warranted.");
  await page.getByRole("button", { name: "Resolve dispute" }).click();
  await page.waitForURL(`**/admin/disputes/${disputeId}`);

  // The Resolve card only renders while the dispute isn't RESOLVED/CLOSED.
  await expect(page.getByRole("button", { name: "Resolve dispute" })).toHaveCount(0);
});

test("Feature flags: round-trip a value for the first flag", async () => {
  await page.goto("/admin/feature-flags");
  await expect(page.getByRole("heading", { name: "Feature flags" })).toBeVisible();

  const firstRow = page.locator("table tbody tr").first();
  await expect(firstRow).toBeVisible();

  // The platform select defaults to its first <option>; read that column's
  // currently-displayed JSON value and submit it back unchanged — this
  // exercises the real save path without changing any actual flag behavior.
  const currentValue = await firstRow.locator("td").nth(1).innerText();
  const valueInput = firstRow.getByPlaceholder("true / 5 / {…}");
  await valueInput.fill(currentValue.trim());
  await firstRow.getByRole("button", { name: "Set" }).click();
  await page.waitForURL("**/admin/feature-flags");

  // A resubmitted, unchanged value should still render identically.
  await expect(page.locator("table tbody tr").first().locator("td").nth(1)).toHaveText(currentValue.trim());
});

test("Pricing: save a new delivery pricing rule", async () => {
  await page.goto("/admin/pricing");
  await expect(page.getByRole("heading", { name: "Pricing & fees" })).toBeVisible();

  const before = await page.locator("table").first().locator("tbody tr").count();

  await page.getByPlaceholder("id (blank = new)").first().fill("");
  await page.locator('select[name="scope"]').selectOption("DELIVERY");
  await page.getByPlaceholder('{"baseMinor":800,"perKmMinor":150}').fill('{"baseMinor":900,"perKmMinor":160}');
  await page.getByRole("button", { name: "Save rule" }).click();

  // The form submits to the same URL (a server-action re-render, not a real
  // navigation), so waitForURL would resolve immediately without waiting for
  // the new row — use a retrying assertion instead of a one-shot count().
  await expect(page.locator("table").first().locator("tbody tr")).toHaveCount(before + 1);
});

test("Draws: commit then run a fresh seat-draw auction", async () => {
  const auctionId = await makeSeatDrawAuction();
  auctionIds.push(auctionId);

  await page.goto("/admin/draws");
  await expect(page.getByRole("heading", { name: "Draw supervision" })).toBeVisible();

  const card = page.locator("section", { has: page.getByText(`e2e-draw-`, { exact: false }) }).last();

  await card.getByRole("button", { name: "Commit seed" }).click();
  await page.waitForURL("**/admin/draws");

  const cardAfterCommit = page.locator("section", { has: page.getByText(`e2e-draw-`, { exact: false }) }).last();
  await expect(cardAfterCommit.getByRole("button", { name: "Run draw" })).toBeVisible();

  await cardAfterCommit.getByRole("button", { name: "Run draw" }).click();
  await page.waitForURL("**/admin/draws");

  // Zero participants -> runDraw resolves to UNSOLD (via markUnsold), a real,
  // valid happy-path outcome — the "Run draw" button disappears either way
  // once a draw exists and the auction has left DRAW_PENDING.
  const cardAfterRun = page.locator("section", { has: page.getByText(`e2e-draw-`, { exact: false }) }).last();
  await expect(cardAfterRun.getByText(/UNSOLD|COMPLETED/)).toBeVisible();
});

test("Broadcasts: compose then send", async () => {
  await page.goto("/admin/broadcasts");
  await expect(page.getByRole("heading", { name: "Broadcasts" })).toBeVisible();

  const title = `Playwright E2E broadcast ${Date.now()}`;
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Body").fill("This is a Playwright admin E2E test broadcast.");
  await page.getByRole("button", { name: "Create broadcast" }).click();
  await page.waitForURL("**/admin/broadcasts");

  const row = page.locator("table tbody tr", { hasText: title });
  await expect(row).toBeVisible();
  await expect(row.getByText("DRAFT")).toBeVisible();

  await row.getByRole("button", { name: "Send now" }).click();
  await page.waitForURL("**/admin/broadcasts");

  const rowAfterSend = page.locator("table tbody tr", { hasText: title });
  await expect(rowAfterSend.getByText("SENT")).toBeVisible();
});

test("Pricing: save a new fee schedule", async () => {
  await page.goto("/admin/pricing");
  await expect(page.getByRole("heading", { name: "Pricing & fees" })).toBeVisible();

  const feesTable = page.locator("table").nth(1);
  const before = await feesTable.locator("tbody tr").count();

  await page.locator('select[name="party"]').selectOption("VENDOR");
  await page.locator('select[name="kind"]').selectOption("COMMISSION");
  await page.getByPlaceholder('{"percent":15}').fill('{"percent":12}');
  await page.getByRole("button", { name: "Save fee" }).click();

  await expect(feesTable.locator("tbody tr")).toHaveCount(before + 1);
});

test("Boost tiers: create then disable a tier", async () => {
  const key = uniqueTierKey();
  boostTierKeys.push(key);

  await page.goto("/admin/boost-tiers");
  await expect(page.getByRole("heading", { name: "Boost tiers" })).toBeVisible();

  // Scope to the create form specifically — existing tier rows each carry a
  // hidden input[name="key"] in their own "Disable" form, so an unscoped
  // locator resolves to multiple elements.
  const form = page.locator("form", { has: page.getByRole("button", { name: "Save tier" }) });
  await form.locator('input[name="key"]').fill(key);
  await form.locator('input[name="name"]').fill(`E2E ${key}`);
  await form.locator('input[name="platformSlugs"]').fill("grandprice");
  await form.locator('input[name="priceMinor"]').fill("500");
  await form.getByRole("checkbox", { name: "HOME_RAIL" }).check();
  await form.getByRole("button", { name: "Save tier" }).click();

  const row = page.locator("table tbody tr", { hasText: key });
  await expect(row).toBeVisible();
  await expect(row.getByText("active", { exact: true })).toBeVisible();

  await row.getByRole("button", { name: "Disable" }).click();
  await expect(page.locator("table tbody tr", { hasText: key }).getByText("inactive")).toBeVisible();
});

test("Campaigns: approve a pending campaign", async () => {
  const campaign = await makePendingCampaign(customer.userId);
  campaignIds.push(campaign.id);

  await page.goto("/admin/campaigns");
  await expect(page.getByRole("heading", { name: "Ad campaign review" })).toBeVisible();

  const row = page.locator("table tbody tr", { hasText: campaign.name });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "✓" }).click();

  // Approved/rejected campaigns drop out of the PENDING_REVIEW queue this
  // page lists, so the row disappearing is the observable proof it landed.
  await expect(page.locator("table tbody tr", { hasText: campaign.name })).toHaveCount(0);
});

test("Users: apply a safety action", async () => {
  await page.goto(`/admin/users?q=${encodeURIComponent(customer.phone)}`);
  await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();

  const row = page.locator("table tbody tr", { hasText: customer.phone });
  await expect(row).toBeVisible();
  await row.locator('select[name="action"]').selectOption("SUSPEND");
  await row.getByPlaceholder("reason").fill("Playwright E2E test suspend");
  await row.getByRole("button", { name: "Apply" }).click();

  // exact:true — the Roles column also renders "CUSTOMER(SUSPENDED)", which
  // would otherwise collide with the Status badge's plain "SUSPENDED" text.
  await expect(
    page.locator("table tbody tr", { hasText: customer.phone }).getByText("SUSPENDED", { exact: true }),
  ).toBeVisible();
});

test("Audit log: shows the earlier KYC review action", async () => {
  await page.goto("/admin/audit-log?action=kyc.review");
  await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();
  await expect(page.locator("table tbody tr", { hasText: "kyc.review" }).first()).toBeVisible();
});

test("Analytics: platform KPIs load", async () => {
  await page.goto("/admin/analytics");
  await expect(page.getByRole("heading", { name: "Platform analytics" })).toBeVisible();
  await expect(page.getByText("GMV", { exact: true })).toBeVisible();
});

test("logs out back to the login screen", async () => {
  await page.goto("/admin");
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("**/admin/login");
  await expect(page.getByText("STALL · Ops Console")).toBeVisible();
});
