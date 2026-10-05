import { commerce } from "@stall/core";
import { requireAdmin } from "@/src/admin/session";
import { markPayoutPaid, failPayout } from "../actions";
import { PageTitle, Card, Table, Empty, Badge, money, dt, input, btn, btnGhost } from "../_ui";

export const dynamic = "force-dynamic";

/**
 * Manual payout queue. Send the money by MoMo/bank first, then "Mark paid"
 * with the transfer reference. "Fail" returns the funds to the owner's
 * balance (ADMIN only).
 */
export default async function PayoutsQueue() {
  await requireAdmin();
  const items = await commerce.listOpenPayouts();
  const total = items.reduce((sum, p) => sum + p.amountMinor, 0);

  return (
    <>
      <PageTitle sub={`${items.length} open · ${money(total)} to send`}>Payouts</PageTitle>
      <Card>
        {items.length === 0 ? (
          <Empty>No payouts waiting.</Empty>
        ) : (
          <Table head={["Requested", "Owner", "Amount", "Account", "Settle"]}>
            {items.map((p) => (
              <tr key={p.id} className="align-top">
                <td className="py-2 pr-4 text-neutral-500">{dt(p.createdAt)}</td>
                <td className="py-2 pr-4">
                  <Badge tone={p.ownerType === "VENDOR" ? "blue" : "gray"}>{p.ownerType}</Badge> {p.ownerName}
                  <div className="text-xs text-neutral-500">{p.ownerPhone ?? "—"}</div>
                </td>
                <td className="py-2 pr-4 font-medium">{money(p.amountMinor, p.currency)}</td>
                <td className="py-2 pr-4 text-xs text-neutral-500">{p.note ?? "default account"}</td>
                <td className="py-2 space-y-2 min-w-64">
                  <form action={markPayoutPaid} className="flex gap-2">
                    <input type="hidden" name="payoutId" value={p.id} />
                    <input name="transferRef" required minLength={3} placeholder="Transfer ref" className={input} />
                    <button className={btn}>Mark paid</button>
                  </form>
                  <form action={failPayout} className="flex gap-2">
                    <input type="hidden" name="payoutId" value={p.id} />
                    <input name="reason" required placeholder="Why it failed" className={input} />
                    <button className={btnGhost}>Fail &amp; refund</button>
                  </form>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
