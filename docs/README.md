# STALL — PLANNING CORPUS

The overhaul of `tizziserver` → **Stall**, a multi-tenant marketplace + delivery + Inverse-Draw
engine. One backend serves the **GrandPrice** (general multi-vendor store) and **Tizzi Gas**
(LPG delivery) tenants — same concept, per-tenant feature switches. Flutter mobile app, Google
Maps + WebSocket live courier tracking, on GCP + Cloudflare.

## Resume across sessions

| Type this | Effect |
|---|---|
| **`RESUME STALL`** | Pick up exactly where the last session stopped. |
| **`RESUME STALL — <focus>`** | Same, biased toward `<focus>`. |
| **`SAVE STALL`** | Flush state to `PROGRESS.md` before clearing context. |
| **`STATUS STALL`** | Print current state + active phase + next 3 actions. |

Details: **[`RESUME.md`](RESUME.md)**.

## Read order

1. **[`PROGRESS.md`](PROGRESS.md)** — living ledger. Current state, active phase, next actions, decisions, blockers. **Always first.**
2. **[`00-MASTER-PLAN.md`](00-MASTER-PLAN.md)** — vision, principles, stack, repo layout.
3. **[`01-ARCHITECTURE.md`](01-ARCHITECTURE.md)** — services, request lifecycle, auth, capability gating, realtime, geo, infra, security, testing.
4. **[`02-DATA-MODEL.md`](02-DATA-MODEL.md)** — Prisma v7 schema v2, all 10 domains, migration from the gas schema.
5. **[`03-DESIGN-SYSTEM.md`](03-DESIGN-SYSTEM.md)** — Stall mobile design system (tokens, type, components, map screens); currently seeded from the GrandPrice tenant's Figma.
6. **[`04-SCREEN-CATALOG.md`](04-SCREEN-CATALOG.md)** — 522 screens → module/role/gate/realtime/maps + build tracker.
7. **[`05-ROADMAP.md`](05-ROADMAP.md)** — Phases 0–8 with checklists and exit criteria.

`design/` — the pulled Figma export (`docs/design/Untitled/`, 64 GrandPrice screens) + mined
tokens. Re-run `npm run figma:pull` after Figma changes. See `design/README.md`.

## Source spec

`GrandPrice — Mobile Figma Screen Expansion Specification` (user-supplied markdown) — the
GrandPrice tenant's 522-screen brief. Its design system is adopted as Stall's shared system.
