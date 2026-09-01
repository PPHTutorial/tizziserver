# Stall — local dev setup

Two ways to run the backing services. **Docker is the default** (Path A, verified working in
Session 5). The no-Docker path (Path B) is a fallback.

---

## Path A — Docker (default)

```bash
docker compose -f infra/docker/docker-compose.yml --env-file .env.example up -d
```

Brings up Postgres 16 + PostGIS 3.5, Redis 7, MinIO (+ `stall-media` bucket), Mailpit
(UI :8025), and Meilisearch with `--profile search`. Wait for all to report `healthy`
(`docker compose … ps`).

`.env`: `DATABASE_URL=postgresql://stall:stall@localhost:5432/stall?schema=public`.
PostGIS is in the image; a migration enables the extension (until then:
`docker exec stall-postgres-1 psql -U stall -d stall -c 'CREATE EXTENSION IF NOT EXISTS postgis'`).

**Image tags are pinned** in the compose file — floating `:latest` tags produced corrupt /
`exec format error` layers on this machine after a Docker Desktop factory reset. If containers
restart-loop with `exec format error`: `docker compose … down`, `docker image rm` the offending
tag, bump to a newer pinned release, re-up. If the daemon store goes read-only / `vpnkit`
errors: `wsl --update`, Docker Desktop → Troubleshoot → **Reset to factory defaults**, reboot.

## Path B — no Docker (native services already on the machine)

Uses the Windows PostgreSQL 16 install, `redis-server` from scoop, and `maildev` from npm.

```bash
pnpm dev:db        # initdb ./.pgdata (first run) + start Postgres on :5432 + create `stall`
pnpm dev:redis     # redis-server on :6379          (separate terminal)
pnpm dev:mail      # maildev  SMTP :1025 / UI :1080  (separate terminal)

pnpm --filter @stall/db migrate   # apply migrations (deploy in CI: migrate:deploy)
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
| `DATABASE_URL` | `postgresql://stall:stall@localhost:5432/stall?schema=public` (Docker) — or `postgresql://postgres@localhost:5432/stall?schema=public` (Path B) |
| `REDIS_URL` | `redis://localhost:6379` |
| `SMTP_HOST` / `SMTP_PORT` | `localhost` / `1025` (Mailpit/maildev, no auth) |
| `S3_*` | MinIO defaults (`stall` / `stall-secret`, bucket `stall-media`) |

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
pnpm --filter @stall/db exec tsx scripts/smoke.ts   # DB connect + counts (needs .env loaded)
```

## Checks (also CI)

```bash
pnpm -r build && pnpm -r typecheck && pnpm --filter @stall/api lint
cd mobile && flutter analyze && flutter test
```
