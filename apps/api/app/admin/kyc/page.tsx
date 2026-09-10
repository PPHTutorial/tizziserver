import { trust } from "@stall/core";
import { requireAdmin } from "@/src/admin/session";
import { PageTitle, Card, Table, Badge, Empty, dt } from "../_ui";

export const dynamic = "force-dynamic";

export default async function KycQueue() {
  await requireAdmin();
  const { items } = await trust.listKycQueue();

  return (
    <>
      <PageTitle sub={`${items.length} awaiting review`}>KYC queue</PageTitle>
      <Card>
        {items.length === 0 ? (
          <Empty>Nothing in the queue.</Empty>
        ) : (
          <Table head={["Subject", "Level", "Docs", "Liveness", "Submitted", ""]}>
            {items.map((k) => (
              <tr key={k.id}>
                <td className="py-2 pr-4">
                  <Badge tone="blue">{k.subjectType}</Badge> <span className="text-neutral-500 text-xs">{k.subjectId.slice(0, 10)}</span>
                </td>
                <td className="py-2 pr-4">{k.level}</td>
                <td className="py-2 pr-4">{k.documents.length}</td>
                <td className="py-2 pr-4">{k.liveness.some((l) => l.passed) ? <Badge tone="green">passed</Badge> : <Badge>n/a</Badge>}</td>
                <td className="py-2 pr-4 text-neutral-500">{dt(k.submittedAt)}</td>
                <td className="py-2"><a className="text-blue-600 hover:underline" href={`/admin/kyc/${k.id}`}>Review →</a></td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
