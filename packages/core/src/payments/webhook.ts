import { prisma, type Prisma } from "@stall/db";
import { AppError } from "../errors.ts";
import { notify } from "../comms/notifications.ts";
import { gatewayFor } from "./providers.ts";
import type { NextAction, PaymentGateway } from "./gateway.ts";

type Intent = NonNullable<Awaited<ReturnType<typeof prisma.paymentIntent.findFirst>>>;
type IntentMeta = {
  platformSlug?: string;
  method?: string;
  provider?: Record<string, string>;
  nextAction?: NextAction;
  failureReason?: string;
  otpAttempts?: number;
};

const PENDING = ["REQUIRES_ACTION", "PROCESSING"] as const;
const isPending = (s: string) => (PENDING as readonly string[]).includes(s);
const metaOf = (i: Intent) => (i.metadata ?? {}) as IntentMeta;

/**
 * Gateway webhook. Idempotent: safe to receive the same event any number of
 * times, in any order, concurrently.
 *
 * For providers that can be queried (`verify`, i.e. Flutterwave) the webhook
 * body is only a hint: after the signature check we look the transaction up
 * at the provider and act on THAT (status, exact amount, currency, reference).
 * A replayed, reordered or tampered event can therefore never move money on
 * its own. The mock sandbox has nothing to query, so its signed body is used.
 */
export async function handlePaymentWebhook(input: {
  gateway?: string;
  headers: Record<string, string | undefined>;
  rawBody: string;
}): Promise<{ received: true; handled: string }> {
  const gw = gatewayFor(input.gateway);
  const evt = gw.parseWebhook(input.headers, input.rawBody);
  if (!evt) return { received: true, handled: "rejected:bad-signature" };
  if (!evt.ref) return { received: true, handled: "ignored:no-ref" };

  // Scope to the gateway whose signature we just verified — refs are only
  // unique per provider, and one gateway's webhook must never settle another's
  // intent (e.g. a mock-signed event resolving a Flutterwave intent).
  const intent = await prisma.paymentIntent.findFirst({ where: { gatewayRef: evt.ref, gateway: gw.name } });
  if (!intent) return { received: true, handled: "ignored:unknown-intent" };

  if (gw.verify) {
    const status = await resolveWithProvider(intent, gw);
    return { received: true, handled: status.toLowerCase() };
  }

  // Unverifiable gateway (mock): only a still-pending intent can be resolved —
  // flipping FAILED->SUCCEEDED on a body alone would let a forged/replayed
  // webhook mint money for a capture that never happened.
  if (evt.event === "payment.failed") {
    if (isPending(intent.status)) await markFailed(intent, "provider_reported_failed");
    return { received: true, handled: "failed" };
  }
  if (evt.event === "payment.succeeded" && isPending(intent.status)) {
    const won = await settleSucceededIntent(intent, { capturedMinor: intent.amountMinor, feeMinor: 0, raw: evt }, false);
    return { received: true, handled: won ? "succeeded" : "noop:already-settled" };
  }
  return { received: true, handled: `noop:${intent.status}` };
}

/**
 * Ask the provider and apply its answer. Returns the intent's resulting status.
 *
 * A verified success also settles an intent we had marked FAILED (e.g. a MoMo
 * approval that landed after a timeout, or a charge created while we lost the
 * connection): the customer's money moved, so they must get the credit. This
 * is safe only because the answer comes from the provider's API, not a webhook.
 */
async function resolveWithProvider(intent: Intent, gw: PaymentGateway): Promise<string> {
  if (intent.status === "SUCCEEDED") return "SUCCEEDED";
  if (!intent.gatewayRef || !gw.verify) return intent.status;
  const v = await gw.verify(intent.gatewayRef, { amountMinor: intent.amountMinor, currency: intent.currency });

  if (v.status === "succeeded") {
    await settleSucceededIntent(intent, v, true);
    return "SUCCEEDED";
  }
  if (v.status === "failed") {
    if (isPending(intent.status)) await markFailed(intent, v.failureReason ?? "failed", v.raw);
    if (v.failureReason === "amount_mismatch") {
      // The customer paid, but not what we asked for. Never credit it
      // automatically — leave it for staff (refund or manual credit).
      console.error(`[payments] amount/currency/ref mismatch on intent ${intent.id} (${intent.gatewayRef})`);
    }
    return "FAILED";
  }
  return intent.status;
}

/**
 * Claim the intent → SUCCEEDED and credit the wallet in ONE transaction. Two
 * deliveries racing (webhook + app poll + sweep) both reach here; the
 * conditional update lets exactly one through, and the unique
 * `payments.settledIntentId` backs that up at the database level. If
 * the credit fails, the claim rolls back with it, so the next delivery
 * retries — never charged-but-not-credited, never credited twice.
 */
