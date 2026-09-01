# GRANDPRICE — PLANNING CORPUS

The overhaul of `tizziserver` → **GrandPrice**, a multi-vendor commerce + delivery + auction
ecosystem serving GrandPrice and Tizzi Gas from one backend, with a Flutter mobile app,
Google Maps + WebSocket live courier tracking, on GCP + Cloudflare.

## Resume across sessions

| Type this | Effect |
|---|---|
| **`RESUME GRANDPRICE`** | Pick up exactly where the last session stopped. |
| **`RESUME GRANDPRICE — <focus>`** | Same, biased toward `<focus>`. |
| **`SAVE GRANDPRICE`** | Flush state to `PROGRESS.md` before clearing context. |
| **`STATUS GRANDPRICE`** | Print current state + active phase + next 3 actions. |

Details: **[`RESUME.md`](RESUME.md)**.

## Read order

1. **[`PROGRESS.md`](PROGRESS.md)** — living ledger. Current state, active phase, next actions, decisions, blockers. **Always first.**
2. **[`00-MASTER-PLAN.md`](00-MASTER-PLAN.md)** — vision, principles, stack, repo layout.
3. **[`01-ARCHITECTURE.md`](01-ARCHITECTURE.md)** — services, request lifecycle, auth, capability gating, realtime, geo, infra, security, testing.
4. **[`02-DATA-MODEL.md`](02-DATA-MODEL.md)** — Prisma v7 schema v2, all 10 domains, migration from the gas schema.
5. **[`03-DESIGN-SYSTEM.md`](03-DESIGN-SYSTEM.md)** — GrandPrice mobile design system (tokens, type, components, map screens).
6. **[`04-SCREEN-CATALOG.md`](04-SCREEN-CATALOG.md)** — 522 screens → module/role/gate/realtime/maps + build tracker.
7. **[`05-ROADMAP.md`](05-ROADMAP.md)** — Phases 0–8 with checklists and exit criteria.

`design/` — raw Figma API responses from Session 1 (the file is empty; kept for the record).

## Source spec

`GrandPrice — Mobile Figma Screen Expansion Specification` (user-supplied markdown). The Figma
design (`figma.com/design/l027yH0ARNs9FFYcc3SJ3t`) is an empty canvas — we design from the spec.
