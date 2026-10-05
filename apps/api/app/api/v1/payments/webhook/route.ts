import { z } from "zod";
import { payments } from "@stall/core";
import { withApi } from "@/src/http/route";

/**
 * Gateway payment webhook. No bearer auth — authenticity is the gateway
 * signature, verified inside the adapter's `parseWebhook`; for Flutterwave the
 * transaction is then re-fetched from its API before anything settles, so the
 * body itself is never trusted. Idempotent. `?gateway=` selects the adapter
 * (defaults to `PAYMENTS_PROVIDER`); Flutterwave dashboard webhook URL:
 * https://api.<domain>/api/v1/payments/webhook?gateway=flutterwave
 */
export const POST = withApi(
  { query: z.object({ gateway: z.string().max(24).optional() }), rateLimit: { limit: 120, windowSec: 60, by: "ip" } },
  async ({ req, query }) => {
    const rawBody = await req.text();
    const headers: Record<string, string | undefined> = {};
    req.headers.forEach((v, k) => (headers[k] = v));
    return payments.handlePaymentWebhook({ gateway: query.gateway, headers, rawBody });
  },
);
