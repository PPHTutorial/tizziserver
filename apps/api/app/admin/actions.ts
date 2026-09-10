"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@stall/db";
import { env } from "@stall/config";
import { auth, trust, ads, admin as adminSvc, auctions } from "@stall/core";
import { createAdminSession, clearAdminSession, requireAdmin, requireSuperAdmin } from "@/src/admin/session";

// --- auth --------------------------------------------------------------

export async function requestLoginOtp(_prev: unknown, form: FormData) {
  const phone = String(form.get("phone") ?? "").trim();
  if (!phone) return { step: "phone" as const, error: "Enter your phone number" };
  try {
    // Look up (never create) the account so the OTP row is tied to a real
    // userId — issueOtp with no userId always produces a row verifyOtp can
    // never resolve back to a user, so login could never actually succeed.
    const normalized = phone.replace(/[^\d+]/g, "");
    const user = await prisma.user.findUnique({ where: { phone: normalized } });
    if (!user) return { step: "phone" as const, error: "No account found for this phone number" };
    const { code } = await auth.issueOtp({ target: phone, channel: "SMS", purpose: "LOGIN", userId: user.id });
    await auth.sendSms(phone, `Your Stall Ops Console code is ${code}. Expires in 10 minutes.`);
    return { step: "otp" as const, phone, error: null };
  } catch (e) {
    return { step: "phone" as const, error: e instanceof Error ? e.message : "Could not send a code" };
  }
}

export async function verifyLoginOtp(_prev: unknown, form: FormData) {
  const phone = String(form.get("phone") ?? "").trim();
  const code = String(form.get("code") ?? "").trim();
  const res = await auth.verifyOtp({ target: phone, code, channel: "SMS", purpose: "LOGIN" }).catch(() => ({ userId: null }));
  if (!res.userId) return { step: "otp" as const, phone, error: "That code didn't match" };

  if (env.ADMIN_2FA_REQUIRED) {
    const has2fa = await auth.hasTotp(res.userId);
    if (!has2fa) {
      return {
        step: "otp" as const,
        phone,
        error: "2FA is required for console access. Enable it from the app's Security Centre, then sign in again.",
      };
    }
    // SMS OTP alone only proves phone possession — a second, TOTP factor is
    // required before a session is actually minted.
    return { step: "totp" as const, phone, error: null };
  }

  const s = await createAdminSession(res.userId);
  if (!s.ok) return { step: "otp" as const, phone, error: s.reason };
  redirect("/admin");
}

export async function verifyLoginTotp(_prev: unknown, form: FormData) {
  const phone = String(form.get("phone") ?? "").trim();
  const code = String(form.get("code") ?? "").trim();
  const normalized = phone.replace(/[^\d+]/g, "");
  const user = await prisma.user.findUnique({ where: { phone: normalized } });
  if (!user) return { step: "totp" as const, phone, error: "Session expired — start again" };

  const ok = await auth.verifyTotp(user.id, code);
  if (!ok) return { step: "totp" as const, phone, error: "Incorrect 2FA code" };

  const s = await createAdminSession(user.id);
  if (!s.ok) return { step: "totp" as const, phone, error: s.reason };
  redirect("/admin");
}

export async function logout() {
  await clearAdminSession();
  redirect("/admin/login");
}

// --- KYC -------------------------------------------------------------

export async function reviewKyc(form: FormData) {
  const s = await requireAdmin();
  const id = String(form.get("id"));
  const decision = String(form.get("decision")) as "APPROVE" | "REJECT" | "RESUBMIT";
  const note = String(form.get("note") ?? "") || undefined;
  await trust.reviewKycCase(s.userId, id, decision, note);
  revalidatePath("/admin/kyc");
  revalidatePath(`/admin/kyc/${id}`);
}

// --- disputes ------------------------------------------------------

export async function assignDispute(form: FormData) {
  const s = await requireAdmin();
  const id = String(form.get("id"));
  await trust.assignDispute(s.userId, id);
  revalidatePath(`/admin/disputes/${id}`);
}

export async function resolveDispute(form: FormData) {
  // Moves real money (an uncapped wallet refund) — ADMIN only.
  const s = await requireSuperAdmin();
  const id = String(form.get("id"));
  const outcome = String(form.get("outcome") ?? "").trim();
  const refundMinor = Number(form.get("refundMinor") ?? 0) || undefined;
  await trust.resolveDispute(s.userId, id, { outcome, refundMinor });
  revalidatePath("/admin/disputes");
  revalidatePath(`/admin/disputes/${id}`);
}

export async function messageDispute(form: FormData) {
  const s = await requireAdmin();
  const id = String(form.get("id"));
  const body = String(form.get("body") ?? "").trim();
  if (body) await trust.sendDisputeMessage(s.userId, id, body, { staff: true });
  revalidatePath(`/admin/disputes/${id}`);
}

// --- campaigns ---------------------------------------------------

export async function reviewCampaign(form: FormData) {
  const s = await requireAdmin();
  const id = String(form.get("id"));
  const approve = String(form.get("approve")) === "1";
  const reason = String(form.get("reason") ?? "") || undefined;
  await ads.reviewCampaign(s.userId, id, { approve, reason });
  revalidatePath("/admin/campaigns");
}

