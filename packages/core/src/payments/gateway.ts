/** Provider-agnostic payment port. Adapters live alongside this file. */

export type IntentStatus = "REQUIRES_ACTION" | "PROCESSING" | "SUCCEEDED" | "FAILED";

export interface CreateIntentInput {
  amountMinor: number;
  currency: string;
  /** "ORDER" | "WALLET_TOPUP" | … — free-form, forwarded to the provider metadata. */
  purpose: string;
  /** Our reference (order id / topup id) — echoed back on the webhook. */
  reference: string;
  userId: string;
  email?: string;
  idempotencyKey?: string;
}

export interface IntentResult {
  ref: string;
  status: IntentStatus;
  clientSecret?: string;
  /** URL to redirect the customer to, when the provider needs a hosted step. */
  authorizationUrl?: string;
}

export interface CaptureResult {
  ok: boolean;
  capturedMinor: number;
  feeMinor: number;
  raw: unknown;
  failureReason?: string;
}

export interface RefundResult {
  ok: boolean;
  raw: unknown;
}

export interface WebhookResult {
  ref: string;
  event: "payment.succeeded" | "payment.failed" | "payment.pending";
  amountMinor?: number;
}

export interface PaymentGateway {
  readonly name: string;
  /**
   * True when `capture` settles in-process (the mock sandbox). Hosted-checkout
   * providers (Paystack) return false: the customer pays on the provider's
   * page and the money lands via webhook / `confirmPaymentIntent`, so only
   * wallet top-ups may use them — checkout then pays from the wallet.
   */
  readonly capturesSynchronously: boolean;
  createIntent(input: CreateIntentInput): Promise<IntentResult>;
  /** Sandbox/mock capture is synchronous; real providers capture via webhook. */
  capture(ref: string, amountMinor: number): Promise<CaptureResult>;
  refund(ref: string, amountMinor: number): Promise<RefundResult>;
  /** Returns `null` when the payload's signature can't be verified — callers must reject it. */
  parseWebhook(headers: Record<string, string | undefined>, rawBody: string): WebhookResult | null;
}
