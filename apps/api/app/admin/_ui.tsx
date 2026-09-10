import type { ReactNode } from "react";

export const money = (minor: number | null | undefined, cur = "GHS") =>
  minor == null ? "—" : `${cur} ${(minor / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

export const dt = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString() : "—");

export function PageTitle({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <div className="mb-5">
      <h1 className="text-lg font-semibold tracking-tight">{children}</h1>
      {sub ? <p className="text-sm text-neutral-500 mt-0.5">{sub}</p> : null}
    </div>
  );
}

export function Card({ title, children, actions }: { title?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="bg-white border border-neutral-200 rounded-lg mb-5">
      {(title || actions) && (
        <header className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
          {title ? <h2 className="text-sm font-medium">{title}</h2> : <span />}
          {actions}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="bg-white border border-neutral-200 rounded-lg p-4">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="text-xl font-semibold mt-1 tabular-nums">{value}</div>
    </div>
  );
}

const BADGE: Record<string, string> = {
  green: "bg-green-100 text-green-800",
  red: "bg-red-100 text-red-800",
  amber: "bg-amber-100 text-amber-800",
  blue: "bg-blue-100 text-blue-800",
  gray: "bg-neutral-100 text-neutral-700",
};
export function Badge({ tone = "gray", children }: { tone?: keyof typeof BADGE; children: ReactNode }) {
  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${BADGE[tone]}`}>{children}</span>;
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-neutral-500 border-b border-neutral-200">
            {head.map((h) => (
              <th key={h} className="py-2 pr-4 font-medium whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">{children}</tbody>
      </table>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-neutral-400 py-6 text-center">{children}</p>;
}

export const input = "border border-neutral-300 rounded px-2 py-1.5 text-sm w-full";
export const btn = "bg-neutral-900 text-white text-sm rounded px-3 py-1.5 hover:bg-neutral-700 disabled:opacity-50";
export const btnGhost = "border border-neutral-300 text-sm rounded px-3 py-1.5 hover:bg-neutral-50";
