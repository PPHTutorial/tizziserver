import { createHmac } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { env } from "@stall/config";
import { prisma } from "@stall/db";
import { payments, wallet } from "@stall/core";
import { dropUser, makeUser } from "./helpers.ts";

// No network: Flutterwave's v3 REST API is stubbed with the documented
// response shapes. This proves our side of the contract (major/minor units,
// tx_refs, signature checks, verify-before-settle, charge-once) — a test-mode
// run of every enabled method is still required before launch.
const SECRET = "FLWSECK_TEST-stall-unit";
const HASH = "stall-unit-webhook-hash";
const mutableEnv = env as unknown as Record<string, string | undefined>;
const trash: string[] = [];

type Handler = (url: string, init?: RequestInit) => unknown;
function stubFetch(handler: Handler) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : {} });
      return new Response(JSON.stringify(handler(url, init)), { status: 200 });
    }),
  );
  return calls;
}

const verified = (txRef: string, over: Record<string, unknown> = {}) => ({
  status: "success",
  message: "Transaction fetched successfully",
  data: { id: 4242, tx_ref: txRef, amount: 50, currency: "GHS", app_fee: 0.98, status: "successful", ...over },
});
const webhook = (txRef: string, status = "successful") =>
  JSON.stringify({ event: "charge.completed", data: { id: 4242, tx_ref: txRef, amount: 50, currency: "GHS", status } });

async function newUser() {
  const u = await makeUser();
  trash.push(u.id);
  return u;
}

beforeAll(() => {
  mutableEnv.FLUTTERWAVE_SECRET_KEY = SECRET;
  mutableEnv.FLUTTERWAVE_WEBHOOK_HASH = HASH;
});
afterEach(() => vi.unstubAllGlobals());
afterAll(async () => {
  delete mutableEnv.FLUTTERWAVE_SECRET_KEY;
  delete mutableEnv.FLUTTERWAVE_WEBHOOK_HASH;
  for (const id of trash) await dropUser(id);
});