async function settleSucceededIntent(
  intent: Intent,
  capture: { capturedMinor: number; feeMinor: number; raw: unknown },
  allowFromFailed: boolean,
): Promise<boolean> {
  const meta = metaOf(intent);
  const platformSlug = meta.platformSlug ?? "grandprice";
  const { getOrCreateWallet, creditTopUpTx } = await import("../wallet/wallet.ts");
  if (intent.purpose === "WALLET_TOPUP") await getOrCreateWallet(intent.userId, intent.currency);

  const from = allowFromFailed ? [...PENDING, "FAILED", "CANCELLED"] : [...PENDING];
  const won = await prisma.$transaction(async (tx) => {
    const claimed = await tx.paymentIntent.updateMany({
      where: { id: intent.id, status: { in: from as Intent["status"][] } },
      data: { status: "SUCCEEDED", metadata: { ...meta, nextAction: undefined, failureReason: undefined } as Prisma.InputJsonValue },
    });
    if (claimed.count === 0) return false;
    await tx.payment.create({
      data: {
        intentId: intent.id,
        status: "SUCCEEDED",
        settledIntentId: intent.id,
        capturedMinor: capture.capturedMinor,
        feeMinor: capture.feeMinor,
        gatewayResponse: capture.raw as Prisma.InputJsonValue,
        processedAt: new Date(),
      },
    });
    if (intent.purpose === "WALLET_TOPUP") {
      await creditTopUpTx(tx, {
        userId: intent.userId,
        amountMinor: intent.amountMinor,
        platformSlug,
        gateway: intent.gateway,
        gatewayRef: intent.gatewayRef ?? undefined,
        currency: intent.currency,
      });
    }
    return true;
  });

  if (won) {
    await notify({
      userId: intent.userId,
      category: "PAYMENT",
      title: "Payment received",
      body: intent.purpose === "WALLET_TOPUP" ? "Your wallet has been topped up." : "Your payment went through.",
      data: { paymentIntentId: intent.id, status: "SUCCEEDED" },
    }).catch(() => {});
  }
  return won;
}

async function markFailed(intent: Intent, reason: string, raw?: unknown): Promise<void> {
  const res = await prisma.paymentIntent.updateMany({
    where: { id: intent.id, status: { in: [...PENDING] } },
    data: { status: "FAILED", metadata: { ...metaOf(intent), nextAction: undefined, failureReason: reason } as Prisma.InputJsonValue },
  });
  if (res.count === 0) return;
  if (raw !== undefined) {
    await prisma.payment.create({ data: { intentId: intent.id, status: "FAILED", gatewayResponse: raw as Prisma.InputJsonValue } });
  }
  await notify({
    userId: intent.userId,
    category: "PAYMENT",
    title: "Payment didn't go through",
    body: "Nothing was taken from your account. You can try again.",
    data: { paymentIntentId: intent.id, status: "FAILED" },
  }).catch(() => {});
}

/** What the app shows while a payment is in flight. */
function view(intent: Intent) {
  const meta = metaOf(intent);
  return {
    id: intent.id,
    status: intent.status,
    amountMinor: intent.amountMinor,
    currency: intent.currency,
    method: meta.method ?? null,
    nextAction: isPending(intent.status) ? (meta.nextAction ?? null) : null,
    failureReason: intent.status === "FAILED" ? (meta.failureReason ?? null) : null,
  };
}

/**
 * The app polls this while the customer approves the payment (or after they
 * return from a hosted page): verifies with the provider now rather than
 * waiting for the webhook. Idempotent with it.
 */
export async function confirmPaymentIntent(userId: string, intentId: string) {
  const intent = await prisma.paymentIntent.findFirst({ where: { id: intentId, userId } });
  if (!intent) throw new AppError("NOT_FOUND", "Payment not found");
  if (!isPending(intent.status)) return view(intent);
  if (!intent.gatewayRef) throw new AppError("CONFLICT", "Payment has no provider reference");

  const gw = gatewayFor(intent.gateway);
  if (gw.verify) {
    await resolveWithProvider(intent, gw);
  } else {
    const cap = await gw.capture(intent.gatewayRef, intent.amountMinor);
    if (cap.ok) await settleSucceededIntent(intent, cap, false);
    else if (cap.failureReason && cap.failureReason !== "pending") await markFailed(intent, cap.failureReason, cap.raw);
  }
  return view(await prisma.paymentIntent.findUniqueOrThrow({ where: { id: intent.id } }));
}

