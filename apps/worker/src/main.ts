/**
 * Stall background worker (Phase 4).
 *
 * Loops (interval-driven; BullMQ queues can front these later for ret/backoff):
 *   - outbox-relay        : OutboxEvent → Redis `stall:realtime` + push (log) → mark dispatched
 *   - dispatch-sweep      : expire stale DeliveryOffers, advance the waterfall, time out undispatchable
 *   - eta-refresh         : recompute ETA for active deliveries from the last breadcrumb
 *   - payout-drain        : PENDING Payout → PROCESSING → PAID (mock gateway)
 *   - stale-reservation-sweep : release stock reservations (+ refund if captured) held by
 *                               orders stuck in PENDING_PAYMENT past a crash-recovery window
 *   - breadcrumb-compact  : prune old DeliveryLocation rows
 */
import http from "node:http";
import IORedis from "ioredis";
import { env } from "@stall/config";
import { prisma } from "@stall/db";
import {
  delivery as deliverySvc,
  maps,
  auctions as auctionSvc,
  comms as commsSvc,
  trust as trustSvc,
  ads as adsSvc,
  analytics as analyticsSvc,
  referrals as referralsSvc,
  admin as adminSvc,
  privacy as privacySvc,
  commerce as commerceSvc,
  initObservability,
} from "@stall/core";

initObservability("stall-worker");

const PORT = Number(process.env.WORKER_PORT ?? 3002);
const REALTIME_CHANNEL = "stall:realtime";

const redis = env.REDIS_URL ? new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null }) : null;

const RELAY_TYPES = /^(delivery|order|vendor_order)\./;

// --- outbox relay -----------------------------------------------------
async function relayOutbox() {
  const batch = await prisma.outboxEvent.findMany({
    where: { dispatchedAt: null },
    orderBy: { createdAt: "asc" },
    take: 100,
  });
  if (batch.length === 0) return;
  for (const ev of batch) {
    try {
      if (redis && RELAY_TYPES.test(ev.type)) {
        let platformSlug: string | undefined;
        let deliveryId: string | undefined;
        if (ev.aggregateType === "Delivery") {
          deliveryId = ev.aggregateId;
          const d = await prisma.delivery.findUnique({ where: { id: ev.aggregateId }, select: { platformSlug: true } });
          platformSlug = d?.platformSlug;
        }
        await redis.publish(
          REALTIME_CHANNEL,
          JSON.stringify({ type: ev.type, deliveryId, platformSlug, aggregateType: ev.aggregateType, aggregateId: ev.aggregateId, payload: ev.payload, at: ev.createdAt }),
        );
      }
      // Map known events → in-app / push notifications (B6 FCM not provisioned → log adapter).
      await commsSvc.notifyFromOutboxEvent(ev).catch((e) => console.error("[notify-from-outbox]", e));
      await prisma.outboxEvent.update({ where: { id: ev.id }, data: { dispatchedAt: new Date() } });
    } catch (e) {
      console.error("[outbox-relay] failed", ev.id, e);
    }
  }
}

// --- dispatch sweep -------------------------------------------------
async function dispatchSweep() {
  try {
    const a = await deliverySvc.sweepExpiredOffers();
    const b = await deliverySvc.expireUndispatchable();
    if (a.swept || b.cancelled) console.log(`[dispatch-sweep] swept=${a.swept} redispatched=${a.redispatched} cancelled=${b.cancelled}`);
  } catch (e) {
    console.error("[dispatch-sweep]", e);
  }
}

// --- eta refresh ---------------------------------------------------
async function etaRefresh() {
  const active = await prisma.delivery.findMany({
    where: {
      status: { in: ["COURIER_EN_ROUTE_PICKUP", "PICKED_UP", "EN_ROUTE_DROPOFF"] },
      courierId: { not: null },
    },
    select: { id: true, status: true, pickupLat: true, pickupLng: true, dropoffLat: true, dropoffLng: true },
    take: 200,
  });
  for (const d of active) {
    const last = await prisma.deliveryLocation.findFirst({ where: { deliveryId: d.id }, orderBy: { at: "desc" } });
    if (!last || Date.now() - last.at.getTime() > 120_000) continue;
    const dest =
      d.status === "COURIER_EN_ROUTE_PICKUP" ? { lat: d.pickupLat, lng: d.pickupLng } : { lat: d.dropoffLat, lng: d.dropoffLng };
    const route = await maps.estimateRoute({ lat: last.lat, lng: last.lng }, dest);
    await prisma.delivery.update({ where: { id: d.id }, data: { etaAt: maps.etaFrom(route.durationS) } });
  }
}

// --- payout drain ------------------------------------------------
async function payoutDrain() {
  const pending = await prisma.payout.findMany({ where: { status: "PENDING" }, take: 50 });
  for (const p of pending) {
    await prisma.payout.update({ where: { id: p.id }, data: { status: "PROCESSING" } });
    // mock gateway settles instantly
    await prisma.payout.update({ where: { id: p.id }, data: { status: "PAID", gatewayRef: `mock_${p.id.slice(-8)}` } });
    console.log(`[payout-drain] ${p.ownerType}:${p.ownerId} ${p.amountMinor} → PAID`);
  }
}

// --- auction draws -------------------------------------------
async function auctionDraws() {
  try {
    const r = await auctionSvc.dueDraws();
    if (r.length) console.log(`[auction-draws] resolved ${r.length}:`, r.map((x) => x.status).join(","));
  } catch (e) {
    console.error("[auction-draws]", e);
  }
}

