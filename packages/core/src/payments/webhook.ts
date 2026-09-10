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

  const intent = await prisma.paymentIntent.findFirst({ where: { gatewayRef: evt.ref } });
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
    const already = await prisma.payment.count({ where: { intentId: intent.id, status: "SUCCEEDED" } });
    await prisma.$transaction([
      prisma.paymentIntent.update({ where: { id: intent.id }, data: { status: "SUCCEEDED" } }),
      ...(already === 0
        ? [
            prisma.payment.create({
              data: { intentId: intent.id, status: "SUCCEEDED", capturedMinor: intent.amountMinor, processedAt: new Date() },
            }),
          ]
        : []),
    ]);

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
