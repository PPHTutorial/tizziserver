import { analytics } from "@stall/core";
import { requireAdmin } from "@/src/admin/session";
import { PageTitle, Card, Stat, money } from "../_ui";

export const dynamic = "force-dynamic";

export default async function Analytics({ searchParams }: { searchParams: Promise<{ days?: string; platform?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const days = Number(sp.days ?? 30);
  const platform = sp.platform ?? "grandprice";
  const a = await analytics.platformAnalytics(platform, { days });
  const max = Math.max(1, ...a.gmvSeries.map((p) => p.value));

  return (
    <>
      <PageTitle sub={`${platform} · ${a.range.days} days`}>Platform analytics</PageTitle>

      <div className="flex gap-2 mb-4 text-sm">
        {[7, 30, 90].map((d) => (
          <a key={d} href={`/admin/analytics?days=${d}&platform=${platform}`} className={`px-3 py-1 rounded border ${days === d ? "bg-neutral-900 text-white" : "border-neutral-300"}`}>{d}d</a>
        ))}
        {["grandprice", "tizzi-gas"].map((p) => (
          <a key={p} href={`/admin/analytics?days=${days}&platform=${p}`} className={`px-3 py-1 rounded border ${platform === p ? "bg-neutral-900 text-white" : "border-neutral-300"}`}>{p}</a>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <Stat label="GMV" value={money(a.kpis.gmvMinor)} />
        <Stat label="Orders" value={a.kpis.orderCount.toLocaleString()} />
        <Stat label="Buyers" value={a.kpis.buyers.toLocaleString()} />
        <Stat label="New users" value={a.kpis.newUsers.toLocaleString()} />
        <Stat label="Active vendors" value={a.kpis.activeVendors.toLocaleString()} />
        <Stat label="Deliveries done" value={a.kpis.deliveriesCompleted.toLocaleString()} />
        <Stat label="Ad spend" value={money(a.kpis.adSpendMinor)} />
        <Stat label="Draws" value={a.kpis.draws.toLocaleString()} />
      </div>

      <Card title="GMV by day">
        <div className="flex items-end gap-0.5 h-40">
          {a.gmvSeries.map((p) => (
            <div key={p.day} className="flex-1 bg-blue-500/70 rounded-t" style={{ height: `${(p.value / max) * 100}%` }} title={`${p.day}: ${money(p.value)}`} />
          ))}
        </div>
      </Card>
    </>
  );
}