export async function getPaymentIntent(userId: string, intentId: string) {
  const intent = await prisma.paymentIntent.findFirst({ where: { id: intentId, userId } });
  if (!intent) throw new AppError("NOT_FOUND", "Payment not found");
  return view(intent);
}

const MAX_OTP_ATTEMPTS = 5;

/** Submit the OTP for a charge waiting on one (bank-account debit, some MoMo). */
export async function submitPaymentOtp(userId: string, intentId: string, otp: string) {
  if (!/^\d{4,8}$/.test(otp)) throw new AppError("VALIDATION", "Enter the code you received");
  const intent = await prisma.paymentIntent.findFirst({ where: { id: intentId, userId } });
  if (!intent) throw new AppError("NOT_FOUND", "Payment not found");
  const meta = metaOf(intent);
  if (!isPending(intent.status) || meta.nextAction?.type !== "otp" || !meta.provider) {
    throw new AppError("CONFLICT", "This payment isn't waiting for a code");
  }
  const gw = gatewayFor(intent.gateway);
  if (!gw.submitOtp) throw new AppError("CONFLICT", "This payment isn't waiting for a code");

  // Count the attempt before calling out, atomically, so parallel guesses
  // can't exceed the cap.
  const attempts = (meta.otpAttempts ?? 0) + 1;
  const counted = await prisma.paymentIntent.updateMany({
    where: { id: intent.id, status: intent.status, updatedAt: intent.updatedAt },
    data: { metadata: { ...meta, otpAttempts: attempts } as Prisma.InputJsonValue },
  });
  if (counted.count === 0) throw new AppError("CONFLICT", "Please wait a moment and try again");
  if (attempts > MAX_OTP_ATTEMPTS) {
    await markFailed(intent, "too_many_otp_attempts");
    throw new AppError("PAYMENT_FAILED", "Too many wrong codes — start the payment again");
  }

  const r = await gw.submitOtp(meta.provider, otp);
  const fresh = await prisma.paymentIntent.findUniqueOrThrow({ where: { id: intent.id } });
  await prisma.paymentIntent.updateMany({
    where: { id: intent.id, status: { in: [...PENDING] } },
    data: {
      status: "PROCESSING",
      metadata: {
        ...metaOf(fresh),
        provider: { ...meta.provider, ...r.providerState },
        nextAction: r.nextAction?.type === "otp" ? undefined : r.nextAction,
      } as Prisma.InputJsonValue,
    },
  });
  return confirmPaymentIntent(userId, intentId);
}

/**
 * Worker sweep: re-verify in-flight intents with the provider, so a missed or
 * never-sent webhook (and a customer who closed the app) still settles.
 *  - pending for > 1 min: verify
 *  - pending for > `expireAfterH`: the customer never paid → FAILED
 *  - FAILED only because the provider was unreachable at creation: verify, in
 *    case the charge was created and approved anyway
 */
export async function reconcilePendingIntents(opts: { expireAfterH?: number; limit?: number } = {}) {
  const expireAfterH = opts.expireAfterH ?? 24;
  const now = Date.now();
  const rows = await prisma.paymentIntent.findMany({
    where: {
      gateway: { not: "mock" },
      createdAt: { lt: new Date(now - 60_000), gt: new Date(now - 7 * 24 * 3_600_000) },
      // Each intent is looked at most every ~2 minutes (provider rate limits).
      updatedAt: { lt: new Date(now - 120_000) },
      OR: [
        { status: { in: [...PENDING] } },
        { status: "FAILED", metadata: { path: ["failureReason"], equals: "provider_unreachable" } },
      ],
    },
    orderBy: { updatedAt: "asc" },
    take: opts.limit ?? 50,
  });
  const out = { checked: 0, succeeded: 0, failed: 0, expired: 0 };
  for (const intent of rows) {
    let gw: PaymentGateway;
    try {
      gw = gatewayFor(intent.gateway);
    } catch {
      continue;
    }
    if (!gw.verify) continue;
    out.checked++;
    try {
      const status = await resolveWithProvider(intent, gw);
      if (status === "SUCCEEDED") out.succeeded++;
      else if (status === "FAILED" && intent.status !== "FAILED") out.failed++;
      else if (isPending(status) && intent.createdAt.getTime() < now - expireAfterH * 3_600_000) {
        await markFailed(intent, "expired");
        out.expired++;
      } else {
        // Touch it so the sweep rotates through the backlog.
        await prisma.paymentIntent.updateMany({ where: { id: intent.id, status: intent.status }, data: { updatedAt: new Date() } });
      }
    } catch (e) {
      console.error(`[payments] reconcile ${intent.id}:`, e instanceof Error ? e.message : e);
    }
  }
  return out;
}
