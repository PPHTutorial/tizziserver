import type { Metadata } from "next";

export const metadata: Metadata = { title: "Payment submitted · Stall" };

/**
 * Where Paystack sends the customer after the hosted checkout
 * (PAYSTACK_CALLBACK_URL=https://api.<domain>/payments/return). The payment is
 * settled by the webhook / the app's confirm call — this page only tells the
 * customer to go back to the app.
 */
export default function PaymentReturn() {
  return (
    <main className="mx-auto max-w-md px-5 py-20 text-center">
      <h1 className="text-2xl font-bold">Payment submitted</h1>
      <p className="mt-3 opacity-70">
        You can close this page and return to the app — tap &ldquo;I&rsquo;ve paid&rdquo; to update your wallet.
      </p>
    </main>
  );
}
