import { trust } from "@stall/core";
import { requireAdmin } from "@/src/admin/session";
import { PageTitle, Card, Table, Badge, Empty, money, dt } from "../_ui";

export const dynamic = "force-dynamic";

const tone = (s: string) => (s === "RESOLVED" ? "green" : s === "APPEALED" ? "red" : s === "UNDER_REVIEW" ? "blue" : "amber");

export default async function Disputes() {
  await requireAdmin();
  const { items } = await trust.listStaffDisputes();

  return (
    <>
      <PageTitle sub={`${items.length} open`}>Dispute desk</PageTitle>
      <Card>
        {items.length === 0 ? (
          <Empty>No open disputes.</Empty>
        ) : (
          <Table head={["Kind", "Category", "Status", "SLA due", "Refund", "Opened", ""]}>
            {items.map((d) => (
              <tr key={d.id}>
                <td className="py-2 pr-4"><Badge tone="blue">{d.kind}</Badge></td>
                <td className="py-2 pr-4">{d.category}</td>
                <td className="py-2 pr-4"><Badge tone={tone(d.status)}>{d.status}</Badge></td>
                <td className="py-2 pr-4 text-neutral-500">{dt(d.slaDueAt)}</td>
                <td className="py-2 pr-4 tabular-nums">{money(d.refundMinor)}</td>
                <td className="py-2 pr-4 text-neutral-500">{dt(d.createdAt)}</td>
                <td className="py-2"><a className="text-blue-600 hover:underline" href={`/admin/disputes/${d.id}`}>Open →</a></td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
