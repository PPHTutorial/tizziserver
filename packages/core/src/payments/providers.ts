import { createHmac } from "node:crypto";
import { env } from "@stall/config";
import { randomToken, timingSafeEqualHex } from "../crypto.ts";
import { AppError } from "../errors.ts";
import { MockGateway } from "./mock.ts";
import type {
  CaptureResult,
  CreateIntentInput,
  IntentResult,
  PaymentGateway,
  RefundResult,
  WebhookResult,
} from "./gateway.ts";

/**
 * Real-provider adapters. They implement the same port so the checkout/wallet
 * code is provider-agnostic, but stay unimplemented until sandbox credentials
 * exist (blocker B4). Constructing one is fine; *using* it without keys throws a
 * clear error rather than silently no-op'ing.
 */
abstract class UnconfiguredGateway implements PaymentGateway {
  abstract readonly name: string;
  readonly capturesSynchronously = false;
  protected abstract readonly envVar: string;

  private nope(): never {
    throw new AppError(
      "PAYMENT_FAILED",
      `The ${this.name} payment adapter is not wired yet — set ${this.envVar} and implement packages/core/src/payments/providers.ts, or run with PAYMENTS_PROVIDER=mock.`,
    );
  }
  createIntent(_i: CreateIntentInput): Promise<IntentResult> {
    this.nope();
  }
  capture(_ref: string, _amountMinor: number): Promise<CaptureResult> {
    this.nope();
  }
  refund(_ref: string, _amountMinor: number): Promise<RefundResult> {
    this.nope();
  }
  parseWebhook(_headers: Record<string, string | undefined>, _rawBody: string): WebhookResult | null {
    this.nope();
  }
}

/**
 * Paystack (Ghana: cards + mobile money) via its hosted checkout.
 * https://paystack.com/docs/api/transaction — amounts are in the currency's
 * subunit (pesewas for GHS), which is exactly our *Minor convention.
 *
 *  - createIntent → POST /transaction/initialize → `authorization_url` the app
 *    opens; we choose the `reference`, so it's known before the customer pays.
 *  - capture → GET /transaction/verify/:reference (used by
 *    `confirmPaymentIntent` when the customer returns, ahead of the webhook).
 *  - parseWebhook → `x-paystack-signature` = HMAC-SHA512(raw body, secret key).
 *
 * NOT YET EXERCISED AGAINST THE LIVE API (no keys at time of writing) — run a
 * sandbox top-up end to end before launch.
 */
export class PaystackGateway implements PaymentGateway {
  readonly name = "paystack";
  readonly capturesSynchronously = false;
  private static readonly BASE = "https://api.paystack.co";

  private key(): string {
    const k = env.PAYSTACK_SECRET_KEY;
    if (!k) {
      throw new AppError("PAYMENT_FAILED", "Paystack is not configured — set PAYSTACK_SECRET_KEY (or run with PAYMENTS_PROVIDER=mock).");
    }
    return k;
  }

