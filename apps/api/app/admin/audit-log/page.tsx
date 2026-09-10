import { admin } from "@stall/core";
import { requireAdmin } from "@/src/admin/session";
import { PageTitle, Card, Table, Empty, dt, input, btnGhost } from "../_ui";

export const dynamic = "force-dynamic";

export default async function AuditLog({ searchParams }: { searchParams: Promise<{ action?: string; cursor?: string }> }) {
  await requireAdmin();
  const { action = "", cursor } = await searchParams;
  const { items, nextCursor } = await admin.auditLog({ action: action || undefined, cursor, limit: 100 });

  return (
    <>
      <PageTitle sub="Sensitive actions across the platform, newest first.">Audit log</PageTitle>
      <Card>
        <form className="flex gap-2 mb-4">
          <input name="action" defaultValue={action} placeholder="filter by action (e.g. kyc.review)" className={input} />
          <button className={btnGhost}>Filter</button>
        </form>
        {items.length === 0 ? <Empty>Nothing logged.</Empty> : (
          <Table head={["When", "Actor", "Action", "Target", "IP"]}>
            {items.map((r) => (
              <tr key={r.id}>
                <td className="py-1.5 pr-4 text-neutral-500 whitespace-nowrap">{dt(r.at)}</td>
                <td className="py-1.5 pr-4 font-mono text-xs">{r.actorId?.slice(0, 12) ?? r.actorType}</td>
                <td className="py-1.5 pr-4">{r.action}</td>
                <td className="py-1.5 pr-4 text-xs">{r.targetType ? `${r.targetType}:${r.targetId?.slice(0, 10)}` : "—"}</td>
                <td className="py-1.5 pr-4 text-xs text-neutral-400">{r.ip ?? "—"}</td>
              </tr>
            ))}
          </Table>
        )}
        {nextCursor ? (
          <a className="text-blue-600 hover:underline text-sm mt-3 inline-block" href={`/admin/audit-log?action=${action}&cursor=${nextCursor}`}>Next page →</a>
        ) : null}
      </Card>
    </>
  );
}
