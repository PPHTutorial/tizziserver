import { createHmac } from "node:crypto";
import { env } from "@stall/config";
import { randomToken, sha256Hex, timingSafeEqualHex } from "../crypto.ts";
import { AppError } from "../errors.ts";
import type {
  CaptureResult,
  CreateIntentInput,
  IntentResult,
  NextAction,
  PaymentGateway,
  PaymentMethodKind,
  RefundResult,
  VerifyResult,
  WebhookResult,
} from "./gateway.ts";

/**
 * Flutterwave v3 (https://developer.flutterwave.com/v3.0/reference).
 *
 *  - card → POST /payments (Flutterwave Standard): the hosted page the app
 *    opens in an in-app browser. Card numbers never touch our servers or the
 *    app, so we stay out of PCI scope and need no card-encryption key.
 *  - everything else → POST /charges?type=… (direct charge, driven by the
 *    app's own screens). The response says what the customer does next
 *    (approve a MoMo prompt, enter an OTP, transfer to a one-time account, or
 *    finish an Apple/Google Pay / OPay sheet on a Flutterwave page).
 *  - verify → GET /transactions/verify_by_reference. THE source of truth: a
 *    payment is only settled after this call confirms status, amount,
 *    currency and tx_ref. Webhooks merely trigger the lookup.
 *  - webhook → `verif-hash` header equal to the dashboard's secret hash, or
 *    the newer `flutterwave-signature` (base64 HMAC-SHA256 of the raw body
 *    keyed with the same hash). Both are compared in constant time.
 *
 * Flutterwave amounts are in MAJOR units (GHS 25.50 → 25.5); everything on our
 * side is minor units, converted here and nowhere else.
 *
 * NOT YET EXERCISED AGAINST THE LIVE API — run every enabled method once in
 * test mode (sandbox keys) before launch.
 */
export class FlutterwaveGateway implements PaymentGateway {
  readonly name = "flutterwave";
  readonly capturesSynchronously = false;
  static readonly BASE = "https://api.flutterwave.com/v3";

  private key(): string {
    const k = env.FLUTTERWAVE_SECRET_KEY;
    if (!k) {
      throw new AppError("PAYMENT_FAILED", "Flutterwave is not configured — set FLUTTERWAVE_SECRET_KEY (or run with PAYMENTS_PROVIDER=mock).");
    }
    return k;
  }

  private async call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<FlwResponse<T>> {
    const res = await fetch(`${FlutterwaveGateway.BASE}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.key()}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    const json = (await res.json().catch(() => null)) as FlwResponse<T> | null;
    if (!json) throw new AppError("PAYMENT_FAILED", `Flutterwave returned HTTP ${res.status}`);
    return json;
  }

  async createIntent(input: CreateIntentInput): Promise<IntentResult> {
    const method = input.method ?? "card";
    const txRef = input.ref ?? `stl_${randomToken(12)}`;
    if (!flutterwaveMethodsFor(input.currency).includes(method)) {
      throw new AppError("VALIDATION", `${METHOD_LABEL[method]} isn't available for ${input.currency} payments`);
    }
    const customer = {
      // Flutterwave requires an email; phone-only accounts get a stable placeholder.
      email: input.email ?? `${input.userId}@customers.stall.invalid`,
      fullname: input.fullName ?? "Stall customer",
    };
    const meta = { purpose: input.purpose, reference: input.reference, userId: input.userId };
    const amount = toMajor(input.amountMinor, input.currency);

    if (method === "card") {
      const r = await this.call<{ link: string }>("POST", "/payments", {
        tx_ref: txRef,
        amount,
        currency: input.currency,
        payment_options: "card",
        redirect_url: redirectUrl(),
        customer: { email: customer.email, name: customer.fullname, ...(input.phone ? { phonenumber: input.phone } : {}) },
        meta,
        customizations: { title: "Stall" },
      });
      if (r.status !== "success" || !r.data?.link) throw new AppError("PAYMENT_FAILED", `Flutterwave: ${r.message}`);
      return { ref: txRef, status: "REQUIRES_ACTION", authorizationUrl: r.data.link, nextAction: { type: "redirect", url: r.data.link } };
    }

    const { type, extra } = chargeTypeFor(method, input);
    const r = await this.call<FlwCharge>("POST", `/charges?type=${type}`, {
      tx_ref: txRef,
      amount,
      currency: input.currency,
      email: customer.email,
      fullname: customer.fullname,
      redirect_url: redirectUrl(),
      meta,
      ...extra,
    });
    if (r.status !== "success") throw new AppError("PAYMENT_FAILED", `Flutterwave: ${r.message}`);
    return chargeResult(txRef, r, input.currency, type === "debit_ng_account" ? "account" : undefined);
  }

