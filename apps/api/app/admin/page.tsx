import { admin } from "@stall/core";
import { requireAdmin } from "@/src/admin/session";
import { PageTitle, Card, Stat, money } from "./_ui";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  await requireAdmin();
  const d = await admin.dashboard("grandprice");

  return (
    <>
      <PageTitle sub={`GrandPrice · last ${d.range.days} days`}>Dashboard</PageTitle>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <Stat label="GMV (30d)" value={money(d.kpis.gmvMinor)} />
        <Stat label="Orders" value={d.kpis.orderCount.toLocaleString()} />
        <Stat label="AOV" value={money(d.kpis.aovMinor)} />
        <Stat label="New users" value={d.kpis.newUsers.toLocaleString()} />
        <Stat label="Active vendors" value={d.kpis.activeVendors.toLocaleString()} />
        <Stat label="Deliveries done" value={d.kpis.deliveriesCompleted.toLocaleString()} />
        <Stat label="Delivery completion" value={`${d.kpis.deliveryCompletionRate}%`} />
        <Stat label="Ad spend (30d)" value={money(d.kpis.adSpendMinor)} />
      </div>

      <Card title="Work queues">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <QueueLink href="/admin/kyc" label="KYC to review" n={d.queues.kyc} />
          <QueueLink href="/admin/campaigns" label="Campaigns to review" n={d.queues.campaignReview} />
          <QueueLink href="/admin/disputes" label="Open disputes" n={d.queues.disputesOpen} />
          <QueueLink href="/admin/broadcasts" label="Support open" n={d.queues.supportOpen} />
        </div>
      </Card>

      <Card title="Totals">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Users" value={d.totals.users.toLocaleString()} />
          <Stat label="Vendors" value={d.totals.vendors.toLocaleString()} />
          <Stat label="Couriers" value={d.totals.couriers.toLocaleString()} />
          <Stat label="Live draws" value={d.totals.liveDraws.toLocaleString()} />
        </div>
      </Card>
    </>
  );
}

function QueueLink({ href, label, n }: { href: string; label: string; n: number }) {
  return (
    <a href={href} className="block bg-white border border-neutral-200 rounded-lg p-4 hover:border-neutral-400">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${n > 0 ? "text-amber-600" : "text-neutral-400"}`}>{n}</div>
    </a>
  );
}
