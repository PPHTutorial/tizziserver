import { ads } from "@stall/core";
import { requireAdmin } from "@/src/admin/session";
import { PageTitle, Card, Table, Badge, money, input, btn, btnGhost } from "../_ui";
import { saveBoostTier, deactivateBoostTier } from "../actions";

export const dynamic = "force-dynamic";

const SLOTS = ["HOME_RAIL", "SEARCH_TOP", "CATEGORY_TOP", "PRODUCT_RELATED", "CHECKOUT_CROSS_SELL"];

export default async function BoostTiers() {
  await requireAdmin();
  const { items } = await ads.listAllBoostTiers();

  return (
    <>
      <PageTitle sub="Backend-editable — no tier is hardcoded in the app or the ranker.">Boost tiers</PageTitle>

      <Card title={`Tiers (${items.length})`}>
        <Table head={["Key", "Name", "Billing", "Price", "Rank ×", "Placements", "State", ""]}>
          {items.map((t) => (
            <tr key={t.id}>
              <td className="py-2 pr-4 font-mono text-xs">{t.key}</td>
              <td className="py-2 pr-4">{t.name} {t.badge ? <Badge tone="blue">{t.badge}</Badge> : null}</td>
              <td className="py-2 pr-4">{t.billingModel}</td>
              <td className="py-2 pr-4 tabular-nums">{money(t.priceMinor)}</td>
              <td className="py-2 pr-4 tabular-nums">{(t.rankBoostBps / 10000).toFixed(2)}×</td>
              <td className="py-2 pr-4 text-xs">{t.placements.join(", ")}</td>
              <td className="py-2 pr-4">{t.isActive ? <Badge tone="green">active</Badge> : <Badge>inactive</Badge>}</td>
              <td className="py-2">
                {t.isActive && (
                  <form action={deactivateBoostTier}>
                    <input type="hidden" name="key" value={t.key} />
                    <button className={btnGhost + " !px-2 !py-0.5 text-xs"}>Disable</button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </Card>

      <Card title="Create / update a tier">
        <form action={saveBoostTier} className="grid md:grid-cols-2 gap-3 text-sm">
          <label>Key<input name="key" className={input} placeholder="premium" required /></label>
          <label>Name<input name="name" className={input} placeholder="Premium" required /></label>
          <label className="md:col-span-2">Description<input name="description" className={input} /></label>
          <label>Platform slugs (comma)<input name="platformSlugs" className={input} placeholder="grandprice,tizzi-gas" required /></label>
          <label>Badge<input name="badge" className={input} placeholder="Sponsored" /></label>
          <label>Billing model
            <select name="billingModel" className={input}><option>CPM</option><option>CPC</option><option>FLAT_DAILY</option></select>
          </label>
          <label>Price (minor units)<input name="priceMinor" type="number" min="0" className={input} required /></label>
          <label>Rank boost (bps, ≥10000)<input name="rankBoostBps" type="number" min="10000" defaultValue={12000} className={input} /></label>
          <label>Sort order<input name="sortOrder" type="number" defaultValue={0} className={input} /></label>
          <fieldset className="md:col-span-2">
            <legend className="text-xs text-neutral-500 mb-1">Placements</legend>
            <div className="flex flex-wrap gap-3">
              {SLOTS.map((s) => (
                <label key={s} className="flex items-center gap-1 text-xs"><input type="checkbox" name="placements" value={s} /> {s}</label>
              ))}
            </div>
          </fieldset>
          <label className="flex items-center gap-2"><input type="checkbox" name="isActive" defaultChecked /> Active</label>
          <div className="md:col-span-2"><button className={btn}>Save tier</button></div>
        </form>
      </Card>
    </>
  );
}