  async submitOtp(providerState: Record<string, string>, otp: string): Promise<IntentResult> {
    const flwRef = providerState.flwRef;
    if (!flwRef) throw new AppError("CONFLICT", "This payment isn't waiting for an OTP");
    const r = await this.call<FlwCharge>("POST", "/validate-charge", {
      otp,
      flw_ref: flwRef,
      ...(providerState.validateType ? { type: providerState.validateType } : {}),
    });
    if (r.status !== "success") throw new AppError("PAYMENT_FAILED", `Flutterwave: ${r.message}`);
    return chargeResult(r.data?.tx_ref ?? "", r, r.data?.currency ?? env.PAYMENTS_CURRENCY, providerState.validateType);
  }

  async verify(ref: string, expected: { amountMinor: number; currency: string }): Promise<VerifyResult> {
    const r = await this.call<FlwTransaction>("GET", `/transactions/verify_by_reference?tx_ref=${encodeURIComponent(ref)}`);
    const d = r.data;
    // No transaction yet = the customer hasn't paid (or the charge is still being created).
    if (r.status !== "success" || !d) return { status: "pending", capturedMinor: 0, feeMinor: 0, raw: r, failureReason: r.message };

    const status = String(d.status ?? "").toLowerCase();
    if (status === "successful") {
      // Only an exact match counts — never credit a partial, re-priced or
      // other-currency charge, nor one that belongs to a different reference.
      const sameRef = d.tx_ref === ref;
      const sameCurrency = String(d.currency ?? "").toUpperCase() === expected.currency.toUpperCase();
      const capturedMinor = toMinor(d.amount ?? 0, expected.currency);
      if (!sameRef || !sameCurrency || capturedMinor !== expected.amountMinor) {
        return { status: "failed", capturedMinor: 0, feeMinor: 0, raw: d, failureReason: "amount_mismatch" };
      }
      return { status: "succeeded", capturedMinor, feeMinor: toMinor(d.app_fee ?? 0, expected.currency), raw: d };
    }
    if (status === "failed" || status === "cancelled" || status === "error") {
      return { status: "failed", capturedMinor: 0, feeMinor: 0, raw: d, failureReason: d.processor_response ?? status };
    }
    return { status: "pending", capturedMinor: 0, feeMinor: 0, raw: d };
  }

  async capture(ref: string, amountMinor: number): Promise<CaptureResult> {
    const v = await this.verify(ref, { amountMinor, currency: env.PAYMENTS_CURRENCY });
    return {
      ok: v.status === "succeeded",
      capturedMinor: v.capturedMinor,
      feeMinor: v.feeMinor,
      raw: v.raw,
      failureReason: v.status === "succeeded" ? undefined : v.status === "pending" ? "pending" : (v.failureReason ?? "failed"),
    };
  }

  async refund(ref: string, amountMinor: number): Promise<RefundResult> {
    const v = await this.call<FlwTransaction>("GET", `/transactions/verify_by_reference?tx_ref=${encodeURIComponent(ref)}`);
    if (v.status !== "success" || !v.data?.id) return { ok: false, raw: v };
    const r = await this.call<unknown>("POST", `/transactions/${v.data.id}/refund`, {
      amount: toMajor(amountMinor, v.data.currency ?? env.PAYMENTS_CURRENCY),
    });
    return { ok: r.status === "success", raw: r.data ?? r };
  }

  parseWebhook(headers: Record<string, string | undefined>, rawBody: string): WebhookResult | null {
    const secretHash = env.FLUTTERWAVE_WEBHOOK_HASH;
    if (!secretHash) return null;
    const signature = headers["flutterwave-signature"];
    const verifHash = headers["verif-hash"];
    const trusted = signature
      ? safeEqual(signature, createHmac("sha256", secretHash).update(rawBody).digest("base64"))
      : verifHash
        ? safeEqual(verifHash, secretHash)
        : false;
    if (!trusted) return null;

    let body: { event?: string; data?: { tx_ref?: string; txRef?: string; status?: string; amount?: number; currency?: string } };
    try {
      body = JSON.parse(rawBody || "{}");
    } catch {
      return null;
    }
    const d = body.data ?? {};
    const ref = d.tx_ref ?? d.txRef ?? "";
    const currency = d.currency ?? env.PAYMENTS_CURRENCY;
    const amountMinor = typeof d.amount === "number" ? toMinor(d.amount, currency) : undefined;
    const status = String(d.status ?? "").toLowerCase();
    if (status === "successful") return { ref, event: "payment.succeeded", amountMinor };
    if (status === "failed" || status === "cancelled") return { ref, event: "payment.failed", amountMinor };
    return { ref, event: "payment.pending", amountMinor };
  }
}

