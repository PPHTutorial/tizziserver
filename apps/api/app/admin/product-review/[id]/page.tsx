import { catalog } from "@stall/core";
import { requireAdmin } from "@/src/admin/session";
import { PageTitle, Card, Badge, input, btn, btnGhost, dt, money } from "../../_ui";
import { reviewProduct } from "../../actions";

export const dynamic = "force-dynamic";

export default async function ProductReviewDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const p = await catalog.getProductForReview(id);

  return (
    <>
      <PageTitle sub={`${p.vendorName} · ${p.category} · ${p.status}`}>{p.title}</PageTitle>

      <Card title="Listing">
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <dt className="text-xs text-neutral-500">Brand</dt>
            <dd>{p.brand ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-neutral-500">Condition</dt>
            <dd>{p.condition}</dd>
          </div>
          <div>
            <dt className="text-xs text-neutral-500">Price</dt>
            <dd>{money(p.priceMinor, p.currency)}</dd>
          </div>
          <div>
            <dt className="text-xs text-neutral-500">Submitted</dt>
            <dd>{dt(p.submittedAt)}</dd>
          </div>
        </dl>
        <p className="text-sm whitespace-pre-wrap mt-3">{p.description}</p>
      </Card>

      <Card title={`Media (${p.media.length})`}>
        {p.media.length === 0 ? (
          <p className="text-sm text-neutral-400">No media uploaded.</p>
        ) : (
          <ul className="text-sm space-y-1">
            {p.media.map((m) => (
              <li key={m.id} className="flex items-center gap-2">
                <Badge tone={m.kind === "VIDEO" ? "blue" : "gray"}>{m.kind}</Badge>
                <span className="text-neutral-500 text-xs">{m.fileKey}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {p.status === "PENDING_REVIEW" && (
        <Card title="Decision">
          <form action={reviewProduct} className="space-y-3">
            <input type="hidden" name="id" value={p.id} />
            <textarea name="note" placeholder="Reviewer note (optional)" className={input} rows={2} />
            <div className="flex gap-2">
              <button name="decision" value="APPROVE" className={btn}>Approve</button>
              <button name="decision" value="REJECT" className={btnGhost}>Reject</button>
            </div>
          </form>
        </Card>
      )}
    </>
  );
}
