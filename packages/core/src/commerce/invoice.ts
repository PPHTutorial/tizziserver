/**
 * Invoice PDF generation. `Invoice` rows are created (`lines` = the fee
 * breakdown JSON) by `completeVendorOrder` in `./orders.ts`; this module
 * renders and stores the actual PDF, filling in `pdfKey`.
 */
import PDFDocument from "pdfkit";
import { prisma } from "@stall/db";
import { AppError } from "../errors.ts";
import { storageProvider } from "../storage/index.ts";

const money = (minor: number, currency = "GHS") => `${currency} ${(minor / 100).toFixed(2)}`;

function renderInvoicePdf(order: {
  number: string;
  currency: string;
  placedAt: Date | null;
  createdAt: Date;
  itemsSubtotalMinor: number;
  discountMinor: number;
  deliveryFeeMinor: number;
  serviceFeeMinor: number;
  taxMinor: number;
  totalMinor: number;
  customer: { firstName: string | null; lastName: string | null; phone: string; email: string | null };
  vendorOrders: {
    number: string;
    vendor: { displayName: string };
    items: { titleSnapshot: string; qty: number; unitPriceMinor: number; totalMinor: number }[];
  }[];
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const cur = order.currency;
    const customerName = [order.customer.firstName, order.customer.lastName].filter(Boolean).join(" ") || order.customer.phone;

    doc.fontSize(20).text("Invoice", { continued: false });
    doc.fontSize(10).fillColor("#555").text(`Order ${order.number}`);
    doc.text(`Issued ${(order.placedAt ?? order.createdAt).toISOString().slice(0, 10)}`);
    doc.moveDown();
    doc.fillColor("#000").fontSize(11).text(`Billed to: ${customerName}`);
    if (order.customer.email) doc.fontSize(9).fillColor("#555").text(order.customer.email);
    doc.moveDown();

    for (const vo of order.vendorOrders) {
      doc.fillColor("#000").fontSize(12).text(`${vo.vendor.displayName} — ${vo.number}`, { underline: true });
      doc.moveDown(0.3);
      for (const it of vo.items) {
        doc
          .fontSize(10)
          .fillColor("#000")
          .text(`${it.qty}× ${it.titleSnapshot}`, { continued: true, width: 350 })
          .text(money(it.totalMinor, cur), { align: "right" });
      }
      doc.moveDown();
    }

    const row = (label: string, amountMinor: number) =>
      doc.fontSize(10).text(label, { continued: true, width: 400 }).text(money(amountMinor, cur), { align: "right" });

    doc.moveDown(0.5);
    row("Subtotal", order.itemsSubtotalMinor);
    if (order.discountMinor > 0) row("Discount", -order.discountMinor);
    row("Delivery", order.deliveryFeeMinor);
    row("Service fee", order.serviceFeeMinor);
    if (order.taxMinor > 0) row("Tax", order.taxMinor);
    doc.moveDown(0.3);
    doc.fontSize(13).text("Total", { continued: true, width: 400 }).text(money(order.totalMinor, cur), { align: "right" });

    doc.end();
  });
}

/** Render the invoice PDF and store it, filling in `Invoice.pdfKey`. */
export async function generateInvoicePdf(orderId: string): Promise<{ pdfKey: string }> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      customer: { select: { firstName: true, lastName: true, phone: true, email: true } },
      vendorOrders: { include: { items: true, vendor: { select: { displayName: true } } } },
      invoice: true,
    },
  });
  if (!order) throw new AppError("NOT_FOUND", "Order not found");
  if (!order.invoice) throw new AppError("CONFLICT", "This order has no invoice yet");

  const buffer = await renderInvoicePdf(order);
  const pdfKey = `invoices/${order.invoice.number}.pdf`;
  await storageProvider().putObject(pdfKey, buffer, "application/pdf");
  await prisma.invoice.update({ where: { id: order.invoice.id }, data: { pdfKey } });
  return { pdfKey };
}

/**
 * Ownership-checked invoice fetch for download. Lazily generates the PDF if
 * `completeVendorOrder`'s best-effort generation hasn't run yet (or failed).
 */
export async function getInvoicePdf(userId: string, orderId: string): Promise<{ buffer: Buffer; filename: string }> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, customerId: userId },
    include: { invoice: true },
  });
  if (!order) throw new AppError("NOT_FOUND", "Order not found");
  if (!order.invoice) throw new AppError("CONFLICT", "This order has no invoice yet — it isn't fully fulfilled");

  const pdfKey = order.invoice.pdfKey ?? (await generateInvoicePdf(order.id)).pdfKey;
  const { body } = await storageProvider().getObject(pdfKey);
  return { buffer: body, filename: `${order.invoice.number}.pdf` };
}