// --- dispute SLA sweep -------------------------------------
async function disputeSla() {
  try {
    const r = await trustSvc.sweepDisputeSla();
    if (r.escalated) console.log(`[dispute-sla] escalated ${r.escalated}`);
  } catch (e) {
    console.error("[dispute-sla]", e);
  }
}

// --- Phase 7: advertising / campaigns -------------------------
async function adsSweep() {
  try {
    const a = await adsSvc.activateDueCampaigns();
    const b = await adsSvc.completeFinishedCampaigns();
    const c = await adsSvc.expireFinishedBoosts();
    if (a.activated || b.completed || c.expired) console.log(`[ads-sweep] activated=${a.activated} completed=${b.completed} boostsExpired=${c.expired}`);
  } catch (e) {
    console.error("[ads-sweep]", e);
  }
}

// --- Phase 7: broadcasts + referral expiry --------------------
async function broadcastAndReferralSweep() {
  try {
    const b = await adminSvc.dueBroadcasts();
    const r = await referralsSvc.expireStaleReferrals();
    if (b.sent || r.expired) console.log(`[broadcast/referral] sent=${b.sent} referralsExpired=${r.expired}`);
  } catch (e) {
    console.error("[broadcast/referral-sweep]", e);
  }
}

// --- Phase 7: nightly analytics roll-ups (top of the UTC hour) -
let lastRollupDay = "";
async function analyticsRollup() {
  const now = new Date();
  const dayKey = now.toISOString().slice(0, 10);
  if (now.getUTCHours() !== 0 || lastRollupDay === dayKey) return;
  lastRollupDay = dayKey;
  try {
    const a = await adsSvc.rollupAdStats();
    const c = await adsSvc.compactAdEvents();
    const s = await analyticsSvc.snapshotAllPlatforms();
    console.log(`[analytics-rollup] adStats=${JSON.stringify(a)} pruned=${c.pruned} snapshots=${s.platforms}`);
  } catch (e) {
    console.error("[analytics-rollup]", e);
  }
}

// --- Phase 8: GDPR account-deletion + retention (hourly) ------
let lastPrivacyHour = -1;
async function privacySweep() {
  const h = new Date().getUTCHours();
  if (h === lastPrivacyHour) return;
  lastPrivacyHour = h;
  try {
    const d = await privacySvc.processDueDeletions();
    if (d.processed) console.log(`[privacy] anonymised ${d.processed} account(s)`);
    if (h === 3) {
      const a = await privacySvc.purgeStaleAuditLogs();
      if (a.pruned) console.log(`[privacy] pruned ${a.pruned} audit rows`);
    }
  } catch (e) {
    console.error("[privacy-sweep]", e);
  }
}

// --- stale checkout reservations ---------------------------------
async function staleReservationSweep() {
  try {
    const { released } = await commerceSvc.releaseStaleReservations();
    if (released) console.log(`[stale-reservation-sweep] released ${released} order(s)`);
  } catch (e) {
    console.error("[stale-reservation-sweep]", e);
  }
}

// --- breadcrumb compaction -------------------------------------
async function breadcrumbCompact() {
  const cutoff = new Date(Date.now() - 3 * 86_400_000);
  const { count } = await prisma.deliveryLocation.deleteMany({
    where: { at: { lt: cutoff }, delivery: { status: { in: ["COMPLETED", "CANCELLED_BY_CUSTOMER", "CANCELLED_BY_COURIER", "CANCELLED_BY_SYSTEM"] } } },
  });
  if (count) console.log(`[breadcrumb-compact] pruned ${count}`);
}

// --- loop scaffolding ------------------------------------------
type Loop = { name: string; everyMs: number; fn: () => Promise<void> };
const loops: Loop[] = [
  { name: "outbox-relay", everyMs: 1_000, fn: relayOutbox },
  { name: "dispatch-sweep", everyMs: 5_000, fn: dispatchSweep },
  { name: "eta-refresh", everyMs: 30_000, fn: etaRefresh },
  { name: "payout-drain", everyMs: 20_000, fn: payoutDrain },
  { name: "auction-draws", everyMs: 15_000, fn: auctionDraws },
  { name: "dispute-sla", everyMs: 60_000, fn: disputeSla },
  { name: "ads-sweep", everyMs: 30_000, fn: adsSweep },
  { name: "broadcast-referral-sweep", everyMs: 60_000, fn: broadcastAndReferralSweep },
  { name: "analytics-rollup", everyMs: 300_000, fn: analyticsRollup },
  { name: "privacy-sweep", everyMs: 600_000, fn: privacySweep },
  { name: "stale-reservation-sweep", everyMs: 900_000, fn: staleReservationSweep },
  { name: "breadcrumb-compact", everyMs: 3_600_000, fn: breadcrumbCompact },
];

const timers: NodeJS.Timeout[] = [];
for (const l of loops) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await l.fn();
    } catch (e) {
      console.error(`[${l.name}]`, e);
    } finally {
      running = false;
    }
  };
  timers.push(setInterval(tick, l.everyMs));
}
console.log(`worker loops started: ${loops.map((l) => l.name).join(", ")}`);

http
  .createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "worker", env: env.NODE_ENV, loops: loops.map((l) => l.name) }));
  })
  .listen(PORT, () => console.log(`worker health on :${PORT}`));

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    timers.forEach(clearInterval);
    await Promise.allSettled([redis?.quit(), prisma.$disconnect()]);
    process.exit(0);
  });
}
