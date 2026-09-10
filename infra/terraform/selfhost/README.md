# Self-hosted deploy (no GCP/AWS)

Runs the whole Stall stack on one VPS via `infra/docker/docker-compose.prod.yml`,
with Cloudflare in front for DNS, WAF, rate-limiting, and Turnstile — this
module provisions the Cloudflare side only. It's a sibling of
`infra/terraform/` (the GCP path), not a replacement for it; both can exist,
pick whichever you're actually deploying to.

## 1. Get a VPS

Any provider works — Hetzner/DigitalOcean/Vultr/Contabo are all reasonable.
For ~100k registered users (a few thousand concurrent at peak), a single
8 vCPU / 32 GB / NVMe box comfortably runs everything in this compose file.
Split Postgres onto its own box later if you outgrow one machine — nothing
in the compose file assumes co-location.

Install Docker + the Compose plugin on it, then clone this repo (or just
copy `infra/docker/` + the built images).

## 2. Point Cloudflare at it

```
cd infra/terraform/selfhost
cp terraform.tfvars.example terraform.tfvars   # fill in the VPS IP + Cloudflare creds
terraform init
terraform plan
terraform apply
```

This creates `api.<domain>` and `rt.<domain>` DNS records (proxied through
Cloudflare), the managed WAF ruleset, a rate-limit on `/api/v1/auth/*` and
`/api/v1/checkout`, a cache-bypass rule for `/api/*`, and a Turnstile widget.
Set Cloudflare's SSL/TLS mode to **Full** or **Full (strict)** — Caddy on the
VPS terminates TLS with its own Let's Encrypt cert, so "Flexible" would
double-encrypt unnecessarily and "Full (strict)" additionally validates that
cert against Cloudflare's edge.

## 3. Deploy the app

On the VPS:

```
cp .env.example .env.prod   # fill in REAL secrets — never commit this file
# .env.prod needs: JWT_PRIVATE_KEY/JWT_PUBLIC_KEY, POSTGRES_PASSWORD,
# REDIS_PASSWORD, MINIO_ROOT_PASSWORD, MEILI_MASTER_KEY, DOMAIN, plus the
# SMTP/Nalo/Firebase(FCM)/Sentry credentials for whichever of those you use.
docker compose -f infra/docker/docker-compose.prod.yml --env-file .env.prod up -d --build
docker compose -f infra/docker/docker-compose.prod.yml --env-file .env.prod exec api pnpm --filter @stall/db migrate:deploy
```

Caddy (bundled in the compose file) gets HTTPS automatically via Let's
Encrypt the first time it starts, as long as `api.<domain>`/`rt.<domain>`
already resolve to this VPS (step 2) and ports 80/443 are open.

## Why this instead of GCP

Managed Cloud SQL + Memorystore + Cloud Run bill continuously for compute
and storage that a single VPS gives you flat-rate. At the traffic this app
is actually built for (a multi-tenant marketplace, not a hyperscale
consumer app), self-hosting is realistically half to a third of the GCP-managed
cost for the same load — the tradeoff is you own OS patching, DB backups
(`pg_dump` on a cron + off-box storage — MinIO or a cheap object-storage
provider works), and capacity planning yourself instead of GCP doing it.
Cloudflare's free tier covers the CDN/WAF/DDoS layer either way, so that
part of "production efficiency" isn't actually GCP-specific.