  private async call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<{ status: boolean; message: string; data: T }> {
    const res = await fetch(`${PaystackGateway.BASE}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.key()}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => null)) as { status: boolean; message: string; data: T } | null;
    if (!json) throw new AppError("PAYMENT_FAILED", `Paystack returned HTTP ${res.status}`);
    return json;
  }

  async createIntent(input: CreateIntentInput): Promise<IntentResult> {
    const reference = `stl_${randomToken(12)}`;
    const r = await this.call<{ authorization_url: string; access_code: string; reference: string }>("POST", "/transaction/initialize", {
      // Paystack requires an email; phone-only accounts get a stable placeholder.
      email: input.email ?? `${input.userId}@customers.example.com`,
      amount: input.amountMinor,
      currency: input.currency,
      reference,
      channels: ["card", "mobile_money"],
      ...(env.PAYSTACK_CALLBACK_URL ? { callback_url: env.PAYSTACK_CALLBACK_URL } : {}),
      metadata: { purpose: input.purpose, reference: input.reference, userId: input.userId },
    });
    if (!r.status) throw new AppError("PAYMENT_FAILED", `Paystack: ${r.message}`);
    return { ref: r.data.reference, status: "REQUIRES_ACTION", clientSecret: r.data.access_code, authorizationUrl: r.data.authorization_url };
  }

  async capture(ref: string, amountMinor: number): Promise<CaptureResult> {
    const r = await this.call<{ status: string; amount: number; fees: number | null; gateway_response?: string }>(
      "GET",
      `/transaction/verify/${encodeURIComponent(ref)}`,
    );
    const d = r.data;
    // Only an exact-amount success counts — never trust a partial/altered charge.
    if (r.status && d?.status === "success" && d.amount === amountMinor) {
      return { ok: true, capturedMinor: d.amount, feeMinor: d.fees ?? 0, raw: d };
    }
    return {
      ok: false,
      capturedMinor: 0,
      feeMinor: 0,
      raw: d ?? r,
      failureReason: d?.status === "success" ? "amount_mismatch" : (d?.status ?? r.message),
    };
  }

  async refund(ref: string, amountMinor: number): Promise<RefundResult> {
    const r = await this.call<unknown>("POST", "/refund", { transaction: ref, amount: amountMinor });
    return { ok: r.status, raw: r.data ?? r };
  }

  parseWebhook(headers: Record<string, string | undefined>, rawBody: string): WebhookResult | null {
    const signature = headers["x-paystack-signature"];
    const secret = env.PAYSTACK_WEBHOOK_SECRET ?? env.PAYSTACK_SECRET_KEY;
    if (!signature || !secret) return null;
    const expected = createHmac("sha512", secret).update(rawBody).digest("hex");
    if (!timingSafeEqualHex(signature, expected)) return null;

    const body = JSON.parse(rawBody || "{}") as { event?: string; data?: { reference?: string; amount?: number; status?: string } };
    const ref = body.data?.reference ?? "";
    if (body.event === "charge.success" && body.data?.status === "success") {
      return { ref, event: "payment.succeeded", amountMinor: body.data.amount };
    }
    if (body.event === "charge.failed" || body.data?.status === "failed" || body.data?.status === "abandoned") {
      return { ref, event: "payment.failed", amountMinor: body.data?.amount };
    }
    return { ref, event: "payment.pending", amountMinor: body.data?.amount };
  }
}
export class FlutterwaveGateway extends UnconfiguredGateway {
  readonly name = "flutterwave";
  protected readonly envVar = "FLUTTERWAVE_SECRET_KEY";
}
export class StripeGateway extends UnconfiguredGateway {
  readonly name = "stripe";
  protected readonly envVar = "STRIPE_SECRET_KEY";
}

const REGISTRY: Record<string, () => PaymentGateway> = {
  mock: () => new MockGateway(),
  paystack: () => new PaystackGateway(),
  flutterwave: () => new FlutterwaveGateway(),
  stripe: () => new StripeGateway(),
};

/** Resolve a named gateway, or the env default (`PAYMENTS_PROVIDER`). */
export function gatewayFor(name?: string): PaymentGateway {
  const key = (name ?? env.PAYMENTS_PROVIDER).toLowerCase();
  const make = REGISTRY[key];
  if (!make) throw new AppError("VALIDATION", `Unknown payment gateway: ${key}`);
  // The mock sandbox captures instantly and accepts any amount. Callers can
  // name a gateway (wallet top-up body, webhook `?gateway=`), so in production
  // it must only be reachable when it IS the configured provider — otherwise
  // `{"gateway":"mock"}` is a free wallet top-up.
  if (key === "mock" && !mockGatewayAllowed()) {
    throw new AppError("VALIDATION", "Unknown payment gateway: mock");
  }
  return make();
}

/**
 * For flows that must settle in-process (order checkout, draw tickets, win
 * target): hosted-checkout providers can't, so those flows pay from the
 * wallet and the buyer tops up first.
 */
export function directGatewayFor(name?: string): PaymentGateway {
  const gw = gatewayFor(name);
  if (!gw.capturesSynchronously) {
    throw new AppError("VALIDATION", "Card and mobile-money payments go through your wallet — top up, then pay from your wallet balance", {
      reason: "TOP_UP_REQUIRED",
    });
  }
  return gw;
}

export const mockGatewayAllowed = (): boolean =>
  env.PAYMENTS_PROVIDER === "mock" || env.NODE_ENV !== "production";

export const defaultGateway = (): PaymentGateway => gatewayFor();
