import { ads } from "@stall/core";
import { requireAdmin } from "@/src/admin/session";
import { PageTitle, Card, Table, Empty, money, dt, input, btn, btnGhost } from "../_ui";
import { reviewCampaign } from "../actions";

export const dynamic = "force-dynamic";

export default async function CampaignReview() {
  await requireAdmin();
  const { items } = await ads.listReviewQueue();

  return (
    <>
      <PageTitle sub={`${items.length} awaiting review`}>Ad campaign review</PageTitle>
      <Card>
        {items.length === 0 ? (
          <Empty>No campaigns awaiting review.</Empty>
        ) : (
          <Table head={["Campaign", "Vendor", "Objective", "Budget", "Tier", "Products", "Submitted", "Decision"]}>
            {items.map((c) => (
              <tr key={c.id}>
                <td className="py-2 pr-4 font-medium">{c.name}</td>
                <td className="py-2 pr-4">{c.vendor}</td>
                <td className="py-2 pr-4 text-xs">{c.objective}</td>
                <td className="py-2 pr-4 tabular-nums">{money(c.budgetMinor)}</td>
                <td className="py-2 pr-4">{c.tier ?? "—"}</td>
                <td className="py-2 pr-4">{c.products}</td>
                <td className="py-2 pr-4 text-neutral-500">{dt(c.submittedAt)}</td>
                <td className="py-2">
                  <form action={reviewCampaign} className="flex items-center gap-1">
                    <input type="hidden" name="id" value={c.id} />
                    <input name="reason" placeholder="reason" className={input + " !w-28"} />
                    <button name="approve" value="1" className={btn + " !px-2"}>✓</button>
                    <button name="approve" value="0" className={btnGhost + " !px-2"}>✗</button>
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
