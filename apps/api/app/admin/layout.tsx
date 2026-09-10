import type { ReactNode } from "react";
import { readAdminSession } from "@/src/admin/session";
import { logout } from "./actions";

export const metadata = { title: "Stall Ops Console" };

const NAV: { href: string; label: string }[] = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/kyc", label: "KYC queue" },
  { href: "/admin/disputes", label: "Disputes" },
  { href: "/admin/campaigns", label: "Ad review" },
  { href: "/admin/boost-tiers", label: "Boost tiers" },
  { href: "/admin/draws", label: "Draws" },
  { href: "/admin/broadcasts", label: "Broadcasts" },
  { href: "/admin/feature-flags", label: "Feature flags" },
  { href: "/admin/pricing", label: "Pricing" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/audit-log", label: "Audit log" },
];

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await readAdminSession();

  if (!session) {
    return <div className="min-h-screen bg-neutral-50 text-neutral-900">{children}</div>;
  }

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 flex">
      <aside className="w-56 shrink-0 border-r border-neutral-200 bg-white flex flex-col">
        <div className="px-4 py-4 border-b border-neutral-200">
          <div className="text-sm font-bold tracking-tight">STALL · Ops</div>
          <div className="text-xs text-neutral-500 mt-0.5">{session.name}{session.isSuper ? " · admin" : " · staff"}</div>
        </div>
        <nav className="flex-1 py-2 text-sm">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className="block px-4 py-2 hover:bg-neutral-100 text-neutral-700 hover:text-neutral-950">
              {n.label}
            </a>
          ))}
        </nav>
        <form action={logout} className="p-3 border-t border-neutral-200">
          <button className="w-full text-xs text-neutral-500 hover:text-neutral-900 py-1.5 rounded border border-neutral-200">Sign out</button>
        </form>
      </aside>
      <main className="flex-1 min-w-0 p-6 max-w-6xl">{children}</main>
    </div>
  );
}
