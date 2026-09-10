import { prisma } from "@stall/db";
import { requireAdmin } from "@/src/admin/session";
import { PageTitle, Card, Table, Badge, Empty, money, dt, btn, btnGhost } from "../_ui";
import { commitDraw, runDraw } from "../actions";

export const dynamic = "force-dynamic";

export default async function Draws() {
  await requireAdmin();
  const auctions = await prisma.auction.findMany({
    where: { type: "SEAT_DRAW" },
    orderBy: { createdAt: "desc" },
    take: 30,
    include: { draw: { include: { winners: { include: { participant: { select: { userId: true } } } }, backups: true } } },
  });

  return (
    <>
      <PageTitle sub="Commit-reveal supervision. The seed hash is published at commit; the seed is revealed only after the draw runs.">Draw supervision</PageTitle>
      {auctions.length === 0 ? (
        <Card><Empty>No seat-draw auctions.</Empty></Card>
      ) : (
        auctions.map((a) => (
          <Card key={a.id} title={`${a.title} · ${a.slug}`} actions={<Badge tone={a.status === "COMPLETED" ? "green" : "amber"}>{a.status}</Badge>}>
            <div className="text-sm grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
              <div><span className="text-xs text-neutral-500 block">Seats</span>{a.seatsSold}/{a.seatsTotal}</div>
              <div><span className="text-xs text-neutral-500 block">Win target</span>{money(a.winTargetMinor, a.currency)}</div>
              <div><span className="text-xs text-neutral-500 block">Draw at</span>{dt(a.drawAt?.toISOString())}</div>
              <div><span className="text-xs text-neutral-500 block">Draw state</span>{a.draw ? (a.draw.completedAt ? "completed" : "committed") : "—"}</div>
            </div>

            {a.draw && (
              <div className="text-xs text-neutral-600 mb-3 font-mono break-all">
                commit: {a.draw.seedCommitHash}
                {a.draw.resultHash ? <><br />result: {a.draw.resultHash}</> : null}
                {a.draw.seedReveal && a.draw.completedAt ? <><br />seed: {a.draw.seedReveal}</> : null}
              </div>
            )}

            {a.draw?.winners.length ? (
              <Table head={["Winner", "Position", "Status"]}>
                {a.draw.winners.map((w) => (
                  <tr key={w.id}><td className="py-1 pr-4 font-mono text-xs">{w.participant.userId.slice(0, 12)}</td><td className="py-1 pr-4">{w.position}</td><td className="py-1"><Badge tone="green">{w.status}</Badge></td></tr>
                ))}
              </Table>
            ) : null}

            <div className="flex gap-2 mt-3">
              {!a.draw && (
                <form action={commitDraw}><input type="hidden" name="auctionId" value={a.id} /><button className={btnGhost}>Commit seed</button></form>
              )}
              {a.draw && !a.draw.completedAt && (
                <form action={runDraw}><input type="hidden" name="auctionId" value={a.id} /><button className={btn}>Run draw</button></form>
              )}
            </div>
          </Card>
        ))
      )}
    </>
  );
}
