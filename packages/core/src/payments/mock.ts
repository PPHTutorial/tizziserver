import { env } from "@stall/config";
import { hmacHex, randomToken, timingSafeEqualHex } from "../crypto.ts";
import type {
  CaptureResult,
  CreateIntentInput,
  IntentResult,
  PaymentGateway,
  RefundResult,
  WebhookResult,
} from "./gateway.ts";

/**
 * Deterministic in-process payment sandbox — no external accounts (blocker B4).
 * `capture` succeeds and books a 1.5% + 30 minor-unit fee, EXCEPT when
 * `amountMinor % 100 === 13`, which fails (a stable hook for testing the
 * payment-failure path). Webhook bodies are plain JSON `{ ref, event }`,
 * HMAC-SHA256-signed over the raw body with `MOCK_PAYMENTS_WEBHOOK_SECRET`,
 * carried in the `x-mock-signature` header — an unsigned/mis-signed body is
 * rejected (returns `null`), the same contract a real gateway adapter must
 * satisfy before this port trusts a webhook.
 */
export class MockGateway implements PaymentGateway {
  readonly name = "mock";

  async createIntent(input: CreateIntentInput): Promise<IntentResult> {
    return {
      ref: `mock_${randomToken(12)}`,
      status: "REQUIRES_ACTION",
      clientSecret: `mock_cs_${randomToken(10)}`,
      authorizationUrl: `https://sandbox.stall.local/pay/${input.reference}`,
    };
  }

  async capture(ref: string, amountMinor: number): Promise<CaptureResult> {
    if (amountMinor % 100 === 13) {
      return { ok: false, capturedMinor: 0, feeMinor: 0, raw: { ref, declined: true }, failureReason: "card_declined" };
    }
    const feeMinor = Math.round(amountMinor * 0.015) + 30;
    return { ok: true, capturedMinor: amountMinor, feeMinor, raw: { ref, captured: amountMinor, feeMinor } };
  }

  async refund(ref: string, amountMinor: number): Promise<RefundResult> {
    return { ok: true, raw: { ref, refunded: amountMinor } };
  }

  parseWebhook(headers: Record<string, string | undefined>, rawBody: string): WebhookResult | null {
    const signature = headers["x-mock-signature"];
    if (!signature) return null;
    const expected = hmacHex(env.MOCK_PAYMENTS_WEBHOOK_SECRET, rawBody);
    if (!timingSafeEqualHex(signature, expected)) return null;

    const body = JSON.parse(rawBody || "{}") as { ref?: string; event?: string; amountMinor?: number };
    const event =
      body.event === "payment.failed"
        ? "payment.failed"
        : body.event === "payment.pending"
          ? "payment.pending"
          : "payment.succeeded";
    return { ref: body.ref ?? "", event, amountMinor: body.amountMinor };
  }
}
