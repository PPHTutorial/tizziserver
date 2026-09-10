import { admin } from "@stall/core";
import { requireAdmin } from "@/src/admin/session";
import { PageTitle, Card, Table, Badge, Empty, dt, input, btnGhost } from "../_ui";
import { applySafetyAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function Users({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireAdmin();
  const { q = "" } = await searchParams;
  const { items } = await admin.findUsers(q, 30);

  return (
    <>
      <PageTitle sub="Search by phone, email or name. Safety actions log out the account everywhere.">Users</PageTitle>

      <Card>
        <form className="flex gap-2 mb-4">
          <input name="q" defaultValue={q} placeholder="Search users…" className={input} />
          <button className={btnGhost}>Search</button>
        </form>
        {items.length === 0 ? <Empty>No matches.</Empty> : (
          <Table head={["Name", "Phone", "Email", "Status", "Roles", "Joined", "Action"]}>
            {items.map((u) => (
              <tr key={u.id}>
                <td className="py-2 pr-4">{u.name}</td>
                <td className="py-2 pr-4 font-mono text-xs">{u.phone}</td>
                <td className="py-2 pr-4 text-xs">{u.email ?? "—"}</td>
                <td className="py-2 pr-4"><Badge tone={u.status === "ACTIVE" ? "green" : "red"}>{u.status}</Badge></td>
                <td className="py-2 pr-4 text-xs">{u.roles.join(", ")}</td>
                <td className="py-2 pr-4 text-neutral-500">{dt(u.createdAt)}</td>
                <td className="py-2">
                  <form action={applySafetyAction} className="flex items-center gap-1">
                    <input type="hidden" name="userId" value={u.id} />
                    <input name="reason" placeholder="reason" className={input + " !w-24"} />
                    <select name="action" className={input + " !w-24"}><option>SUSPEND</option><option>BAN</option><option>CLEAR</option><option>WARN</option></select>
                    <button className={btnGhost + " !px-2 !py-0.5 text-xs"}>Apply</button>
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
