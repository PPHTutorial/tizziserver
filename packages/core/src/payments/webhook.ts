import { prisma } from "@stall/db";
import { AppError } from "../errors.ts";
import { gatewayFor } from "./providers.ts";

/**
 * Gateway webhook reconciliation. Idempotent: safe to receive the same event
 * more than once. With the mock gateway captures are synchronous so this is
 * usually a no-op, but the path is real for when a provider is wired.
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
  // intent (e.g. a mock-signed event resolving a Paystack intent).
  const intent = await prisma.paymentIntent.findFirst({ where: { gatewayRef: evt.ref, gateway: gw.name } });
  if (!intent) return { received: true, handled: "ignored:unknown-intent" };

  // Only a still-pending intent can be resolved by webhook — a payment already
  // marked FAILED or SUCCEEDED is a closed book; flipping FAILED->SUCCEEDED
  // here would let a forged/replayed webhook mint money for a capture that
  // never actually happened.
  const isPending = intent.status === "REQUIRES_ACTION" || intent.status === "PROCESSING";

  if (evt.event === "payment.failed") {
    if (isPending) {
      await prisma.paymentIntent.update({ where: { id: intent.id }, data: { status: "FAILED" } });
    }
    return { received: true, handled: "failed" };
  }

  if (evt.event === "payment.succeeded" && isPending) {
    const won = await settleSucceededIntent(intent, evt.ref);
    return { received: true, handled: won ? "succeeded" : "noop:already-settled" };
  }

  return { received: true, handled: `noop:${intent.status}` };
}

type PendingIntent = NonNullable<Awaited<ReturnType<typeof prisma.paymentIntent.findFirst>>>;

/**
 * Claim pending→SUCCEEDED atomically and apply the purpose's side effect
 * (a wallet top-up credit). Shared by the webhook and `confirmPaymentIntent`,
 * so whichever arrives first settles and the other is a no-op. Returns false
 * when another delivery already settled it.
 */
async function settleSucceededIntent(intent: PendingIntent, gatewayRef: string): Promise<boolean> {
  // Two concurrent deliveries of the same event both saw "pending" and would
  // each have created a payment and credited the wallet — only one claim wins.
  const outcome = await prisma.$transaction(async (tx) => {
    const claimed = await tx.paymentIntent.updateMany({
      where: { id: intent.id, status: { in: ["REQUIRES_ACTION", "PROCESSING"] } },
      data: { status: "SUCCEEDED" },
    });
    if (claimed.count === 0) return { won: false, already: 1 };
    const already = await tx.payment.count({ where: { intentId: intent.id, status: "SUCCEEDED" } });
    if (already === 0) {
      await tx.payment.create({
        data: { intentId: intent.id, status: "SUCCEEDED", capturedMinor: intent.amountMinor, processedAt: new Date() },
      });
    }
    return { won: true, already };
  });
  if (!outcome.won) return false;

  if (intent.purpose === "WALLET_TOPUP" && outcome.already === 0) {
    const { topUpWallet } = await import("../wallet/wallet.ts");
    await topUpWallet({
      userId: intent.userId,
      amountMinor: intent.amountMinor,
      platformSlug: (intent.metadata as { platformSlug?: string } | null)?.platformSlug ?? "grandprice",
      gateway: intent.gateway,
      gatewayRef,
      currency: intent.currency,
    });
  }
  return true;
}

/**
 * The customer is back from the provider's hosted page: verify with the
 * provider now rather than waiting for the webhook. Idempotent with it.
 */
export async function confirmPaymentIntent(userId: string, intentId: string): Promise<{ status: string }> {
  const intent = await prisma.paymentIntent.findFirst({ where: { id: intentId, userId } });
  if (!intent) throw new AppError("NOT_FOUND", "Payment not found");
  if (intent.status !== "REQUIRES_ACTION" && intent.status !== "PROCESSING") return { status: intent.status };
  if (!intent.gatewayRef) throw new AppError("CONFLICT", "Payment has no provider reference");

  const cap = await gatewayFor(intent.gateway).capture(intent.gatewayRef, intent.amountMinor);
  if (cap.ok) {
    await settleSucceededIntent(intent, intent.gatewayRef);
    return { status: "SUCCEEDED" };
  }
  if (cap.failureReason === "failed" || cap.failureReason === "abandoned" || cap.failureReason === "amount_mismatch") {
    await prisma.paymentIntent.updateMany({
      where: { id: intent.id, status: { in: ["REQUIRES_ACTION", "PROCESSING"] } },
      data: { status: "FAILED" },
    });
    return { status: "FAILED" };
  }
  // Still pending at the provider (customer hasn't finished) — try again later.
  return { status: intent.status };
}
