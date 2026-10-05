import { env } from "@stall/config";
import { AppError } from "../errors.ts";
import { MockGateway } from "./mock.ts";
import { FlutterwaveGateway, flutterwaveMethodsFor } from "./flutterwave.ts";
import { PAYMENT_METHOD_KINDS } from "./gateway.ts";
import type {
  CaptureResult,
  CreateIntentInput,
  IntentResult,
  PaymentGateway,
  PaymentMethodKind,
  RefundResult,
  WebhookResult,
} from "./gateway.ts";

/**
 * Placeholder for providers without an adapter yet (Flutterwave lives in
 * `flutterwave.ts`). They implement the same port so the checkout/wallet
 * code is provider-agnostic. Constructing one is fine; *using* it without keys throws a
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

export class StripeGateway extends UnconfiguredGateway {
  readonly name = "stripe";
  protected readonly envVar = "STRIPE_SECRET_KEY";
}

const REGISTRY: Record<string, () => PaymentGateway> = {
  mock: () => new MockGateway(),
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

/**
 * Payment methods the app may offer for a wallet top-up. Card is always the
 * provider's hosted page; the rest are charged in-app. The mock sandbox
 * "supports" all of them (it settles instantly) so every screen can be tried
 * without keys.
 */
export function availablePaymentMethods(currency = env.PAYMENTS_CURRENCY): { gateway: string; currency: string; methods: PaymentMethodKind[] } {
  const gw = gatewayFor();
  const methods = gw.name === "flutterwave" ? flutterwaveMethodsFor(currency) : gw.name === "mock" ? [...PAYMENT_METHOD_KINDS] : ["card" as const];
  return { gateway: gw.name, currency, methods };
}
