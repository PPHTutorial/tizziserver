import { prisma } from "@stall/db";
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
    // Claim the pending→SUCCEEDED transition atomically: two concurrent
    // deliveries of the same event both saw `isPending` and would each have
    // created a payment and credited the wallet.
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
    if (!outcome.won) return { received: true, handled: "noop:already-settled" };
    const already = outcome.already;

    if (intent.purpose === "WALLET_TOPUP" && already === 0) {
      const { topUpWallet } = await import("../wallet/wallet.ts");
      await topUpWallet({
        userId: intent.userId,
        amountMinor: intent.amountMinor,
        platformSlug: (intent.metadata as { platformSlug?: string } | null)?.platformSlug ?? "grandprice",
        gateway: intent.gateway,
        gatewayRef: evt.ref,
        currency: intent.currency,
      });
    }
    return { received: true, handled: "succeeded" };
  }

  return { received: true, handled: `noop:${intent.status}` };
}
