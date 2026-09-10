import { trust } from "@stall/core";
import { requireAdmin } from "@/src/admin/session";
import { PageTitle, Card, Badge, input, btn, btnGhost, dt, money } from "../../_ui";
import { assignDispute, resolveDispute, messageDispute } from "../../actions";

export const dynamic = "force-dynamic";

export default async function DisputeDetail({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireAdmin();
  const { id } = await params;
  const d = await trust.getDispute(s.userId, id, true);
  const closed = ["RESOLVED", "CLOSED"].includes(d.status);

  return (
    <>
      <PageTitle sub={`${d.kind} · ${d.category} · ${d.status}`}>Dispute {d.id.slice(0, 10)}</PageTitle>

      <Card title="Claim">
        <p className="text-sm whitespace-pre-wrap">{d.body}</p>
        <div className="mt-3 text-xs text-neutral-500 flex gap-4">
          <span>ref: {d.refId}</span>
          <span>SLA: {dt(d.slaDueAt)}</span>
          {d.refundMinor ? <span>refund: {money(d.refundMinor)}</span> : null}
        </div>
      </Card>

      <Card title={`Evidence (${d.evidence.length})`}>
        {d.evidence.length === 0 ? <p className="text-sm text-neutral-400">None.</p> : (
          <ul className="space-y-2 text-sm">
            {d.evidence.map((e, i) => (
              <li key={i} className="border-l-2 border-neutral-200 pl-3">
                <span className="text-xs text-neutral-500">{e.by} · {e.kind} · {dt(e.at)}</span>
                <div>{e.body ?? e.fileKey}</div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Thread">
        <ul className="space-y-2 text-sm mb-3">
          {d.messages.map((m, i) => (
            <li key={i} className="flex gap-2">
              {m.staffOnly ? <Badge tone="amber">internal</Badge> : null}
              <span className="text-xs text-neutral-500 shrink-0">{m.by}</span>
              <span>{m.body}</span>
            </li>
          ))}
          {d.messages.length === 0 ? <li className="text-neutral-400">No messages.</li> : null}
        </ul>
        {!closed && (
          <form action={messageDispute} className="flex gap-2">
            <input type="hidden" name="id" value={d.id} />
            <input name="body" placeholder="Reply to the parties…" className={input} />
            <button className={btnGhost}>Send</button>
          </form>
        )}
      </Card>

      {!closed && (
        <div className="grid md:grid-cols-2 gap-4">
          <Card title="Assign">
            <form action={assignDispute}>
              <input type="hidden" name="id" value={d.id} />
              <button className={btnGhost}>Assign to me</button>
            </form>
          </Card>
          <Card title="Resolve">
            <form action={resolveDispute} className="space-y-2">
              <input type="hidden" name="id" value={d.id} />
              <textarea name="outcome" placeholder="Resolution note" className={input} rows={2} required />
              <input name="refundMinor" type="number" min="0" placeholder="Refund (minor units, optional)" className={input} />
              <button className={btn}>Resolve dispute</button>
            </form>
          </Card>
        </div>
      )}

      {d.appeal ? (
        <Card title="Appeal">
          <Badge tone={d.appeal.status === "UPHELD" ? "green" : d.appeal.status === "DENIED" ? "red" : "amber"}>{d.appeal.status}</Badge>
          <p className="text-sm mt-2">{d.appeal.body}</p>
        </Card>
      ) : null}
    </>
  );
}
