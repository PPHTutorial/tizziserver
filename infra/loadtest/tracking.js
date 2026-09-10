import ws from "k6/ws";
import { check } from "k6";
import { Trend, Rate } from "k6/metrics";

// socket.io v4 uses an EIO=4 handshake; this hits the raw websocket transport.
const RT = __ENV.REALTIME_URL || "ws://localhost:3001";
const TOKEN = __ENV.AUTH_TOKEN || "";
const DELIVERY_ID = __ENV.DELIVERY_ID || "seed-delivery";

const connectMs = new Trend("rt_connect_ms", true);
const failures = new Rate("rt_failures");

export const options = {
  vus: 50,
  duration: "2m",
  thresholds: {
    rt_connect_ms: ["p(95)<500"],
    rt_failures: ["rate<0.01"],
  },
};

export default function () {
  const url = `${RT}/socket.io/?EIO=4&transport=websocket&token=${TOKEN}`;
  const start = Date.now();
  const res = ws.connect(url, {}, (socket) => {
    socket.on("open", () => {
      connectMs.add(Date.now() - start);
      socket.send(`40/tracking,`); // namespace connect
      socket.setInterval(() => {
        // emit a location ping ~1 Hz
        socket.send(`42/tracking,["location",{"deliveryId":"${DELIVERY_ID}","lat":5.60,"lng":-0.19,"heading":90,"speed":6}]`);
      }, 1000);
      socket.setTimeout(() => socket.close(), 20000);
    });
    socket.on("error", () => failures.add(1));
  });
  check(res, { "status is 101": (r) => r && r.status === 101 }) || failures.add(1);
}
