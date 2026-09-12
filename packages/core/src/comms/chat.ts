/**
 * Chat — typed conversations (customer↔vendor / customer↔courier / support),
 * attachments + shareable entities, read receipts, block. Realtime fan-out via
 * `OutboxEvent` (`chat.message`) → `apps/realtime` `/chat`.
 */
import { prisma, type Prisma, type ConversationKind, type MessageKind } from "@stall/db";
import { AppError } from "../errors.ts";
import { notify } from "./notifications.ts";

export interface OpenConversationInput {
  kind: ConversationKind;
  participants: { userId: string; role: string }[];
  subjectType?: string;
  subjectId?: string;
}

/** Idempotent: reuse an existing thread for the same (kind, subject) or participant pair. */
export async function getOrCreateConversation(input: OpenConversationInput) {
  if (input.participants.length < 1) throw new AppError("VALIDATION", "A conversation needs participants");

  if (input.subjectId) {
    const existing = await prisma.conversation.findFirst({
      where: { kind: input.kind, subjectId: input.subjectId, subjectType: input.subjectType ?? null },
      include: { participants: true },
    });
    if (existing) return existing;
  } else {
    const ids = input.participants.map((p) => p.userId).sort();
    const candidates = await prisma.conversation.findMany({
      where: { kind: input.kind, participants: { every: { userId: { in: ids } } } },
      include: { participants: true },
    });
    const match = candidates.find(
      (c) => c.participants.length === ids.length && c.participants.every((p) => ids.includes(p.userId)),
    );
    if (match) return match;
  }

  return prisma.conversation.create({
    data: {
      kind: input.kind,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      participants: { create: input.participants.map((p) => ({ userId: p.userId, role: p.role })) },
    },
    include: { participants: true },
  });
}

async function assertParticipant(userId: string, conversationId: string) {
  const p = await prisma.conversationParticipant.findUnique({ where: { conversationId_userId: { conversationId, userId } } });
  if (!p) throw new AppError("FORBIDDEN", "Not in this conversation");
  return p;
}

export async function listConversations(userId: string) {
  const parts = await prisma.conversationParticipant.findMany({
    where: { userId },
    include: {
      conversation: {
        include: {
          participants: { include: { user: { select: { id: true, firstName: true, lastName: true, avatar: true } } } },
          messages: { orderBy: { at: "desc" }, take: 1 },
        },
      },
    },
    orderBy: { conversation: { lastMessageAt: "desc" } },
  });

  const items = await Promise.all(
    parts.map(async (p) => {
      const c = p.conversation;
      const others = c.participants.filter((x) => x.userId !== userId);
      const unread = await prisma.message.count({
        where: { conversationId: c.id, senderId: { not: userId }, at: { gt: p.lastReadAt ?? new Date(0) } },
      });
      const last = c.messages[0];
      return {
        id: c.id,
        kind: c.kind,
        status: c.status,
        subjectType: c.subjectType,
        subjectId: c.subjectId,
        title:
          c.kind === "SUPPORT"
            ? "Stall Support"
            : others.map((o) => [o.user.firstName, o.user.lastName].filter(Boolean).join(" ") || "User").join(", "),
        avatar: others[0]?.user.avatar ?? null,
        lastMessage: last ? { kind: last.kind, body: last.body, at: last.at.toISOString(), fromMe: last.senderId === userId } : null,
        unread,
        lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
      };
    }),
  );
  return { items };
}

export async function getMessages(userId: string, conversationId: string, opts: { cursor?: string; limit?: number } = {}) {
  await assertParticipant(userId, conversationId);
  const limit = Math.min(Math.max(1, Math.trunc(opts.limit ?? 30)), 60);
  const rows = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { at: "desc" },
    take: limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });
  const nextCursor = rows.length > limit ? rows[limit - 1]!.id : null;

  // mark the peer's messages delivered to us
  await prisma.$transaction(
    rows
      .filter((m) => m.senderId !== userId)
      .map((m) =>
        prisma.messageReceipt.upsert({
          where: { messageId_userId: { messageId: m.id, userId } },
          create: { messageId: m.id, userId, deliveredAt: new Date() },
          update: { deliveredAt: new Date() },
        }),
      ),
  );

  return {
    items: rows
      .slice(0, limit)
      .reverse()
      .map((m) => ({
        id: m.id,
        kind: m.kind,
        body: m.body,
        attachments: m.attachments,
        meta: m.meta,
        fromMe: m.senderId === userId,
        at: m.at.toISOString(),
      })),
    nextCursor,
  };
}

export interface SendMessageInput {
  kind?: MessageKind;
  body?: string;
  attachments?: unknown;
  meta?: Record<string, unknown>;
}

