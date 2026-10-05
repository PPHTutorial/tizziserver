import { createHmac } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { env } from "@stall/config";
import { prisma } from "@stall/db";
import { payments, wallet } from "@stall/core";
import { dropUser, makeUser } from "./helpers.ts";

// No network: Paystack's REST API is stubbed with the documented response
// shapes. This proves our side of the contract (amounts, references, the
// signature check, idempotent settlement) — a sandbox run is still required.
const SECRET = "sk_test_stall_unit";
const mutableEnv = env as unknown as Record<string, string | undefined>;
const trash: string[] = [];

function stubFetch(handler: (url: string, init?: RequestInit) => unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => new Response(JSON.stringify(handler(url, init)), { status: 200 })),
  );
}

const sign = (body: string) => createHmac("sha512", SECRET).update(body).digest("hex");

beforeAll(() => {
  mutableEnv.PAYSTACK_SECRET_KEY = SECRET;
});
afterEach(() => vi.unstubAllGlobals());
afterAll(async () => {
  delete mutableEnv.PAYSTACK_SECRET_KEY;
  for (const id of trash) await dropUser(id);
});

describe("PaystackGateway", () => {
  const gw = new payments.PaystackGateway();

  it("initializes a hosted checkout in subunits and returns its URL", async () => {
    let sent: Record<string, unknown> = {};
    stubFetch((url, init) => {
      expect(url).toBe("https://api.paystack.co/transaction/initialize");
      sent = JSON.parse(String(init?.body));
      return { status: true, message: "ok", data: { authorization_url: "https://checkout.paystack.com/abc", access_code: "abc", reference: sent.reference } };
    });
    const r = await gw.createIntent({ amountMinor: 2500, currency: "GHS", purpose: "WALLET_TOPUP", reference: "x", userId: "u1" });
    expect(sent).toMatchObject({ amount: 2500, currency: "GHS", channels: ["card", "mobile_money"] });
    expect(r).toMatchObject({ status: "REQUIRES_ACTION", authorizationUrl: "https://checkout.paystack.com/abc" });
    expect(r.ref).toBe(sent.reference);
  });

  it("only treats an exact-amount success as captured", async () => {
    stubFetch(() => ({ status: true, message: "ok", data: { status: "success", amount: 2500, fees: 49 } }));
    expect(await gw.capture("ref", 2500)).toMatchObject({ ok: true, capturedMinor: 2500, feeMinor: 49 });
    expect(await gw.capture("ref", 9900)).toMatchObject({ ok: false, failureReason: "amount_mismatch" });
    stubFetch(() => ({ status: true, message: "ok", data: { status: "abandoned", amount: 2500 } }));
    expect(await gw.capture("ref", 2500)).toMatchObject({ ok: false, failureReason: "abandoned" });
  });

  it("verifies the webhook HMAC-SHA512 signature", () => {
    const body = JSON.stringify({ event: "charge.success", data: { reference: "stl_1", amount: 2500, status: "success" } });
    expect(gw.parseWebhook({ "x-paystack-signature": sign(body) }, body)).toEqual({ ref: "stl_1", event: "payment.succeeded", amountMinor: 2500 });
    expect(gw.parseWebhook({ "x-paystack-signature": sign(body + " ") }, body)).toBeNull();
    expect(gw.parseWebhook({}, body)).toBeNull();
  });

  it("can't be used for in-process checkout — buyers top up the wallet instead", () => {
    expect(() => payments.directGatewayFor("paystack")).toThrow(/top up/);
    expect(payments.directGatewayFor("mock").name).toBe("mock");
  });
});

describe("wallet top-up through a hosted checkout", () => {
  it("returns the checkout URL, then credits the wallet exactly once on confirm + webhook", async () => {
    const user = await makeUser();
    trash.push(user.id);
    let reference = "";
    stubFetch((_url, init) => {
      reference = String(JSON.parse(String(init?.body)).reference);
      return { status: true, message: "ok", data: { authorization_url: "https://checkout.paystack.com/x", access_code: "x", reference } };
    });
    const started = await wallet.initiateTopUp({ userId: user.id, amountMinor: 5000, platformSlug: "grandprice", gateway: "paystack" });
    expect(started).toMatchObject({ status: "REQUIRES_ACTION", authorizationUrl: "https://checkout.paystack.com/x" });
    const intent = await prisma.paymentIntent.findUniqueOrThrow({ where: { id: started.intentId } });
    expect(intent.metadata).toMatchObject({ platformSlug: "grandprice" });

    // Customer hasn't paid yet → still pending, nothing credited.
    stubFetch(() => ({ status: true, message: "ok", data: { status: "ongoing", amount: 5000 } }));
    expect((await payments.confirmPaymentIntent(user.id, started.intentId)).status).toBe("REQUIRES_ACTION");
    expect((await wallet.getWallet(user.id)).balanceMinor).toBe(0);

    // Paid: confirm settles…
    stubFetch(() => ({ status: true, message: "ok", data: { status: "success", amount: 5000, fees: 98 } }));
    expect((await payments.confirmPaymentIntent(user.id, started.intentId)).status).toBe("SUCCEEDED");
    // …and the later webhook for the same charge is a no-op (no double credit).
    const body = JSON.stringify({ event: "charge.success", data: { reference, amount: 5000, status: "success" } });
    const hook = await payments.handlePaymentWebhook({ gateway: "paystack", headers: { "x-paystack-signature": sign(body) }, rawBody: body });
    expect(hook.handled).not.toBe("succeeded");
    expect((await wallet.getWallet(user.id)).balanceMinor).toBe(5000);

    // Someone else can't confirm your payment.
    const other = await makeUser();
    trash.push(other.id);
    await expect(payments.confirmPaymentIntent(other.id, started.intentId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
