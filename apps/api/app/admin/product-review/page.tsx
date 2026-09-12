import { catalog } from "@stall/core";
import { requireAdmin } from "@/src/admin/session";
import { PageTitle, Card, Table, Empty, dt } from "../_ui";

export const dynamic = "force-dynamic";

export default async function ProductReviewQueue() {
  await requireAdmin();
  const items = await catalog.listProductsPendingReview();

  return (
    <>
      <PageTitle sub={`${items.length} awaiting review`}>Product review</PageTitle>
      <Card>
        {items.length === 0 ? (
          <Empty>Nothing in the queue.</Empty>
        ) : (
          <Table head={["Vendor", "Product", "Submitted", ""]}>
            {items.map((p) => (
              <tr key={p.id}>
                <td className="py-2 pr-4">{p.vendorName}</td>
                <td className="py-2 pr-4">{p.title}</td>
                <td className="py-2 pr-4 text-neutral-500">{dt(p.submittedAt)}</td>
                <td className="py-2"><a className="text-blue-600 hover:underline" href={`/admin/product-review/${p.id}`}>Review →</a></td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
