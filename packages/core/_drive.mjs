/* on-device test driver — run: pnpm exec dotenv -e ../../.env -- tsx _drive.mjs <cmd> [args] */
import { prisma } from "@stall/db";
import { wallet, commerce, delivery, couriers, comms } from "@stall/core";

const CUSTOMER_PHONE = "+233555000100";
const PLATFORM = "grandprice";

async function customer() {
  const u = await prisma.user.findUniqueOrThrow({ where: { phone: CUSTOMER_PHONE } });
  return u.id;
}

const [cmd, ...args] = process.argv.slice(2);

async function main() {
switch (cmd) {
  case "topup": {
    const uid = await customer();
    const r = await wallet.initiateTopUp({ userId: uid, amountMinor: Number(args[0] ?? 2_000_000), platformSlug: PLATFORM, gateway: "mock" });
    console.log("topup:", r.status, "balance:", r.balanceMinor);
    break;
  }
  case "state": {
    const uid = await customer();
    const orders = await prisma.order.findMany({
      where: { customerId: uid },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true, number: true, status: true, fulfilmentMethod: true, totalMinor: true,
        vendorOrders: { select: { id: true, status: true, vendorId: true, vendor: { select: { displayName: true, userId: true } } } },
      },
    });
    console.log(JSON.stringify(orders, null, 2));
    const dels = await prisma.delivery.findMany({ where: { customerId: uid }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, status: true, code: true, courierId: true } });
    console.log("deliveries:", JSON.stringify(dels, null, 2));
    const convos = await prisma.conversation.findMany({ where: { participants: { some: { userId: uid } } }, select: { id: true, kind: true, subjectId: true }, take: 5 });
    console.log("conversations:", JSON.stringify(convos, null, 2));
    break;
  }
  case "vendor-ready": {
    // args[0] = vendorOrderId. Accept -> Preparing -> Ready (spawns Delivery).
    const voId = args[0];
    const vo = await prisma.vendorOrder.findUniqueOrThrow({ where: { id: voId }, include: { vendor: true } });
    const vUser = vo.vendor.userId;
    for (const s of ["ACCEPTED", "PREPARING", "READY_FOR_PICKUP"]) {
      const r = await commerce.setVendorOrderStatus(vUser, voId, s);
      console.log(s, "->", r.status ?? "ok", r.deliveryId ? `deliveryId=${r.deliveryId}` : "");
    }
    break;
  }
  case "dispatch": {
    // args[0] = deliveryId. Put the grandprice courier online near pickup, dispatch, auto-accept the offer.
    const delId = args[0];
    const d = await prisma.delivery.findUniqueOrThrow({ where: { id: delId } });
    const cp = await prisma.courierProfile.findFirstOrThrow({ where: { status: "ACTIVE" }, include: { user: true } });
    await couriers.goOnline(cp.userId, PLATFORM, { lat: d.pickupLat, lng: d.pickupLng });
    console.log("courier online:", cp.id);
    const disp = await delivery.dispatchDelivery(delId);
    console.log("dispatch:", JSON.stringify(disp));
    const offer = await prisma.deliveryOffer.findFirst({ where: { deliveryId: delId, response: "PENDING" }, orderBy: { createdAt: "desc" } });
    if (offer) {
      const acc = await delivery.respondToOffer(offer.courierId, offer.id, "ACCEPT");
      console.log("accepted:", JSON.stringify(acc));
    } else {
      console.log("no pending offer found");
    }
    break;
  }
  case "gps": {
    // args[0]=deliveryId args[1]=steps(default 10). Interpolates pickup->dropoff.
    const delId = args[0];
    const steps = Number(args[1] ?? 10);
    const d = await prisma.delivery.findUniqueOrThrow({ where: { id: delId }, select: { courierId: true, pickupLat: true, pickupLng: true, dropoffLat: true, dropoffLng: true, status: true } });
    if (!d.courierId) throw new Error("no courier on delivery yet — run dispatch first");
    const enroute = ["PICKED_UP", "EN_ROUTE_DROPOFF", "ARRIVED_DROPOFF"].includes(d.status);
    const [aLat, aLng] = enroute ? [d.pickupLat, d.pickupLng] : [d.pickupLat - 0.02, d.pickupLng - 0.02];
    const [bLat, bLng] = enroute ? [d.dropoffLat, d.dropoffLng] : [d.pickupLat, d.pickupLng];
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const lat = aLat + (bLat - aLat) * t;
      const lng = aLng + (bLng - aLng) * t;
      const heading = (Math.atan2(bLng - aLng, bLat - aLat) * 180) / Math.PI;
      const r = await delivery.recordBreadcrumb(d.courierId, delId, { lat, lng, heading, speed: 8 });
      console.log(`ping ${i}/${steps}  ${lat.toFixed(5)},${lng.toFixed(5)}  eta=${r.etaAt ?? "-"}`);
      if (i < steps) await new Promise((r) => setTimeout(r, Number(args[2] ?? 4000)));
    }
    break;
  }
  case "advance": {
    // args[0]=deliveryId. Courier moves one step forward (auto-verifies pickup/dropoff codes).
    const delId = args[0];
    const d = await prisma.delivery.findUniqueOrThrow({ where: { id: delId }, include: { pickupVerification: true, dropoffVerification: true } });
    const FWD = { COURIER_ASSIGNED: "COURIER_EN_ROUTE_PICKUP", COURIER_EN_ROUTE_PICKUP: "ARRIVED_PICKUP", ARRIVED_PICKUP: "PICKED_UP", PICKED_UP: "EN_ROUTE_DROPOFF", EN_ROUTE_DROPOFF: "ARRIVED_DROPOFF", ARRIVED_DROPOFF: "DELIVERED" };
    const to = FWD[d.status];
    if (!to) { console.log("no forward step from", d.status); break; }
    if (to === "PICKED_UP" && !d.pickupVerification?.verifiedAt) {
      await delivery.verifyPickup(d.courierId, delId, { code: d.pickupVerification?.code ?? undefined, packageCount: 1 });
      console.log("auto-verified pickup");
    }
    if (to === "DELIVERED" && !d.dropoffVerification?.verifiedAt) {
      await delivery.verifyDropoff(d.courierId, delId, { code: d.dropoffVerification?.code ?? undefined });
      console.log("auto-verified dropoff");
    }
    const r = await delivery.courierAdvanceDelivery(d.courierId, delId, to);
    console.log("advanced:", d.status, "->", r.status);
    break;
  }
  case "chat": {
    // args[0]=orderId  args[1..]=message. Vendor of the first sub-order sends it.
    const orderId = args[0];
    const msg = args.slice(1).join(" ") || "Hi! Your order is being prepared now.";
    const o = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { vendorOrders: { include: { vendor: true } } } });
    const vUser = o.vendorOrders[0].vendor.userId;
    const uid = await customer();
    const convo = await comms.getOrCreateConversation({ kind: "ORDER", subjectId: orderId, creatorUserId: vUser, participantUserIds: [vUser, uid] });
    const r = await comms.sendMessage(vUser, convo.id, { kind: "TEXT", body: msg });
    console.log("sent msg", r.id, "in convo", convo.id);
    break;
  }
  case "typing": {
    // args[0]=orderId. Opens a /chat socket as the vendor and emits a typing ping.
    const { io } = await import("socket.io-client");
    const { signAccessToken } = await import("@stall/core");
    const orderId = args[0];
    const o = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { vendorOrders: { include: { vendor: true } } } });
    const vUser = o.vendorOrders[0].vendor.userId;
    const uid = await customer();
    const convo = await comms.getOrCreateConversation({ kind: "ORDER", subjectId: orderId, creatorUserId: vUser, participantUserIds: [vUser, uid] });
    const token = await signAccessToken({ sub: vUser, roles: ["VENDOR"], activeRole: "VENDOR", platformSlug: PLATFORM });
    const s = io("http://localhost:3001/chat", { transports: ["websocket"], auth: { token } });
    s.on("connect", () => {
      s.emit("subscribe", { conversationId: convo.id });
      let n = 0;
      const iv = setInterval(() => {
        s.emit("typing", { conversationId: convo.id });
        console.log("typing ping", ++n);
        if (n >= 8) { clearInterval(iv); s.close(); process.exit(0); }
      }, 1500);
    });
    s.on("connect_error", (e) => { console.log("connect_error", e.message); process.exit(1); });
    return; // keep the socket alive
  }
  case "notify": {
    const uid = await customer();
    await comms.notify({ userId: uid, category: "SYSTEM", title: "Test notification", body: "Live bell check — " + new Date().toLocaleTimeString() });
    console.log("notification sent to", uid);
    break;
  }
  default:
    console.log("cmds: topup | state | vendor-ready <voId> | dispatch <delId> | gps <delId> [steps] [ms] | advance <delId> | chat <orderId> [msg] | typing <orderId> | notify");
}
await prisma.$disconnect();
}

main();