export async function sendMessage(userId: string, conversationId: string, input: SendMessageInput) {
  await assertParticipant(userId, conversationId);
  const convo = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId }, include: { participants: true } });
  const others = convo.participants.filter((p) => p.userId !== userId);

  // block check (either direction)
  const blocked = await prisma.block.findFirst({
    where: {
      OR: others.flatMap((o) => [
        { byUserId: o.userId, targetUserId: userId },
        { byUserId: userId, targetUserId: o.userId },
      ]),
    },
  });
  if (blocked) throw new AppError("FORBIDDEN", "You can't message this user");

  if (!input.body && !input.attachments) throw new AppError("VALIDATION", "A message needs a body or an attachment");

  const msg = await prisma.$transaction(async (tx) => {
    const m = await tx.message.create({
      data: {
        conversationId,
        senderId: userId,
        kind: input.kind ?? "TEXT",
        body: input.body,
        attachments: (input.attachments ?? undefined) as Prisma.InputJsonValue,
        meta: (input.meta ?? undefined) as Prisma.InputJsonValue,
      },
    });
    await tx.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: m.at } });
    await tx.messageReceipt.create({ data: { messageId: m.id, userId, deliveredAt: m.at, readAt: m.at } });
    await tx.outboxEvent.create({
      data: {
        type: "chat.message",
        aggregateType: "Conversation",
        aggregateId: conversationId,
        payload: { messageId: m.id, senderId: userId, recipientIds: others.map((o) => o.userId), preview: (input.body ?? "[attachment]").slice(0, 120) } as Prisma.InputJsonValue,
      },
    });
    return m;
  });

  for (const o of others) {
    if (o.muted) continue;
    await notify({
      userId: o.userId,
      category: convo.kind === "SUPPORT" ? "SUPPORT" : "CHAT",
      title: convo.kind === "SUPPORT" ? "Support replied" : "New message",
      body: (input.body ?? "Sent an attachment").slice(0, 140),
      data: { conversationId },
    }).catch(() => {});
  }

  return { id: msg.id, at: msg.at.toISOString() };
}

export async function markConversationRead(userId: string, conversationId: string) {
  await assertParticipant(userId, conversationId);
  const now = new Date();
  await prisma.$transaction([
    prisma.conversationParticipant.update({ where: { conversationId_userId: { conversationId, userId } }, data: { lastReadAt: now } }),
    prisma.messageReceipt.updateMany({
      where: { userId, message: { conversationId, senderId: { not: userId } }, readAt: null },
      data: { readAt: now },
    }),
  ]);
  return { read: true };
}

export async function setConversationMuted(userId: string, conversationId: string, muted: boolean) {
  await assertParticipant(userId, conversationId);
  await prisma.conversationParticipant.update({ where: { conversationId_userId: { conversationId, userId } }, data: { muted } });
  return { muted };
}

export async function blockUser(userId: string, targetUserId: string) {
  if (userId === targetUserId) throw new AppError("VALIDATION", "You can't block yourself");
  await prisma.block.upsert({
    where: { byUserId_targetUserId: { byUserId: userId, targetUserId } },
    create: { byUserId: userId, targetUserId },
    update: {},
  });
  return { blocked: true };
}

export async function unblockUser(userId: string, targetUserId: string) {
  await prisma.block.deleteMany({ where: { byUserId: userId, targetUserId } });
  return { blocked: false };
}

export async function listBlocks(userId: string) {
  const rows = await prisma.block.findMany({
    where: { byUserId: userId },
    include: { targetUser: { select: { id: true, firstName: true, lastName: true } } },
  });
  return { items: rows.map((b) => ({ userId: b.targetUserId, name: [b.targetUser.firstName, b.targetUser.lastName].filter(Boolean).join(" ") || "User", at: b.at.toISOString() })) };
}

/** Convenience: open (or reuse) the customer↔vendor thread for an order. */
export async function conversationForOrder(userId: string, orderId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, customerId: userId },
    include: { vendorOrders: { include: { vendor: { select: { userId: true, displayName: true } } } } },
  });
  if (!order) throw new AppError("NOT_FOUND", "Order not found");
  const vendorUserId = order.vendorOrders[0]?.vendor.userId;
  if (!vendorUserId) throw new AppError("CONFLICT", "No vendor to message");
  const convo = await getOrCreateConversation({
    kind: "CUSTOMER_VENDOR",
    subjectType: "ORDER",
    subjectId: orderId,
    participants: [
      { userId, role: "CUSTOMER" },
      { userId: vendorUserId, role: "VENDOR" },
    ],
  });
  return { conversationId: convo.id };
}

/** Convenience: open (or reuse) the customer↔vendor thread from a vendor's
 * storefront, without an order in context yet (e.g. a pre-sale question). */
export async function conversationForVendor(userId: string, vendorId: string) {
  const vendor = await prisma.vendorProfile.findUnique({ where: { id: vendorId }, select: { userId: true } });
  if (!vendor) throw new AppError("NOT_FOUND", "Vendor not found");
  const convo = await getOrCreateConversation({
    kind: "CUSTOMER_VENDOR",
    subjectType: "VENDOR",
    subjectId: vendorId,
    participants: [
      { userId, role: "CUSTOMER" },
      { userId: vendor.userId, role: "VENDOR" },
    ],
  });
  return { conversationId: convo.id };
}

/** Convenience: open (or reuse) the customer↔courier thread for a delivery. */
export async function conversationForDelivery(userId: string, deliveryId: string) {
  const d = await prisma.delivery.findUnique({ where: { id: deliveryId }, include: { courier: { select: { userId: true } } } });
  if (!d || (d.customerId !== userId && d.courier?.userId !== userId)) throw new AppError("NOT_FOUND", "Delivery not found");
  if (!d.courier?.userId || !d.customerId) throw new AppError("CONFLICT", "No counterparty to message yet");
  const convo = await getOrCreateConversation({
    kind: "CUSTOMER_COURIER",
    subjectType: "DELIVERY",
    subjectId: deliveryId,
    participants: [
      { userId: d.customerId, role: "CUSTOMER" },
      { userId: d.courier.userId, role: "COURIER" },
    ],
  });
  return { conversationId: convo.id };
}