// --- boost tiers -----------------------------------------------

export async function saveBoostTier(form: FormData) {
  await requireSuperAdmin();
  const placements = form.getAll("placements").map(String);
  await ads.upsertBoostTier({
    key: String(form.get("key")).trim(),
    name: String(form.get("name")).trim(),
    description: String(form.get("description") ?? "") || undefined,
    platformSlugs: String(form.get("platformSlugs") ?? "").split(",").map((x) => x.trim()).filter(Boolean),
    billingModel: String(form.get("billingModel")) as "CPM" | "CPC" | "FLAT_DAILY",
    priceMinor: Number(form.get("priceMinor") ?? 0),
    rankBoostBps: Number(form.get("rankBoostBps") ?? 10000),
    placements: placements as never[],
    badge: String(form.get("badge") ?? "") || undefined,
    sortOrder: Number(form.get("sortOrder") ?? 0),
    isActive: String(form.get("isActive") ?? "on") === "on",
  });
  revalidatePath("/admin/boost-tiers");
}

export async function deactivateBoostTier(form: FormData) {
  await requireSuperAdmin();
  await ads.deactivateBoostTier(String(form.get("key")));
  revalidatePath("/admin/boost-tiers");
}

// --- feature flags -------------------------------------------

export async function setFeatureFlag(form: FormData) {
  await requireSuperAdmin();
  const platformSlug = String(form.get("platformSlug"));
  const flagKey = String(form.get("flagKey"));
  const raw = String(form.get("value") ?? "");
  let value: unknown = raw;
  if (raw === "true" || raw === "false") value = raw === "true";
  else if (/^-?\d+(\.\d+)?$/.test(raw)) value = Number(raw);
  else if (raw.startsWith("{") || raw.startsWith("[") || raw.startsWith('"')) {
    try { value = JSON.parse(raw); } catch { /* keep string */ }
  }
  await adminSvc.setPlatformFeature(platformSlug, flagKey, value);
  revalidatePath("/admin/feature-flags");
}

// --- pricing ---------------------------------------------------

export async function savePricingRule(form: FormData) {
  await requireSuperAdmin();
  let params: Record<string, unknown> = {};
  try { params = JSON.parse(String(form.get("params") ?? "{}")); } catch { throw new Error("params must be valid JSON"); }
  await adminSvc.upsertPricingRule({
    id: String(form.get("id") ?? "") || undefined,
    scope: String(form.get("scope")) as never,
    platformSlug: String(form.get("platformSlug") ?? "") || undefined,
    params,
    priority: Number(form.get("priority") ?? 0),
  });
  revalidatePath("/admin/pricing");
}

export async function saveFeeSchedule(form: FormData) {
  await requireSuperAdmin();
  let params: Record<string, unknown> = {};
  try { params = JSON.parse(String(form.get("params") ?? "{}")); } catch { throw new Error("params must be valid JSON"); }
  await adminSvc.upsertFeeSchedule({
    id: String(form.get("id") ?? "") || undefined,
    party: String(form.get("party")) as never,
    kind: String(form.get("kind")) as never,
    params,
    platformSlug: String(form.get("platformSlug") ?? "") || undefined,
  });
  revalidatePath("/admin/pricing");
}

// --- broadcasts ----------------------------------------------

export async function composeBroadcast(form: FormData) {
  // Can send immediately (sendNow) to a whole audience — ADMIN only.
  const s = await requireSuperAdmin();
  await adminSvc.composeBroadcast({
    createdById: s.userId,
    title: String(form.get("title")).trim(),
    body: String(form.get("body")).trim(),
    audience: {
      roles: String(form.get("roles") ?? "").split(",").map((x) => x.trim()).filter(Boolean),
      hasOrdered: String(form.get("hasOrdered") ?? "") === "on",
    },
    sendNow: String(form.get("sendNow") ?? "") === "on",
  });
  revalidatePath("/admin/broadcasts");
}

export async function sendBroadcast(form: FormData) {
  await requireSuperAdmin();
  await adminSvc.sendBroadcast(String(form.get("id")));
  revalidatePath("/admin/broadcasts");
}

// --- draws ---------------------------------------------------

export async function commitDraw(form: FormData) {
  await requireSuperAdmin();
  await auctions.commitDraw(String(form.get("auctionId")));
  revalidatePath("/admin/draws");
}

export async function runDraw(form: FormData) {
  await requireSuperAdmin();
  await auctions.runDraw(String(form.get("auctionId")));
  revalidatePath("/admin/draws");
}

// --- safety actions ---------------------------------------

export async function applySafetyAction(form: FormData) {
  // BAN/SUSPEND are high-impact and hard to reverse quickly — ADMIN only.
  const s = await requireSuperAdmin();
  await trust.applySafetyAction(s.userId, {
    targetType: "USER",
    targetId: String(form.get("userId")),
    action: String(form.get("action")) as never,
    reason: String(form.get("reason") ?? "admin action"),
  });
  revalidatePath(`/admin/users`);
}
