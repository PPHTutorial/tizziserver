/** Provider-agnostic payment port. Adapters live alongside this file. */

export type IntentStatus = "REQUIRES_ACTION" | "PROCESSING" | "SUCCEEDED" | "FAILED";

/**
 * How the customer pays. `card` is the provider's hosted page (card data never
 * touches our servers or the app); every other method is charged in-app over
 * the provider's API, with any customer step described by a `NextAction`.
 */
export const PAYMENT_METHOD_KINDS = [
  "card",
  "mobile_money",
  "opay",
  "apple_pay",
  "google_pay",
  "bank_transfer",
  "bank_account",
] as const;
export type PaymentMethodKind = (typeof PAYMENT_METHOD_KINDS)[number];

/** Customer-supplied details for an in-app (non-card) charge. */
export interface ChargeDetails {
  /** Mobile money: the wallet's phone number (E.164 or local). */
  phone?: string;
  /** Mobile money network, e.g. MTN / VODAFONE / TIGO (Ghana). */
  network?: string;
  /** Bank-account debit: bank code + account number. */
  bankCode?: string;
  accountNumber?: string;
}

export interface CreateIntentInput {
  amountMinor: number;
  currency: string;
  /** "ORDER" | "WALLET_TOPUP" | … — free-form, forwarded to the provider metadata. */
  purpose: string;
  /** Our reference (order id / topup id) — echoed back on the webhook. */
  reference: string;
  userId: string;
  email?: string;
  phone?: string;
  fullName?: string;
  idempotencyKey?: string;
  /**
   * The provider reference to use, for providers that let the merchant choose
   * it (Flutterwave `tx_ref`). The intent row is written with it *before* the
   * provider is called, so a crash between the two can never leave a charge we
   * have no record of.
   */
  ref?: string;
  /** Defaults to the provider's hosted page (`card`). */
  method?: PaymentMethodKind;
  details?: ChargeDetails;
}

/** What the customer must do next to finish an in-app charge. */
export type NextAction =
  /** Open the provider page in the in-app browser (MoMo approval page, Apple/Google Pay sheet, OPay, card). */
  | { type: "redirect"; url: string }
  /** Enter the OTP the provider sent; submit via `submitOtp`. */
  | { type: "otp"; message?: string }
  /** Approve the prompt on the phone (MoMo push / USSD); nothing to submit. */
  | { type: "approve_on_phone"; message?: string }
  /** Transfer exactly this amount to the one-time account shown. */
  | {
      type: "bank_transfer";
      accountNumber: string;
      bankName: string;
      accountName?: string;
      amountMinor: number;
      expiresAt?: string;
      note?: string;
    };

export interface IntentResult {
  ref: string;
  status: IntentStatus;
  clientSecret?: string;
  /** URL to redirect the customer to, when the provider needs a hosted step. */
  authorizationUrl?: string;
  nextAction?: NextAction;
  /** Provider-side state to keep on the intent (e.g. Flutterwave's `flw_ref` for OTP validation). */
  providerState?: Record<string, string>;
}

export interface CaptureResult {
  ok: boolean;
  capturedMinor: number;
  feeMinor: number;
  raw: unknown;
  failureReason?: string;
}

/** Outcome of asking the provider (never the webhook body) what happened. */
export interface VerifyResult {
  status: "succeeded" | "failed" | "pending";
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
   * True when `capture` settles in-process (the mock sandbox). Asynchronous
   * providers (Flutterwave) return false: the customer approves the payment
   * out of band and the money lands via webhook / `confirmPaymentIntent`, so
   * only wallet top-ups may use them — checkout then pays from the wallet.
   */
  readonly capturesSynchronously: boolean;
  createIntent(input: CreateIntentInput): Promise<IntentResult>;
  /** Sandbox/mock capture is synchronous; real providers capture via webhook. */
  capture(ref: string, amountMinor: number): Promise<CaptureResult>;
  /**
   * Look the transaction up at the provider and check it against what we
   * expect (amount, currency, reference). Providers that implement this are
   * never settled from a webhook body alone — the webhook only says "go look".
   */
  verify?(ref: string, expected: { amountMinor: number; currency: string }): Promise<VerifyResult>;
  /** Submit the OTP for a charge whose `NextAction` was `otp`. */
  submitOtp?(providerState: Record<string, string>, otp: string): Promise<IntentResult>;
  refund(ref: string, amountMinor: number): Promise<RefundResult>;
  /** Returns `null` when the payload's signature can't be verified — callers must reject it. */
  parseWebhook(headers: Record<string, string | undefined>, rawBody: string): WebhookResult | null;
}