// ---------------------------------------------------------------------------

interface FlwResponse<T> {
  status: "success" | "error" | string;
  message: string;
  data?: T;
  meta?: { authorization?: FlwAuthorization };
}
interface FlwAuthorization {
  mode?: string;
  redirect?: string;
  validate_instructions?: string;
  note?: string;
  transfer_account?: string;
  transfer_bank?: string;
  transfer_amount?: number | string;
  account_expiration?: string | number;
  transfer_note?: string;
  transfer_reference?: string;
}
interface FlwCharge {
  id?: number;
  tx_ref?: string;
  flw_ref?: string;
  status?: string;
  currency?: string;
  processor_response?: string;
}
interface FlwTransaction extends FlwCharge {
  amount?: number;
  charged_amount?: number;
  app_fee?: number;
}

const METHOD_LABEL: Record<PaymentMethodKind, string> = {
  card: "Card",
  mobile_money: "Mobile money",
  opay: "OPay",
  apple_pay: "Apple Pay",
  google_pay: "Google Pay",
  bank_transfer: "Bank transfer",
  bank_account: "Bank account",
};

/** Mobile-money charge type per currency (Flutterwave names them by market). */
const MOMO_TYPE: Record<string, string> = {
  GHS: "mobile_money_ghana",
  UGX: "mobile_money_uganda",
  RWF: "mobile_money_rwanda",
  ZMW: "mobile_money_zambia",
  TZS: "mobile_money_tanzania",
  KES: "mpesa",
};

/**
 * What Flutterwave supports per currency, out of the box. The merchant account
 * must also have each method enabled in the dashboard; `FLUTTERWAVE_METHODS`
 * (comma list) narrows or overrides this when the account differs.
 */
const DEFAULT_METHODS: Record<string, PaymentMethodKind[]> = {
  GHS: ["card", "mobile_money"],
  NGN: ["card", "bank_transfer", "bank_account", "opay", "apple_pay", "google_pay"],
  KES: ["card", "mobile_money"],
  UGX: ["card", "mobile_money"],
  RWF: ["card", "mobile_money"],
  ZMW: ["card", "mobile_money"],
  TZS: ["card", "mobile_money"],
  USD: ["card", "apple_pay", "google_pay"],
  GBP: ["card", "apple_pay", "google_pay"],
  EUR: ["card", "apple_pay", "google_pay"],
};

/** Methods the app may offer for `currency` under Flutterwave. */
export function flutterwaveMethodsFor(currency: string): PaymentMethodKind[] {
  const configured = env.FLUTTERWAVE_METHODS?.split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (configured?.length) {
    // An explicit list wins — the dashboard is the authority on what's enabled —
    // but mobile money still needs a market Flutterwave can charge.
    return configured.filter(
      (m): m is PaymentMethodKind => (METHOD_LABEL as Record<string, string>)[m] !== undefined && (m !== "mobile_money" || !!MOMO_TYPE[currency.toUpperCase()]),
    );
  }
  return DEFAULT_METHODS[currency.toUpperCase()] ?? ["card"];
}

/** Ghana network names Flutterwave accepts, with the names customers use today. */
const GH_NETWORKS: Record<string, string> = {
  MTN: "MTN",
  VODAFONE: "VODAFONE",
  TELECEL: "VODAFONE",
  TIGO: "TIGO",
  AIRTELTIGO: "TIGO",
  AT: "TIGO",
};

