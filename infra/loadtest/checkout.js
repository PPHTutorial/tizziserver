import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const BASE = __ENV.BASE_URL || "http://localhost:3000";
const TOKEN = __ENV.AUTH_TOKEN || "";
const OFFER_ID = __ENV.OFFER_ID || "seed-offer-orbit";

const errors = new Rate("checkout_errors");
const quoteMs = new Trend("checkout_quote_ms", true);
const placeMs = new Trend("checkout_place_ms", true);

export const options = {
  scenarios: {
    ramp: {
      executor: "ramping-vus",
      startVUs: 5,
      stages: [
        { duration: "30s", target: 40 },
        { duration: "2m", target: 40 },
        { duration: "30s", target: 0 },
      ],
    },
  },
  thresholds: {
    checkout_errors: ["rate<0.01"],
    "http_req_duration{name:quote}": ["p(95)<800"],
    "http_req_duration{name:place}": ["p(95)<800"],
  },
};

const headers = () => ({
  "Content-Type": "application/json",
  "X-Platform": "grandprice",
  "X-Device-Id": "k6-checkout",
  Authorization: `Bearer ${TOKEN}`,
});

export default function () {
  // 1) add to cart
  http.post(`${BASE}/api/v1/cart/items`, JSON.stringify({ offerId: OFFER_ID, qty: 1 }), { headers: headers() });

  // 2) quote
  const q = http.post(`${BASE}/api/v1/checkout/quote`, JSON.stringify({ fulfilmentMethod: "PICKUP" }), {
    headers: headers(),
    tags: { name: "quote" },
  });
  quoteMs.add(q.timings.duration);
  check(q, { "quote 200": (r) => r.status === 200 }) || errors.add(1);

  // 3) place (idempotent — safe to retry under load)
  const key = `k6-${__VU}-${__ITER}-${Date.now()}`;
  const p = http.post(
    `${BASE}/api/v1/checkout`,
    JSON.stringify({ fulfilmentMethod: "PICKUP", payment: { method: "wallet" } }),
    { headers: { ...headers(), "Idempotency-Key": key }, tags: { name: "place" } },
  );
  placeMs.add(p.timings.duration);
  check(p, { "place ok": (r) => r.status === 200 || r.status === 402 }) || errors.add(1);

  sleep(Math.random() * 2);
}