describe("FlutterwaveGateway", () => {
  const gw = new payments.FlutterwaveGateway();

  it("sends cards to the hosted page in major units", async () => {
    const calls = stubFetch(() => ({ status: "success", message: "Hosted Link", data: { link: "https://checkout.flutterwave.com/v3/hosted/pay/abc" } }));
    const r = await gw.createIntent({ amountMinor: 2550, currency: "GHS", purpose: "WALLET_TOPUP", reference: "x", userId: "u1", ref: "stl_card" });
    expect(calls[0]!.url).toBe("https://api.flutterwave.com/v3/payments");
    expect(calls[0]!.body).toMatchObject({ tx_ref: "stl_card", amount: 25.5, currency: "GHS", payment_options: "card" });
    expect(r).toMatchObject({ ref: "stl_card", status: "REQUIRES_ACTION", nextAction: { type: "redirect" } });
  });

  it("charges Ghana MoMo in-app with a normalised number and network", async () => {
    const calls = stubFetch(() => ({
      status: "success",
      message: "Charge initiated",
      data: { id: 1, tx_ref: "stl_momo", flw_ref: "FLW-1", status: "pending" },
      meta: { authorization: { mode: "callback", validate_instructions: "Approve the prompt on 0241234567" } },
    }));
    const r = await gw.createIntent({
      amountMinor: 5000,
      currency: "GHS",
      purpose: "WALLET_TOPUP",
      reference: "x",
      userId: "u1",
      ref: "stl_momo",
      method: "mobile_money",
      details: { phone: "+233 24 123 4567", network: "Telecel" },
    });
    expect(calls[0]!.url).toBe("https://api.flutterwave.com/v3/charges?type=mobile_money_ghana");
    expect(calls[0]!.body).toMatchObject({ tx_ref: "stl_momo", amount: 50, phone_number: "0241234567", network: "VODAFONE" });
    expect(r).toMatchObject({ status: "PROCESSING", nextAction: { type: "approve_on_phone" }, providerState: { flwRef: "FLW-1" } });
  });

  it("refuses methods the currency/account doesn't support, before calling out", async () => {
    const calls = stubFetch(() => ({}));
    await expect(
      gw.createIntent({ amountMinor: 5000, currency: "GHS", purpose: "WALLET_TOPUP", reference: "x", userId: "u1", method: "opay" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      gw.createIntent({ amountMinor: 5000, currency: "GHS", purpose: "WALLET_TOPUP", reference: "x", userId: "u1", method: "mobile_money", details: { phone: "024", network: "MTN" } }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    expect(calls).toHaveLength(0);
  });

  it("maps bank transfer and Apple Pay responses to next actions", async () => {
    stubFetch(() => ({
      status: "success",
      message: "Charge initiated",
      meta: { authorization: { mode: "banktransfer", transfer_account: "0067100155", transfer_bank: "Mock Bank", transfer_amount: 50, transfer_note: "Pay exactly" } },
    }));
    const bt = await gw.createIntent({ amountMinor: 5000, currency: "NGN", purpose: "WALLET_TOPUP", reference: "x", userId: "u1", method: "bank_transfer" });
    expect(bt.nextAction).toMatchObject({ type: "bank_transfer", accountNumber: "0067100155", amountMinor: 5000 });

    const calls = stubFetch(() => ({ status: "success", message: "Charge initiated", meta: { authorization: { mode: "redirect", redirect: "https://flw.example/applepay" } } }));
    const ap = await gw.createIntent({ amountMinor: 5000, currency: "USD", purpose: "WALLET_TOPUP", reference: "x", userId: "u1", method: "apple_pay" });
    expect(calls[0]!.url).toContain("type=applepay");
    expect(ap.nextAction).toEqual({ type: "redirect", url: "https://flw.example/applepay" });
  });

  it("verifies status, exact amount, currency and reference", async () => {
    const expected = { amountMinor: 5000, currency: "GHS" };
    stubFetch(() => verified("stl_v"));
    expect(await gw.verify("stl_v", expected)).toMatchObject({ status: "succeeded", capturedMinor: 5000, feeMinor: 98 });
    stubFetch(() => verified("stl_v", { amount: 49.99 }));
    expect(await gw.verify("stl_v", expected)).toMatchObject({ status: "failed", failureReason: "amount_mismatch" });
    stubFetch(() => verified("stl_v", { currency: "NGN" }));
    expect(await gw.verify("stl_v", expected)).toMatchObject({ status: "failed", failureReason: "amount_mismatch" });
    stubFetch(() => verified("stl_other"));
    expect(await gw.verify("stl_v", expected)).toMatchObject({ status: "failed", failureReason: "amount_mismatch" });
    stubFetch(() => verified("stl_v", { status: "pending" }));
    expect((await gw.verify("stl_v", expected)).status).toBe("pending");
    stubFetch(() => ({ status: "error", message: "No transaction was found for this id", data: null }));
    expect((await gw.verify("stl_v", expected)).status).toBe("pending");
  });

  it("accepts only a correct verif-hash or flutterwave-signature", () => {
    const body = webhook("stl_w");
    const sig = createHmac("sha256", HASH).update(body).digest("base64");
    expect(gw.parseWebhook({ "verif-hash": HASH }, body)).toMatchObject({ ref: "stl_w", event: "payment.succeeded", amountMinor: 5000 });
    expect(gw.parseWebhook({ "flutterwave-signature": sig }, body)).toMatchObject({ ref: "stl_w" });
    expect(gw.parseWebhook({ "verif-hash": "wrong" }, body)).toBeNull();
    expect(gw.parseWebhook({ "flutterwave-signature": sig }, body + " ")).toBeNull();
    expect(gw.parseWebhook({}, body)).toBeNull();
  });

  it("can't be used for in-process checkout — buyers top up the wallet instead", () => {
    expect(() => payments.directGatewayFor("flutterwave")).toThrow(/top up/);
  });
});

describe("wallet top-up through Flutterwave", () => {
  async function startMomo(userId: string, idempotencyKey?: string) {
    let txRef = "";
    stubFetch((_url, init) => {
      txRef = String(JSON.parse(String(init?.body)).tx_ref);
      return { status: "success", message: "Charge initiated", data: { tx_ref: txRef, flw_ref: "FLW-9", status: "pending" }, meta: { authorization: { mode: "callback" } } };
    });
    const started = await wallet.initiateTopUp({
      userId,
      amountMinor: 5000,
      platformSlug: "grandprice",
      gateway: "flutterwave",
      method: "mobile_money",
      details: { phone: "0241234567", network: "MTN" },
      idempotencyKey,
    });
    return { started, txRef };
  }

  it("credits exactly once across poll, webhook and sweep — and only after verify", async () => {
    const user = await newUser();
    const { started, txRef } = await startMomo(user.id);
    expect(started).toMatchObject({ status: "PROCESSING", nextAction: { type: "approve_on_phone" } });
    const row = await prisma.paymentIntent.findUniqueOrThrow({ where: { id: started.intentId } });
    expect(row.gatewayRef).toBe(txRef);

    // Not approved yet → still pending, nothing credited.
    stubFetch(() => verified(txRef, { status: "pending" }));
    expect((await payments.confirmPaymentIntent(user.id, started.intentId)).status).toBe("PROCESSING");
    expect((await wallet.getWallet(user.id)).balanceMinor).toBe(0);

    // A correctly signed "successful" webhook is NOT enough on its own: the
    // provider still says pending, so nothing moves.
    const hook = await payments.handlePaymentWebhook({ gateway: "flutterwave", headers: { "verif-hash": HASH }, rawBody: webhook(txRef) });
    expect(hook.handled).toBe("processing");
    expect((await wallet.getWallet(user.id)).balanceMinor).toBe(0);

    // Approved: webhook, poll and sweep all race — one credit.
    stubFetch(() => verified(txRef));
    const results = await Promise.all([
      payments.handlePaymentWebhook({ gateway: "flutterwave", headers: { "verif-hash": HASH }, rawBody: webhook(txRef) }),
      payments.handlePaymentWebhook({ gateway: "flutterwave", headers: { "verif-hash": HASH }, rawBody: webhook(txRef) }),
      payments.confirmPaymentIntent(user.id, started.intentId),
    ]);
    expect(results.length).toBe(3);
    expect((await wallet.getWallet(user.id)).balanceMinor).toBe(5000);
    expect(await prisma.payment.count({ where: { intentId: started.intentId, status: "SUCCEEDED" } })).toBe(1);
    expect((await payments.getPaymentIntent(user.id, started.intentId)).status).toBe("SUCCEEDED");

    // Someone else can't see or confirm your payment.
    const other = await newUser();
    await expect(payments.confirmPaymentIntent(other.id, started.intentId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuses to credit a successful charge for the wrong amount", async () => {
    const user = await newUser();
    const { started, txRef } = await startMomo(user.id);
    stubFetch(() => verified(txRef, { amount: 5 }));
    expect((await payments.confirmPaymentIntent(user.id, started.intentId)).status).toBe("FAILED");
    expect((await wallet.getWallet(user.id)).balanceMinor).toBe(0);
  });

  it("still credits an approval that lands after we marked the payment failed", async () => {
    const user = await newUser();
    const { started, txRef } = await startMomo(user.id);
    stubFetch(() => verified(txRef, { status: "failed" }));
    expect((await payments.confirmPaymentIntent(user.id, started.intentId)).status).toBe("FAILED");
    // The provider later reports (and confirms) success — the customer paid.
    stubFetch(() => verified(txRef));
    await payments.handlePaymentWebhook({ gateway: "flutterwave", headers: { "verif-hash": HASH }, rawBody: webhook(txRef) });
    expect((await wallet.getWallet(user.id)).balanceMinor).toBe(5000);
  });

  it("returns the same intent for a repeated idempotency key instead of charging again", async () => {
    const user = await newUser();
    const first = await startMomo(user.id, "tap-1");
    const calls = stubFetch(() => {
      throw new Error("must not call Flutterwave again");
    });
    const again = await wallet.initiateTopUp({
      userId: user.id,
      amountMinor: 5000,
      platformSlug: "grandprice",
      gateway: "flutterwave",
      method: "mobile_money",
      details: { phone: "0241234567", network: "MTN" },
      idempotencyKey: "tap-1",
    });
    expect(again.intentId).toBe(first.started.intentId);
    expect(calls).toHaveLength(0);
  });

  it("ignores webhooks with a bad hash", async () => {
    const user = await newUser();
    const { txRef } = await startMomo(user.id);
    const calls = stubFetch(() => verified(txRef));
    const hook = await payments.handlePaymentWebhook({ gateway: "flutterwave", headers: { "verif-hash": "nope" }, rawBody: webhook(txRef) });
    expect(hook.handled).toBe("rejected:bad-signature");
    expect(calls).toHaveLength(0);
    expect((await wallet.getWallet(user.id)).balanceMinor).toBe(0);
  });
});
