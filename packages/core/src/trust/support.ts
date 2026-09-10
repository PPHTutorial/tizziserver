/**
 * Support — help centre / FAQ, support categories, tickets (each backed by a
 * SUPPORT `Conversation` so the user can chat with an agent).
 */
import { prisma, type SupportPriority, type SupportStatus } from "@stall/db";
import { AppError } from "../errors.ts";
import { randomToken } from "../crypto.ts";
import { getOrCreateConversation, sendMessage } from "../comms/chat.ts";

function ticketNumber(): string {
  const d = new Date();
  const ymd = `${d.getFullYear().toString().slice(2)}${`${d.getMonth() + 1}`.padStart(2, "0")}${`${d.getDate()}`.padStart(2, "0")}`;
  return `SUP-${ymd}-${randomToken(3).replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 5).padEnd(5, "0")}`;
}

const DEFAULT_FAQ = [
  { category: "Orders", q: "Where is my order?", a: "Open the order and tap 'Track delivery' for a live map and ETA. Support can help if a courier is delayed." },
  { category: "Payments", q: "My payment failed — was I charged?", a: "Failed payments are never captured. If your wallet shows a debit without an order, it auto-reverses within minutes; open a Payment dispute if it doesn't." },
  { category: "Wallet", q: "How do withdrawals work?", a: "Withdrawals are PIN-gated and settle to your linked bank/MoMo account. Processing is typically same day." },
  { category: "Deliveries", q: "The courier can't find me", a: "Message the courier in-app, or update your drop-off pin. If a delivery fails you can reschedule from the tracking screen." },
  { category: "Inverse Draws", q: "Does buying more seats guarantee a win?", a: "No. Seats and qualification only weight your odds in the audited draw — they never guarantee selection." },
];

export async function helpCenter() {
  const cfg = await prisma.appConfig.findFirst({ where: { key: "support.faq" } });
  const faq = Array.isArray(cfg?.value) ? (cfg!.value as { category: string; q: string; a: string }[]) : DEFAULT_FAQ;
  const categories = [...new Set(faq.map((f) => f.category))];
  return { categories, faq };
}

export interface CreateTicketInput {
  category: string;
  subject: string;
  body: string;
  priority?: SupportPriority;
}

export async function createSupportTicket(userId: string, input: CreateTicketInput) {
  const convo = await getOrCreateConversation({
    kind: "SUPPORT",
    subjectType: "SUPPORT_TICKET",
    subjectId: `pending-${userId}-${Date.now()}`,
    participants: [{ userId, role: "CUSTOMER" }],
  });
  const ticket = await prisma.supportTicket.create({
    data: {
      number: ticketNumber(),
      userId,
      category: input.category,
      subject: input.subject,
      body: input.body,
      priority: input.priority ?? "NORMAL",
      conversationId: convo.id,
    },
  });
  await prisma.conversation.update({ where: { id: convo.id }, data: { subjectId: ticket.id } });
  await sendMessage(userId, convo.id, { kind: "TEXT", body: `[${ticket.number}] ${input.subject}\n\n${input.body}` }).catch(() => {});
  return { id: ticket.id, number: ticket.number, status: ticket.status, conversationId: convo.id };
}

export async function listSupportTickets(userId: string) {
  const rows = await prisma.supportTicket.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
  return {
    items: rows.map((t) => ({
      id: t.id,
      number: t.number,
      category: t.category,
      subject: t.subject,
      priority: t.priority,
      status: t.status,
      conversationId: t.conversationId,
      createdAt: t.createdAt.toISOString(),
    })),
  };
}

export async function getSupportTicket(userId: string, id: string) {
  const t = await prisma.supportTicket.findFirst({ where: { id, userId } });
  if (!t) throw new AppError("NOT_FOUND", "Ticket not found");
  return {
    id: t.id,
    number: t.number,
    category: t.category,
    subject: t.subject,
    body: t.body,
    priority: t.priority,
    status: t.status,
    conversationId: t.conversationId,
    createdAt: t.createdAt.toISOString(),
  };
}

// --- STAFF ---------------------------------------------------------

export async function listStaffTickets(opts: { status?: SupportStatus } = {}) {
  const rows = await prisma.supportTicket.findMany({
    where: opts.status ? { status: opts.status } : { status: { notIn: ["RESOLVED", "CLOSED"] } },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    include: { user: { select: { firstName: true, phone: true } } },
  });
  return { items: rows.map((t) => ({ id: t.id, number: t.number, subject: t.subject, priority: t.priority, status: t.status, user: t.user.firstName ?? t.user.phone, createdAt: t.createdAt.toISOString() })) };
}

export async function assignSupportTicket(staffId: string, ticketId: string) {
  const t = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
  if (!t) throw new AppError("NOT_FOUND", "Ticket not found");
  if (t.conversationId) {
    await prisma.conversationParticipant.upsert({
      where: { conversationId_userId: { conversationId: t.conversationId, userId: staffId } },
      create: { conversationId: t.conversationId, userId: staffId, role: "SUPPORT" },
      update: {},
    });
  }
  await prisma.supportTicket.update({ where: { id: ticketId }, data: { assigneeId: staffId, status: "PENDING" } });
  return { assigned: true };
}

export async function setSupportTicketStatus(_staffId: string, ticketId: string, status: SupportStatus) {
  await prisma.supportTicket.update({ where: { id: ticketId }, data: { status } });
  return { status };
}
