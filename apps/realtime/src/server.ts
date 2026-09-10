/**
 * Stall realtime gateway (Phase 4).
 *
 * Namespaces:
 *   /tracking       — customer + courier live delivery tracking
 *   /delivery-ops   — STAFF/ADMIN ops feed
 *   /chat           — Phase 6
 *   /notifications  — Phase 6
 *
 * - JWT (EdDSA access token) verified on connect via `@stall/core`.
 * - Room entitlement is checked against the DB per subscribe.
 * - Courier `location` events are throttled + persisted through
 *   `@stall/core` `recordBreadcrumb`, then fanned out to the delivery room.
 * - The worker's outbox relay publishes state changes on the Redis channel
 *   `stall:realtime`; this process rebroadcasts them into the right rooms.
 * - `@socket.io/redis-adapter` keeps multiple instances in sync.
 */
import Fastify from "fastify";
import { Server as IOServer, type Socket } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import IORedis from "ioredis";
import { env } from "@stall/config";
import { verifyAccessToken, delivery as deliverySvc, couriers, comms, initObservability } from "@stall/core";

initObservability("stall-realtime");

const PORT = Number(process.env.REALTIME_PORT ?? 3001);
const REALTIME_CHANNEL = "stall:realtime";

const app = Fastify({ logger: true });

app.get("/health", async () => ({ ok: true, service: "realtime", env: env.NODE_ENV, ts: new Date().toISOString() }));

const io = new IOServer(app.server, { cors: { origin: false }, path: "/socket.io" });

// --- Redis: adapter + the worker→gateway event channel ------------------
let pub: IORedis | null = null;
let sub: IORedis | null = null;
if (env.REDIS_URL) {
  pub = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  sub = pub.duplicate();
  io.adapter(createAdapter(pub, sub.duplicate()));

  const chan = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  chan.subscribe(REALTIME_CHANNEL).then(() => app.log.info(`subscribed ${REALTIME_CHANNEL}`));
  chan.on("message", (_channel, raw) => {
    try {
      const msg = JSON.parse(raw) as {
        type: string;
        deliveryId?: string;
        platformSlug?: string;
        aggregateType?: string;
        aggregateId?: string;
        payload?: Record<string, unknown>;
      };
      if (msg.deliveryId) io.of("/tracking").to(`delivery:${msg.deliveryId}`).emit("delivery:event", msg);
      if (msg.platformSlug) io.of("/delivery-ops").to(`ops:${msg.platformSlug}`).emit("delivery:event", msg);

      if (msg.type === "chat.message" && msg.aggregateId) {
        io.of("/chat").to(`conversation:${msg.aggregateId}`).emit("chat:message", msg.payload ?? {});
        for (const uid of (msg.payload?.recipientIds as string[] | undefined) ?? []) {
          io.of("/chat").to(`user:${uid}`).emit("chat:inbox", { conversationId: msg.aggregateId, preview: msg.payload?.preview });
        }
      }
      if (msg.type === "notification.created" && msg.payload?.userId) {
        io.of("/notifications").to(`user:${msg.payload.userId as string}`).emit("notification", msg.payload);
      }
    } catch (e) {
      app.log.warn({ e }, "bad realtime message");
    }
  });
}

// --- auth handshake ----------------------------------------------------
async function authPrincipal(socket: Socket) {
  const token =
    (socket.handshake.auth?.token as string | undefined) ??
    (typeof socket.handshake.query.token === "string" ? socket.handshake.query.token : undefined);
  if (!token) throw new Error("missing token");
  const claims = await verifyAccessToken(token);
  return { userId: claims.sub, roles: claims.roles, activeRole: claims.activeRole };
}

// --- /tracking -------------------------------------------------------
io.of("/tracking").use(async (socket, next) => {
  try {
    socket.data.principal = await authPrincipal(socket);
    next();
  } catch (e) {
    next(e as Error);
  }
});

