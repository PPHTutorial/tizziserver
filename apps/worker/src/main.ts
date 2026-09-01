/**
 * GrandPrice background worker (skeleton — Phase 0).
 *
 * Later phases add queues: outbox-relay, notifications, payouts, settlements,
 * auction-draws, kyc-pipeline, eta-refresh, breadcrumb-compaction, search-index,
 * analytics-rollup, dispute-timers, coupon-expiry.
 */
import http from "node:http";
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { env } from "@stall/config";

const PORT = Number(process.env.WORKER_PORT ?? 3002);
const connection = new IORedis(env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

// Placeholder queue so the wiring is exercised; real processors land in Phase 4+.
export const outboxRelay = new Queue("outbox-relay", { connection });

const worker = new Worker(
  "outbox-relay",
  async (job) => {
    console.log(`[outbox-relay] ${job.id}`, job.data);
  },
  { connection, autorun: true },
);

worker.on("ready", () => console.log("worker ready: outbox-relay"));
worker.on("failed", (job, err) => console.error(`job ${job?.id} failed`, err));

http
  .createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "worker", env: env.NODE_ENV }));
  })
  .listen(PORT, () => console.log(`worker health on :${PORT}`));

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    await worker.close();
    await connection.quit();
    process.exit(0);
  });
}
