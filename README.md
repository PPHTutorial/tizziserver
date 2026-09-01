# Stall

A multi-**tenant** marketplace + delivery/courier engine with live tracking and an
Inverse-Draw system. One backend, one codebase; each product is a `Platform` tenant with its
own name, theme and feature switches:

- **GrandPrice** — general multi-vendor store marketplace + delivery + Inverse Draws.
- **Tizzi Gas** — LPG cylinder marketplace + delivery (gas-scoped catalog, no auction/ads).

> Formerly `tizziserver`. Mid-overhaul — see [`docs/`](docs/) for the full plan and
> [`docs/PROGRESS.md`](docs/PROGRESS.md) for current state. Resume a session with
> **`RESUME STALL`**.

## Monorepo layout

| Path | What |
|------|------|
| `apps/api` | Next.js 16 — REST API (`/api/v1`), `/admin` console (Phase 7), marketing site |
| `apps/realtime` | Fastify + Socket.IO gateway — live courier tracking, chat, notifications (skeleton) |
| `apps/worker` | BullMQ workers — payouts, draws, notifications, ETA, outbox relay (skeleton) |
| `mobile/` | Flutter app (per-tenant flavors: GrandPrice, Tizzi Gas) |
| `packages/db` | Prisma 7 schema, client singleton, migrations, seed |
| `packages/config` | zod-validated env loader (`@stall/config`) |
| `packages/contracts` | Zod schemas → `openapi.json` → (Phase 1) generated Dart client |
| `packages/tokens` | design tokens (`tokens.json`) → `tokens.ts` / `tokens.css` / `mobile/.../tokens.g.dart` |
| `infra/docker` | local stack: Postgres+PostGIS, Redis, MinIO, Mailpit, Meilisearch |
| `infra/terraform` | GCP + Cloudflare IaC (Phase 8) |
| `docs/` | architecture, data model, design system, screen catalog, roadmap, **progress ledger** |

## Prerequisites

Node 22 · pnpm 10 (`corepack enable`) · Flutter 3.32+ · Docker *or* native Postgres 16 + Redis
(see [`docs/DEV_SETUP.md`](docs/DEV_SETUP.md) — Docker is preferred but a no-Docker path exists).

## Quickstart

```bash
pnpm install
cp .env.example .env                      # adjust as needed

# services — Docker:
docker compose -f infra/docker/docker-compose.yml up -d
# …or no-Docker (3 terminals): pnpm dev:db   pnpm dev:redis   pnpm dev:mail

pnpm --filter @stall/db generate     # Prisma client
pnpm --filter @stall/db migrate      # apply migrations (once DB is up)

pnpm --filter @stall/tokens build    # generate design tokens
pnpm --filter @stall/contracts build # generate openapi.json

pnpm dev                                  # turbo: runs api + realtime + worker
# mobile:
cd mobile && flutter run
```

Ports: api `:3000` · realtime `:3001` · worker health `:3002` · Postgres `:5432` ·
Redis `:6379` · MinIO `:9000` (console `:9001`) · Mailpit UI `:8025`.

## Checks (also run in CI)

```bash
pnpm -r build
pnpm -r typecheck
pnpm --filter @stall/api lint
cd mobile && flutter analyze && flutter test
```

## Legacy

The pre-overhaul Tizzi Gas docs are archived under [`docs/legacy/`](docs/legacy/).
