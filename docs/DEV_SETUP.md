# GrandPrice — local dev setup

Two ways to run the backing services. **Docker is the intended path**; the no-Docker path
exists because Docker Desktop's WSL2 backend was broken on the dev machine during Phase 0
(`vpnkit-bridge handshake failed`, `distribution failed to start`).

---

## Path A — Docker (preferred, once Docker Desktop works)

```bash
docker compose -f infra/docker/docker-compose.yml --env-file .env.example up -d
```

Brings up Postgres+PostGIS 16, Redis 7, MinIO (+bucket), Mailpit, (Meilisearch with
`--profile search`). If it fails with read-only-filesystem / vpnkit errors:
`wsl --update`, then Docker Desktop → Troubleshoot → **Reset to factory defaults**, or reboot.

## Path B — no Docker (native services already on the machine)

Uses the Windows PostgreSQL 16 install, `redis-server` from scoop, and `maildev` from npm.

```bash
pnpm dev:db        # initdb ./.pgdata (first run) + start Postgres on :5432 + create `grandprice`
pnpm dev:redis     # redis-server on :6379          (separate terminal)
pnpm dev:mail      # maildev  SMTP :1025 / UI :1080  (separate terminal)

pnpm --filter @grandprice/db migrate   # apply migrations (deploy in CI: migrate:deploy)
```

`pnpm dev:db:stop` stops Postgres. The cluster lives in `./.pgdata` (gitignored); delete it to
start clean. Auth is `trust` (no password) — **dev only**.

MinIO has no native substitute here; object storage isn't exercised until Phase 2, so it's fine
to leave `S3_*` pointing at `localhost:9000` and bring MinIO up (Docker) when needed.

---

## `.env`

```bash
cp .env.example .env
```

Every app script loads the **root `.env`** via `dotenv -e ../../.env`. Key infra values:

| Key | Dev value |
|-----|-----------|
| `DATABASE_URL` | `postgresql://postgres@localhost:5432/grandprice?schema=public` |
| `REDIS_URL` | `redis://localhost:6379` |
| `SMTP_HOST` / `SMTP_PORT` | `localhost` / `1025` (maildev/Mailpit, no auth) |
| `S3_*` | MinIO defaults (`grandprice` / `grandprice-secret`, bucket `grandprice-media`) |

Production credentials (real SMTP, payment/maps/FCM keys) are **not needed for dev** and get
filled in per phase — see `docs/PROGRESS.md` BLOCKERS.

---

## Run the apps

```bash
pnpm dev        # turbo: api :3000 · realtime :3001 · worker health :3002
cd mobile && flutter run
```

## Smoke checks

```bash
curl -s -XPOST localhost:3000/api/x -H 'content-type: application/json' -d '{"action":"test"}'
curl -s localhost:3001/health
curl -s localhost:3002/health
pnpm --filter @grandprice/db exec tsx scripts/smoke.ts   # DB connect + counts (needs .env loaded)
```

## Checks (also CI)

```bash
pnpm -r build && pnpm -r typecheck && pnpm --filter @grandprice/api lint
cd mobile && flutter analyze && flutter test
```
