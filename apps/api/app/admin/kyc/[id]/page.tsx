import { trust } from "@stall/core";
import { requireAdmin } from "@/src/admin/session";
import { PageTitle, Card, Badge, input, btn, btnGhost } from "../../_ui";
import { reviewKyc } from "../../actions";

export const dynamic = "force-dynamic";

export default async function KycDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const k = await trust.getKycCase(id);

  return (
    <>
      <PageTitle sub={`${k.subjectType} · ${k.level} · ${k.status}`}>KYC case</PageTitle>

      <Card title="Subject">
        <dl className="grid grid-cols-2 gap-2 text-sm">
          {Object.entries(k.subject).map(([key, val]) => (
            <div key={key}>
              <dt className="text-xs text-neutral-500">{key}</dt>
              <dd>{typeof val === "object" ? JSON.stringify(val) : String(val ?? "—")}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card title={`Documents (${k.documents.length})`}>
        {k.documents.length === 0 ? (
          <p className="text-sm text-neutral-400">No documents uploaded.</p>
        ) : (
          <ul className="text-sm space-y-1">
            {k.documents.map((d) => (
              <li key={d.id} className="flex items-center gap-2">
                <Badge tone={d.status === "APPROVED" ? "green" : d.status === "REJECTED" ? "red" : "amber"}>{d.status}</Badge>
                <span>{d.type}</span>
                <span className="text-neutral-400 text-xs">{d.fileKey}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {["PENDING", "IN_REVIEW"].includes(k.status) && (
        <Card title="Decision">
          <form action={reviewKyc} className="space-y-3">
            <input type="hidden" name="id" value={k.id} />
            <textarea name="note" placeholder="Reviewer note (optional)" className={input} rows={2} />
            <div className="flex gap-2">
              <button name="decision" value="APPROVE" className={btn}>Approve</button>
              <button name="decision" value="REJECT" className={btnGhost}>Reject</button>
              <button name="decision" value="RESUBMIT" className={btnGhost}>Ask to resubmit</button>
            </div>
          </form>
        </Card>
      )}
    </>
  );
}
