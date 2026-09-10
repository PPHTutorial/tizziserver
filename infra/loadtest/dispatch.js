import http from "k6/http";
import { check, sleep } from "k6";
import { Rate } from "k6/metrics";

const BASE = __ENV.BASE_URL || "http://localhost:3000";
const TOKEN = __ENV.AUTH_TOKEN || "";

const errors = new Rate("dispatch_errors");

export const options = {
  scenarios: {
    spike: {
      executor: "ramping-arrival-rate",
      startRate: 2,
      timeUnit: "1s",
      preAllocatedVUs: 50,
      maxVUs: 120,
      stages: [
        { duration: "20s", target: 10 },
        { duration: "40s", target: 30 },
        { duration: "20s", target: 5 },
      ],
    },
  },
  thresholds: {
    dispatch_errors: ["rate<0.02"],
    "http_req_duration{name:create}": ["p(95)<1200"],
  },
};

const headers = () => ({
  "Content-Type": "application/json",
  "X-Platform": "grandprice",
  "X-Device-Id": "k6-dispatch",
  Authorization: `Bearer ${TOKEN}`,
});

export default function () {
  const body = {
    pickup: { lat: 5.6037, lng: -0.187, address: { line1: "Warehouse" }, contact: { name: "WH", phone: "+233200000001" } },
    dropoff: { lat: 5.556, lng: -0.196, address: { line1: "Osu" }, contact: { name: "Cust", phone: "+233200000003" } },
    items: [{ label: "Parcel", qty: 1 }],
    payment: { method: "wallet" },
  };
  const r = http.post(`${BASE}/api/v1/deliveries`, JSON.stringify(body), {
    headers: { ...headers(), "Idempotency-Key": `k6d-${__VU}-${__ITER}-${Date.now()}` },
    tags: { name: "create" },
  });
  check(r, { "delivery created": (x) => x.status === 200 || x.status === 402 }) || errors.add(1);

  if (r.status === 200) {
    const id = r.json("data.id");
    const t = http.get(`${BASE}/api/v1/deliveries/${id}/track`, { headers: headers(), tags: { name: "track" } });
    check(t, { "track 200": (x) => x.status === 200 });
  }
  sleep(1);
}
