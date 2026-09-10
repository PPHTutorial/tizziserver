import { env } from "@stall/config";
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

export class PaystackGateway extends UnconfiguredGateway {
  readonly name = "paystack";
  protected readonly envVar = "PAYSTACK_SECRET_KEY";
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
  return make();
}

export const defaultGateway = (): PaymentGateway => gatewayFor();
