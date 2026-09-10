import { admin } from "@stall/core";
import { requireAdmin } from "@/src/admin/session";
import { PageTitle, Card, Table, input, btn } from "../_ui";
import { setFeatureFlag } from "../actions";

export const dynamic = "force-dynamic";

export default async function FeatureFlags() {
  await requireAdmin();
  const { platforms, flags } = await admin.listFeatureMatrix();

  return (
    <>
      <PageTitle sub="Per-platform capability values. Booleans, numbers, and JSON are all accepted.">Feature flags</PageTitle>
      <Card>
        <Table head={["Flag", ...platforms.map((p) => p.slug), "Set"]}>
          {flags.map((f) => (
            <tr key={f.key}>
              <td className="py-2 pr-4">
                <div className="font-mono text-xs">{f.key}</div>
                <div className="text-xs text-neutral-400">{f.description}</div>
              </td>
              {platforms.map((p) => (
                <td key={p.slug} className="py-2 pr-4 font-mono text-xs">{JSON.stringify(f.values[p.slug])}</td>
              ))}
              <td className="py-2">
                <form action={setFeatureFlag} className="flex items-center gap-1">
                  <select name="platformSlug" className={input + " !w-28"}>
                    {platforms.map((p) => <option key={p.slug} value={p.slug}>{p.slug}</option>)}
                  </select>
                  <input type="hidden" name="flagKey" value={f.key} />
                  <input name="value" placeholder="true / 5 / {…}" className={input + " !w-32"} />
                  <button className={btn + " !px-2"}>Set</button>
                </form>
              </td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
