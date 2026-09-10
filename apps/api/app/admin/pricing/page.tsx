import { admin } from "@stall/core";
import { requireAdmin } from "@/src/admin/session";
import { PageTitle, Card, Table, input, btn } from "../_ui";
import { savePricingRule, saveFeeSchedule } from "../actions";

export const dynamic = "force-dynamic";

export default async function Pricing() {
  await requireAdmin();
  const { rules, fees } = await admin.listPricing();

  return (
    <>
      <PageTitle sub="Delivery / service-fee / surge / tax rules and vendor + courier fee schedules.">Pricing &amp; fees</PageTitle>

      <Card title={`Pricing rules (${rules.length})`}>
        <Table head={["Scope", "Platform", "Priority", "Params"]}>
          {rules.map((r) => (
            <tr key={r.id}>
              <td className="py-2 pr-4">{r.scope}</td>
              <td className="py-2 pr-4">{r.platformSlug ?? "—"}</td>
              <td className="py-2 pr-4">{r.priority}</td>
              <td className="py-2 pr-4 font-mono text-xs break-all">{JSON.stringify(r.params)}</td>
            </tr>
          ))}
        </Table>
        <form action={savePricingRule} className="grid md:grid-cols-4 gap-2 text-sm mt-4">
          <input name="id" placeholder="id (blank = new)" className={input} />
          <select name="scope" className={input}><option>DELIVERY</option><option>SERVICE_FEE</option><option>BOOST</option><option>SURGE</option><option>TAX</option></select>
          <input name="platformSlug" placeholder="platform (optional)" className={input} />
          <input name="priority" type="number" defaultValue={0} className={input} />
          <input name="params" placeholder='{"baseMinor":800,"perKmMinor":150}' className={input + " md:col-span-3"} />
          <button className={btn}>Save rule</button>
        </form>
      </Card>

      <Card title={`Fee schedules (${fees.length})`}>
        <Table head={["Party", "Kind", "Platform", "Params"]}>
          {fees.map((f) => (
            <tr key={f.id}>
              <td className="py-2 pr-4">{f.party}</td>
              <td className="py-2 pr-4">{f.kind}</td>
              <td className="py-2 pr-4">{f.platformSlug ?? "—"}</td>
              <td className="py-2 pr-4 font-mono text-xs break-all">{JSON.stringify(f.params)}</td>
            </tr>
          ))}
        </Table>
        <form action={saveFeeSchedule} className="grid md:grid-cols-4 gap-2 text-sm mt-4">
          <input name="id" placeholder="id (blank = new)" className={input} />
          <select name="party" className={input}><option>VENDOR</option><option>COURIER</option></select>
          <select name="kind" className={input}><option>COMMISSION</option><option>PAYOUT</option><option>LISTING</option><option>WITHDRAWAL</option></select>
          <input name="platformSlug" placeholder="platform (optional)" className={input} />
          <input name="params" placeholder='{"percent":15}' className={input + " md:col-span-3"} />
          <button className={btn}>Save fee</button>
        </form>
      </Card>
    </>
  );
}
