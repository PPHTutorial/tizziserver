import { admin } from "@stall/core";
import { requireAdmin } from "@/src/admin/session";
import { PageTitle, Card, Table, Badge, Empty, dt, input, btn } from "../_ui";
import { composeBroadcast, sendBroadcast } from "../actions";

export const dynamic = "force-dynamic";

export default async function Broadcasts() {
  await requireAdmin();
  const { items } = await admin.listBroadcasts();

  return (
    <>
      <PageTitle sub="Push a notification to a segment. Respects each recipient notification preference.">Broadcasts</PageTitle>

      <Card title="Compose">
        <form action={composeBroadcast} className="grid md:grid-cols-2 gap-3 text-sm">
          <label className="md:col-span-2">Title<input name="title" className={input} required /></label>
          <label className="md:col-span-2">Body<textarea name="body" className={input} rows={3} required /></label>
          <label>{"Roles (comma, blank = everyone)"}<input name="roles" className={input} placeholder="CUSTOMER,VENDOR" /></label>
          <label className="flex items-center gap-2 mt-5"><input type="checkbox" name="hasOrdered" /> {"Only users who have ordered"}</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="sendNow" /> Send immediately</label>
          <div className="md:col-span-2"><button className={btn}>Create broadcast</button></div>
        </form>
      </Card>

      <Card title={`History (${items.length})`}>
        {items.length === 0 ? <Empty>No broadcasts yet.</Empty> : (
          <Table head={["Title", "Status", "Sent", "Scheduled", "Created", ""]}>
            {items.map((b) => (
              <tr key={b.id}>
                <td className="py-2 pr-4">{b.title}</td>
                <td className="py-2 pr-4"><Badge tone={b.status === "SENT" ? "green" : b.status === "SCHEDULED" ? "blue" : "gray"}>{b.status}</Badge></td>
                <td className="py-2 pr-4">{b.sentCount}</td>
                <td className="py-2 pr-4 text-neutral-500">{dt(b.scheduledFor)}</td>
                <td className="py-2 pr-4 text-neutral-500">{dt(b.at)}</td>
                <td className="py-2">
                  {b.status !== "SENT" && (
                    <form action={sendBroadcast}><input type="hidden" name="id" value={b.id} /><button className="text-blue-600 hover:underline text-xs">Send now</button></form>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
