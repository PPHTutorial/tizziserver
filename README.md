# GrandPrice

Multi-vendor marketplace + inverse-draw engine + delivery/courier network with live
tracking — one backend serving the **GrandPrice** and **Tizzi Gas** apps.

> Formerly `tizziserver`. Mid-overhaul — see [`docs/`](docs/) for the full plan and
> [`docs/PROGRESS.md`](docs/PROGRESS.md) for current state. Resume a session with
> **`RESUME GRANDPRICE`**.

## Monorepo layout

| Path | What |
|------|------|
| `apps/api` | Next.js 16 — REST API (`/api/v1`), `/admin` console (Phase 7), marketing site |
| `apps/realtime` | Fastify + Socket.IO gateway — live courier tracking, chat, notifications (skeleton) |
| `apps/worker` | BullMQ workers — payouts, draws, notifications, ETA, outbox relay (skeleton) |
| `mobile/` | Flutter app (GrandPrice + Tizzi Gas flavors) |
| `packages/db` | Prisma 7 schema, client singleton, migrations, seed |
| `packages/config` | zod-validated env loader (`@grandprice/config`) |
| `packages/contracts` | Zod schemas → `openapi.json` → (Phase 1) generated Dart client |
| `packages/tokens` | design tokens (`tokens.json`) → `tokens.ts` / `tokens.css` / `mobile/.../tokens.g.dart` |
| `infra/docker` | local stack: Postgres+PostGIS, Redis, MinIO, Mailpit, Meilisearch |
| `infra/terraform` | GCP + Cloudflare IaC (Phase 8) |
| `docs/` | architecture, data model, design system, screen catalog, roadmap, **progress ledger** |

## Prerequisites

Node 22 · pnpm 10 (`corepack enable`) · Docker · Flutter 3.32+

## Quickstart

```bash
pnpm install
cp .env.example .env                      # adjust as needed

docker compose -f infra/docker/docker-compose.yml up -d   # Postgres/Redis/MinIO/Mailpit

pnpm --filter @grandprice/db generate     # Prisma client
pnpm --filter @grandprice/db migrate      # apply migrations (once DB is up)

pnpm --filter @grandprice/tokens build    # generate design tokens
pnpm --filter @grandprice/contracts build # generate openapi.json

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
pnpm --filter @grandprice/api lint
cd mobile && flutter analyze && flutter test
```

## Legacy

The pre-overhaul Tizzi Gas docs are archived under [`docs/legacy/`](docs/legacy/).
