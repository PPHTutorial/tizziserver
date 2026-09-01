/**
 * GrandPrice realtime gateway (skeleton — Phase 0).
 *
 * Phase 4 fills in:
 *   - JWT verify on connect, room entitlement
 *   - namespaces: /tracking /chat /notifications /delivery-ops
 *   - @socket.io/redis-adapter for horizontal scale
 *   - Redis pub/sub consumer for the transactional outbox relay
 */
import Fastify from "fastify";
import { Server as IOServer } from "socket.io";
import { env } from "@grandprice/config";

const PORT = Number(process.env.REALTIME_PORT ?? 3001);

const app = Fastify({ logger: true });

app.get("/health", async () => ({
  ok: true,
  service: "realtime",
  env: env.NODE_ENV,
  ts: new Date().toISOString(),
}));

const io = new IOServer(app.server, {
  cors: { origin: false },
  path: "/socket.io",
});

for (const ns of ["/tracking", "/chat", "/notifications", "/delivery-ops"]) {
  io.of(ns).on("connection", (socket) => {
    app.log.info({ ns, id: socket.id }, "socket connected (skeleton)");
    socket.on("disconnect", () =>
      app.log.info({ ns, id: socket.id }, "socket disconnected"),
    );
  });
}

app
  .listen({ port: PORT, host: "0.0.0.0" })
  .then(() => app.log.info(`realtime gateway on :${PORT}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