io.of("/tracking").on("connection", (socket) => {
  const { userId } = socket.data.principal as { userId: string };
  app.log.info({ id: socket.id, userId }, "/tracking connected");

  socket.on("subscribe", async ({ deliveryId }: { deliveryId: string }, ack?: (r: unknown) => void) => {
    try {
      const snapshot = await deliverySvc.getDeliveryTrack(deliveryId, userId); // throws if not a party
      socket.join(`delivery:${deliveryId}`);
      ack?.({ ok: true, snapshot });
    } catch (e) {
      ack?.({ ok: false, error: (e as Error).message });
    }
  });

  socket.on("unsubscribe", ({ deliveryId }: { deliveryId: string }) => {
    socket.leave(`delivery:${deliveryId}`);
  });

  socket.on(
    "location",
    async (
      p: { deliveryId: string; lat: number; lng: number; heading?: number; speed?: number; accuracy?: number },
      ack?: (r: unknown) => void,
    ) => {
      try {
        if (!socket.data.courierId) socket.data.courierId = await couriers.courierIdForUser(userId);
        const res = await deliverySvc.recordBreadcrumb(socket.data.courierId as string, p.deliveryId, p);
        io.of("/tracking")
          .to(`delivery:${p.deliveryId}`)
          .emit("delivery:location", { deliveryId: p.deliveryId, lat: p.lat, lng: p.lng, heading: p.heading, at: new Date().toISOString(), etaAt: res.etaAt });
        ack?.({ ok: true, stored: res.stored });
      } catch (e) {
        ack?.({ ok: false, error: (e as Error).message });
      }
    },
  );

  socket.on("disconnect", () => app.log.info({ id: socket.id }, "/tracking disconnected"));
});

// --- /delivery-ops (STAFF/ADMIN) ----------------------------------
io.of("/delivery-ops").use(async (socket, next) => {
  try {
    const p = await authPrincipal(socket);
    if (!p.roles.includes("STAFF") && !p.roles.includes("ADMIN")) return next(new Error("forbidden"));
    socket.data.principal = p;
    next();
  } catch (e) {
    next(e as Error);
  }
});
io.of("/delivery-ops").on("connection", (socket) => {
  socket.on("watch", ({ platformSlug }: { platformSlug: string }) => socket.join(`ops:${platformSlug}`));
});

// --- /chat (Phase 6) -------------------------------------------
io.of("/chat").use(async (socket, next) => {
  try {
    socket.data.principal = await authPrincipal(socket);
    next();
  } catch (e) {
    next(e as Error);
  }
});
io.of("/chat").on("connection", (socket) => {
  const { userId } = socket.data.principal as { userId: string };
  socket.join(`user:${userId}`);

  socket.on("subscribe", async ({ conversationId }: { conversationId: string }, ack?: (r: unknown) => void) => {
    try {
      const page = await comms.getMessages(userId, conversationId, { limit: 30 }); // throws if not a participant
      socket.join(`conversation:${conversationId}`);
      ack?.({ ok: true, messages: page.items });
    } catch (e) {
      ack?.({ ok: false, error: (e as Error).message });
    }
  });
  socket.on("unsubscribe", ({ conversationId }: { conversationId: string }) => socket.leave(`conversation:${conversationId}`));
  socket.on(
    "message",
    async (p: { conversationId: string; kind?: string; body?: string; attachments?: unknown }, ack?: (r: unknown) => void) => {
      try {
        const r = await comms.sendMessage(userId, p.conversationId, { kind: p.kind as never, body: p.body, attachments: p.attachments });
        ack?.({ ok: true, id: r.id });
      } catch (e) {
        ack?.({ ok: false, error: (e as Error).message });
      }
    },
  );
  socket.on("typing", ({ conversationId }: { conversationId: string }) => {
    // Only a socket that has actually subscribed (and so already passed
    // comms.getMessages' participant check) may relay into this room — an
    // unjoined socket can't spoof a typing indicator into a conversation it
    // was never granted access to.
    if (!socket.rooms.has(`conversation:${conversationId}`)) return;
    socket.to(`conversation:${conversationId}`).emit("chat:typing", { conversationId, userId });
  });
  socket.on("read", async ({ conversationId }: { conversationId: string }) => {
    await comms.markConversationRead(userId, conversationId).catch(() => {});
  });
  socket.on("disconnect", () => app.log.info({ id: socket.id }, "/chat disconnected"));
});

// --- /notifications (Phase 6) --------------------------------
io.of("/notifications").use(async (socket, next) => {
  try {
    socket.data.principal = await authPrincipal(socket);
    next();
  } catch (e) {
    next(e as Error);
  }
});
io.of("/notifications").on("connection", (socket) => {
  const { userId } = socket.data.principal as { userId: string };
  socket.join(`user:${userId}`);
  socket.on("disconnect", () => app.log.info({ id: socket.id }, "/notifications disconnected"));
});

app
  .listen({ port: PORT, host: "0.0.0.0" })
  .then(() => app.log.info(`realtime gateway on :${PORT}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    await Promise.allSettled([pub?.quit(), sub?.quit()]);
    process.exit(0);
  });
}
