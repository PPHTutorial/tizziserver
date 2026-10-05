import type { Metadata } from "next";

export const metadata: Metadata = { title: "Payment submitted · Stall" };

/**
 * Where Flutterwave sends the customer after the hosted card page, Apple Pay,
 * Google Pay or OPay (FLUTTERWAVE_REDIRECT_URL=https://api.<domain>/payments/return).
 * The query string Flutterwave appends (status, tx_ref) is deliberately
 * ignored — anyone can type it. The payment is settled only after the server
 * verifies it with Flutterwave; this page just sends the customer back.
 */
export default function PaymentReturn() {
  return (
    <main className="mx-auto max-w-md px-5 py-20 text-center">
      <h1 className="text-2xl font-bold">Payment submitted</h1>
      <p className="mt-3 opacity-70">
        You can close this page and return to the app — it updates as soon as the payment is confirmed.
      </p>
    </main>
  );
}