function chargeTypeFor(method: PaymentMethodKind, input: CreateIntentInput): { type: string; extra: Record<string, unknown> } {
  const d = input.details ?? {};
  const currency = input.currency.toUpperCase();
  switch (method) {
    case "mobile_money": {
      const type = MOMO_TYPE[currency];
      if (!type) throw new AppError("VALIDATION", `Mobile money isn't available for ${currency}`);
      const phone = normalisePhone(d.phone, currency);
      if (currency === "GHS") {
        const network = GH_NETWORKS[(d.network ?? "").toUpperCase().replace(/[^A-Z]/g, "")];
        if (!network) throw new AppError("VALIDATION", "Choose your mobile money network (MTN, Telecel or AirtelTigo)");
        return { type, extra: { phone_number: phone, network } };
      }
      return { type, extra: { phone_number: phone, ...(d.network ? { network: d.network.toUpperCase() } : {}) } };
    }
    case "opay":
      return { type: "opay", extra: {} };
    case "apple_pay":
      return { type: "applepay", extra: {} };
    case "google_pay":
      return { type: "googlepay", extra: {} };
    case "bank_transfer":
      return { type: "bank_transfer", extra: { is_permanent: false } };
    case "bank_account": {
      if (!d.bankCode || !/^\d{3,6}$/.test(d.bankCode)) throw new AppError("VALIDATION", "Choose your bank");
      if (!d.accountNumber || !/^\d{10}$/.test(d.accountNumber)) throw new AppError("VALIDATION", "Enter your 10-digit account number");
      return { type: "debit_ng_account", extra: { account_bank: d.bankCode, account_number: d.accountNumber } };
    }
    case "card":
      throw new AppError("VALIDATION", "Cards are paid on the secure hosted page");
  }
}

function chargeResult(txRef: string, r: FlwResponse<FlwCharge>, currency: string, validateType?: string): IntentResult {
  const auth = r.meta?.authorization ?? {};
  const mode = String(auth.mode ?? "").toLowerCase();
  const providerState: Record<string, string> = {};
  if (r.data?.flw_ref) providerState.flwRef = r.data.flw_ref;
  if (r.data?.id) providerState.flwId = String(r.data.id);
  if (validateType) providerState.validateType = validateType;

  let nextAction: NextAction | undefined;
  if (mode === "redirect" && auth.redirect) {
    nextAction = { type: "redirect", url: auth.redirect };
  } else if (mode === "otp") {
    nextAction = { type: "otp", message: auth.validate_instructions ?? r.data?.processor_response };
  } else if (mode === "banktransfer" && auth.transfer_account) {
    nextAction = {
      type: "bank_transfer",
      accountNumber: auth.transfer_account,
      bankName: auth.transfer_bank ?? "",
      amountMinor: toMinor(Number(auth.transfer_amount ?? 0), currency),
      expiresAt: auth.account_expiration ? new Date(auth.account_expiration).toISOString() : undefined,
      note: auth.transfer_note,
    };
  } else if (String(r.data?.status ?? "").toLowerCase() !== "successful") {
    nextAction = {
      type: "approve_on_phone",
      message: auth.validate_instructions ?? auth.note ?? "Approve the payment prompt on your phone",
    };
  }
  return {
    ref: txRef,
    // Never "SUCCEEDED" from a charge response — settlement waits for verify.
    status: nextAction && nextAction.type !== "approve_on_phone" ? "REQUIRES_ACTION" : "PROCESSING",
    authorizationUrl: nextAction?.type === "redirect" ? nextAction.url : undefined,
    nextAction,
    providerState,
  };
}

function normalisePhone(raw: string | undefined, currency: string): string {
  const digits = (raw ?? "").replace(/[^\d]/g, "");
  if (digits.length < 9 || digits.length > 15) throw new AppError("VALIDATION", "Enter the mobile money phone number");
  // Flutterwave's Ghana MoMo expects the local 0XXXXXXXXX form.
  if (currency === "GHS") {
    if (digits.startsWith("233") && digits.length === 12) return `0${digits.slice(3)}`;
    if (digits.length === 9) return `0${digits}`;
    if (digits.length === 10 && digits.startsWith("0")) return digits;
    throw new AppError("VALIDATION", "Enter a valid Ghana mobile money number");
  }
  return digits;
}

function redirectUrl(): string {
  return env.FLUTTERWAVE_REDIRECT_URL ?? "http://localhost:3000/payments/return";
}

/** ISO 4217 currencies with no minor unit (Flutterwave markets). */
const ZERO_DECIMAL = new Set(["UGX", "RWF", "XAF", "XOF", "GNF", "KMF", "JPY"]);
const exponent = (currency: string) => (ZERO_DECIMAL.has(currency.toUpperCase()) ? 0 : 2);
export const toMajor = (minor: number, currency: string) => minor / 10 ** exponent(currency);
export const toMinor = (major: number, currency: string) => Math.round(Number(major) * 10 ** exponent(currency));

function safeEqual(a: string, b: string): boolean {
  // Hash both sides so lengths match and nothing leaks through timing.
  return timingSafeEqualHex(sha256Hex(a), sha256Hex(b));
}
