# STALL — MVP RELEASE PLAN

> Written for the owner (solo founder-developer) to execute. Every claim below was checked
> against the code at `stall-rebuild` @ `e766924` on 2026-10-05; file paths are given so you
> can re-verify. Companion docs: `08-HARDENING.md` (Phase 8 detail), `runbooks/*` (ops),
> `PROGRESS.md` BLOCKERS (B4–B9).

Legend: ✅ ready · ⚠️ needs you (an account, a key, a decision, a manual step) · ❌ missing (code or config work still to do)

---

## 1. Recommended MVP scope

**Recommendation:** launch **GrandPrice only, Android only, in Ghana**: the multi-vendor
marketplace, platform delivery with live tracking, the "Sell on Stall" vendor flow, the
courier app, chat, disputes and support. **Inverse Draw ships turned off** (feature flag
`auction=false`). **Advertising/boosting ships turned off too** (`advertising=false`).
Tizzi Gas follows as a second store listing, and iOS follows after Android is stable.

| Area | MVP? | Why |
|---|---|---|
| GrandPrice marketplace (browse, search, product, cart, checkout, orders, returns) | **Ship** | All screens are built (catalog §03–§07 ✅). The only blocker is the real payment gateway (§2). |
| Platform delivery + courier app (§08–§16) | **Ship** | Built end to end: dispatch, live tracking, OTP handover, earnings. Location is used only in the foreground, so no Play background-location review is needed. |
| Sell on Stall + vendor hub + KYC (§25, §24) | **Ship** | Done in S61. KYC review runs in the admin console. |
| Chat, notifications centre, support, disputes (§21, §22, §27) | **Ship** | Built. Push is in-app/realtime only until FCM is wired (B6). |
| Wallet + coupons + referrals | **Ship, limited** | Wallet top-up needs the real gateway. Before launch, set `REFERRAL_REWARD_MINOR` low or to 0. It is cash-like and a common fraud target. |
| **Inverse Draw** (§17–§18) | **Defer** (flag off) | A paid ticket for a chance to buy is very likely regulated gaming or lottery activity in Ghana (Gaming Act 2006 / National Lottery Act 2006). Apple §5.3 and Google's real-money-gambling policy also need licences and geo-restriction. Two UX items are unbuilt (live multi-stage draw, Trending Draws). The trade-off: you give up the most distinctive feature at launch, in exchange for no regulatory or store-rejection risk on day 1. 21 API routes are gated server-side on `capability: "auction"`, so the flag fully disables it. |
| Advertising / boosting (§26) | **Defer** (flag off) | At launch there is no traffic to sell. Apple treats in-app ad/boost purchases as digital goods that need IAP. Campaigns also need manual review (`ADS_REVIEW_REQUIRED`). 12 routes are gated on `capability: "advertising"`. |
| Social sign-in (Google/Apple/Facebook) | **Defer** | The native SDKs are not wired. `mobile/lib/features/auth/social.dart` shows a "being wired up" dialog, which would be rejected as an incomplete feature. Phone OTP is the MVP login. |
| Tizzi Gas | **Phase 2** (2–4 weeks after) | There is no icon artwork and no iOS flavor, and the `tizzigas` build hasn't been verified (it stalled environmentally in S61). LPG retail/delivery may also need its own regulatory licence (NPA). The same backend serves it, so launching it is a store-listing exercise, not engineering. |
| iOS | **Phase 2** | iOS flavors are a manual Xcode step. Usage strings are missing and the deployment target is wrong (§4). Android-first halves the review surface. |

---

## 2. Go / no-go checklist

### 2a. Code: done

| Item | Status | Evidence |
|---|---|---|
| Phases 0–8 code-complete, typecheck 8/8, `flutter analyze` 0 | ✅ | PROGRESS S61 |
| Admin console (KYC, disputes, users/safety, pricing, flags, audit log, draws, campaigns) | ✅ | `apps/api/app/admin/*`, 16 Playwright flows in `apps/api/e2e/` |
| Per-tenant feature flags enforced server-side | ✅ | `packages/core/src/platform/features.ts`, `withApi({capability})` |
| Privacy: data export, account-deletion pipeline (backend) | ✅ | `/api/v1/me/data-export`, `/api/v1/me/account/deletion`, worker `privacy-sweep` |
| SMS OTP via **Nalo** (Ghana) | ✅ | `packages/core/src/auth/sms.ts` (Twilio throws "not implemented") |
| Android flavors + release signing plumbing, INTERNET permission in main manifest | ✅ | `mobile/android/app/build.gradle.kts`, S61 fix |
| Maps without a Google key (flutter_map + CARTO tiles, OSRM/haversine routing) | ✅ | `mobile/lib/design/app_map.dart`, `packages/core/src/maps/index.ts` |
| Runbooks (on-call, incident, rollback, payment outage, dispatch, disputes, DR) | ✅ | `docs/runbooks/` |

### 2b. Code: remaining before launch (all ❌ unless noted)

> **Update 2026-10-05 (overnight session S62), on `stall-rebuild`.** Done in code: **C1** Paystack adapter (hosted checkout, verify, refund, HMAC-SHA512 webhook; tested with a stubbed API only, so run one sandbox top-up before launch) · **C2** app opens `authorizationUrl` and confirms on return (`POST /payments/intents/{id}/confirm`) · **C3** payout drain only auto-settles under mock; manual `/admin/payouts` queue (mark paid with transfer ref / fail and refund) · **C4** manual card form hidden in release builds · **C5** in-app Delete account + Download my data (Settings → Privacy & legal) · **C6** social sign-in gated on `social_login` (seeded off) · **C7** `SEED_PROFILE=production` + `SEED_ADMIN_PHONE` · **C8** `GET /api/v1/health` · **C9** location permissions · **C10** release builds refuse missing dart-defines · **C11** `/legal/privacy` + `/legal/terms` (set `LEGAL_ENTITY_NAME`, `LEGAL_ENTITY_ADDRESS`, `SUPPORT_EMAIL`).
> **Payments model at MVP: wallet-first.** Order checkout, tickets and win-target pay from the wallet; card/MoMo comes in through Paystack wallet top-ups. Direct gateway checkout refuses hosted providers with `TOP_UP_REQUIRED`.
> Infra (2c) also fixed: prod compose runs `migrate deploy` before the apps, realtime has its DB URL, media is served read-only at `media.<domain>` (public-read bucket, Terraform DNS added), and nightly on-box `pg_dump` is kept 14 days (**still copy it off-box**). Production now refuses to boot with mock payments (unless `ALLOW_MOCK_PAYMENTS_IN_PRODUCTION=true` for staging) or without `REDIS_URL`.
> Still open: **C12** device tap-through · **C13** push (FCM). ~~KYC documents share the public media bucket~~ fixed: the bucket policy is public-read only for `avatars/ vendors/ products/ brand-logos/`, KYC uploads go to `kyc/` (private, verified 403) and admins view them through `/admin/kyc/file`.

> **Update 2026-10-05 (S63).** Flash deals now charge the advertised deal price (platform-funded: vendor paid on list price, discount nets against platform revenue like coupons). Returns refund only what the buyer paid: the flash-deal discount and the returned items' proportional coupon share go back to the platform. Inverse Draw off at launch = admin console → Feature flags → `grandprice` / `auction` → off.

> **Update 2026-10-05 (S64): Paystack replaced by Flutterwave.** `packages/core/src/payments/flutterwave.ts`. Card = Flutterwave's hosted page in an in-app browser tab (no card data in the app or on our servers). Mobile money (GH: MTN/Telecel/AirtelTigo), OPay, Apple Pay, Google Pay, bank transfer and bank-account debit = direct charges over the API, driven from native screens (`mobile/lib/features/commerce/payment_flow.dart`: approve-on-phone, OTP, one-time transfer account, provider page). Which methods show is per currency (GHS defaults to card + MoMo; OPay/bank are NGN, Apple/Google Pay are NGN/USD/GBP/EUR); override with `FLUTTERWAVE_METHODS`. **Security:** webhooks need `verif-hash`/`flutterwave-signature` and are only a hint; every settlement re-fetches the transaction (`verify_by_reference`) and requires status + exact amount + currency + tx_ref. Charge-once: the intent row is written before Flutterwave is called, the top-up `Idempotency-Key` is a unique column on the intent, settlement claims and credits the wallet in one transaction, and `payments.settledIntentId` is unique. Worker `payment-reconcile` re-verifies in-flight payments every minute (missed webhooks) and expires abandoned ones after 24 h; a verified late success still credits. Setup: `FLUTTERWAVE_SECRET_KEY`, `FLUTTERWAVE_WEBHOOK_HASH`, `FLUTTERWAVE_REDIRECT_URL` (prod refuses to boot without them); dashboard webhook `https://api.<domain>/api/v1/payments/webhook?gateway=flutterwave`. **Still to do:** one test-mode run of every enabled method (stubbed API only so far), and confirm with Flutterwave which methods the account has for GHS.

| # | Item | Why it blocks | Where |
|---|---|---|---|
| C1 | **Implement `PaystackGateway`** (createIntent → `authorizationUrl`, verify/capture, refund, webhook HMAC-SHA512 with `PAYSTACK_SECRET_KEY`) | `PaystackGateway`/`FlutterwaveGateway`/`StripeGateway` all extend `UnconfiguredGateway` and **throw**, so `mock` is the only working provider | `packages/core/src/payments/providers.ts` |
| C2 | **Mobile: handle `authorizationUrl`**, i.e. open the hosted page (Paystack checkout supports cards and MoMo), then poll the intent or handle the return deep-link | No code in `mobile/lib` reads `authorizationUrl`/`REQUIRES_ACTION` | `mobile/lib/features/commerce/screens/checkout_screen.dart`, wallet top-up |
| C3 | **Payout drain is fake.** It flips `PENDING → PAID` with `gatewayRef: mock_…` every 20 s. Either gate it behind an env flag and add an admin "mark paid (manual MoMo/bank ref)" action, or implement Paystack Transfers | Real money: vendors and couriers would see "Paid" without being paid | `apps/worker/src/main.ts` `payoutDrain()`; no payouts page in `apps/api/app/admin/` |
| C4 | Replace the "add card" form (label + last4 + expiry) with gateway tokenisation, or hide it at MVP | Today it stores user-typed card metadata. Real cards should come from Paystack authorizations | `payment_methods_screen.dart` |
| C5 | **In-app "Delete account"** UI calling `POST /api/v1/me/account/deletion` (+ a public web page for the same) | Required by both Google Play and Apple. The backend exists, but the mobile client has no call | `mobile/lib/api/stall_api.dart`, `settings_screen.dart` |
| C6 | Hide social sign-in buttons when `social_login=false` (or remove them) | The welcome screen shows them unconditionally, and they open a "being wired up" dialog | `auth/screens/welcome_screen.dart`, `social.dart` |
| C7 | **Production seed mode.** Seed only currencies, regions, platforms, flags, fees and categories. No demo vendors, products, couriers or auctions | `packages/db/prisma/seed.ts main()` always runs `seedCatalog/Commerce/Delivery/Auctions/Advertising` (demo data with fake `+2332000000xx` phones) | `packages/db/prisma/seed.ts` (e.g. `SEED_DEMO=0` guard) |
| C8 | **Add `GET /api/v1/health`** | `deploy.yml` smoke-tests it and **auto-rolls-back prod** if it fails, but the route doesn't exist (realtime/worker have `/health`, the API doesn't) | `apps/api/app/api/v1/health/route.ts` |
| C9 | Android manifest: add `ACCESS_FINE_LOCATION` + `ACCESS_COARSE_LOCATION` | `geolocator` is used (`mobile/lib/core/location.dart`), but the main manifest only has INTERNET/CAMERA/RECORD_AUDIO, so courier tracking and "nearby" can't get a fix in release | `mobile/android/app/src/main/AndroidManifest.xml` |
| C10 | Release config: build with `STALL_API_URL`, `STALL_REALTIME_URL`, `STALL_MEDIA_URL`, `STALL_PLATFORM` dart-defines | Defaults are `localhost` | `mobile/lib/core/api_config.dart` |
| C11 | Privacy policy + Terms + Draw rules pages (hosted) | Nothing exists in the repo. `phone_entry_screen.dart:149` says "you agree to the Terms…" with no link | new static pages (e.g. `apps/api/app/(legal)/privacy/page.tsx`) + links in app |
| C12 | ⚠️ Run Vitest + full device tap-through (all §2 flows on a real Android) | Never run on a device (PROGRESS 0a′/0b: local aapt2 deadlock) | `pnpm test`, `flutter run --flavor grandprice` |
| C13 | Courier "jobs" without push: acceptable for MVP only if couriers keep the app open | Dispatch offers arrive over the socket. Without FCM (B6), a backgrounded courier misses offers (30 s TTL) | Post-MVP: `firebase_messaging` + register `pushToken` |

### 2c. Infrastructure

| Item | Status | Notes |
|---|---|---|
| Self-host stack `infra/docker/docker-compose.prod.yml` (PG16+PostGIS, Redis, MinIO, Meilisearch, api/realtime/worker, Caddy auto-HTTPS) | ✅ authored | The primary path since S30 (`08-HARDENING.md` §8) |
| Cloudflare for self-host, `infra/terraform/selfhost/` (DNS `api.`/`rt.`, WAF, rate limits on auth/checkout, Turnstile, optional R2) | ✅ authored, ⚠️ needs zone + token | |
| **realtime has no in-network `DATABASE_URL`** in the prod compose, but it imports `@stall/core` delivery/couriers (Prisma). It would read `.env.prod`'s value | ❌ | Workaround with no code change: in `.env.prod` set `DATABASE_URL=postgresql://stall:<POSTGRES_PASSWORD>@postgres:5432/stall?schema=public`. Better: add it to the `realtime:` service + `depends_on: postgres` |
| **Public media URL.** The app builds image URLs as `STALL_MEDIA_URL/<key>`, but Caddy doesn't route to MinIO and `minio-init` sets no read policy | ❌ | Add a `media.{$DOMAIN}` block (`reverse_proxy minio:9000`) to `infra/docker/Caddyfile` + `mc anonymous set download` **only on `products/`, `avatars/`, `vendors/` (not `vendors/kyc/`)**. Or use R2 (`enable_r2=true`) with a public custom domain |
| KYC documents share the media bucket (`vendors/kyc/<userId>/…`) | ⚠️ | Must not be publicly readable (see above). Admin review should use signed URLs |
| Off-box DB backups (self-host) | ⚠️ keys | Done in code (S63): `pgbackup` dumps nightly (14 days on-box) and `backup-offsite` copies them to any S3-compatible bucket. Set `BACKUP_S3_ENDPOINT/BUCKET/ACCESS_KEY_ID/SECRET_ACCESS_KEY` (e.g. a Cloudflare R2 bucket with a 30-day lifecycle rule); it idles with a warning until set. Test a restore once |
| MinIO images | ✅ | S63: MinIO's official images are no longer pullable (Docker Hub `minio/*` and quay.io `minio/mc`), so a fresh VPS couldn't start storage. Switched to `pgsty/minio` + `pgsty/mc` (community builds, pinned); bucket init + scoped public-read policy re-verified (public prefixes 200, `kyc/`/`invoices/` 403) |
| Meilisearch in compose | ⚠️ | No code uses it (search is Postgres FTS). Keep it (needs `MEILI_MASTER_KEY`) or drop the service to free RAM |
| OSRM routing defaults to the **public demo server** `router.project-osrm.org` | ⚠️ | Not for production traffic. Set `OSRM_URL` to a self-hosted OSRM, or **unset** it (haversine fallback), or set `GOOGLE_MAPS_API_KEY` (B5) |
| Map tiles: CARTO Voyager by default | ⚠️ | Check CARTO's basemap terms for commercial use / volume. You can swap via `--dart-define=MAP_TILE_URL_TEMPLATE=` (MapTiler/Stadia free tiers, or self-host) |
| GCP path (`infra/terraform/*.tf` + `.github/workflows/deploy.yml`) | ⚠️ not recommended for MVP | Cloud Run gets **only** the 10 `secret_names` + `NODE_ENV` (`infra/terraform/variables.tf`), so `SMS_PROVIDER`, `PAYMENTS_PROVIDER`, `STORAGE_PROVIDER`, `S3_*` are unset → SMS logs to console and storage writes to the container disk. Every secret needs a version, or the revision fails |
| CI (`.github/workflows/ci.yml`: build/typecheck/lint, integration, admin E2E, flutter, docker) | ✅ | Green as of S29. Re-run before tagging |

### 2d. Third-party accounts & keys (env names from `packages/config/src/env.ts`)

| Service | Env | What it actually gates (verified) | MVP | Status |
|---|---|---|---|---|
| **Nalo SMS** | `SMS_PROVIDER=nalo`, `NALO_API_BASE_URL`, `NALO_API_KEY`, `NALO_SENDER_ID` | **All logins.** With `log` (the default), OTPs only print to the server log. A registered sender ID needs approval lead time | Required | ⚠️ (not in PROGRESS blockers) |
| **Flutterwave** (B4) | `PAYMENTS_PROVIDER=flutterwave`, `FLUTTERWAVE_SECRET_KEY`, `FLUTTERWAVE_WEBHOOK_HASH`, `FLUTTERWAVE_REDIRECT_URL`, `PAYMENTS_CURRENCY=GHS` | Wallet top-ups (all methods), refunds | Required | ⚠️ keys; adapter done S64 |
| Cloudflare (B8) | `cloudflare_api_token`, `cloudflare_zone_id`, `cloudflare_account_id` (tfvars) | DNS/WAF/rate-limit in front of the VPS | Required | ⚠️ |
| Domain | `DOMAIN` | Caddy certs, `api.`/`rt.`/`media.` hosts | Required | ⚠️ |
| VPS (Hetzner/DO/…) | n/a | Everything. 4–8 vCPU / 16–32 GB is plenty for launch | Required | ⚠️ |
| SMTP (Brevo/Resend/SES) | `SMTP_HOST/PORT/USER/PASS`, `EMAIL_FROM` | Email OTP sign-in, emailed invoices. Unset → `localhost` and failures | Recommended (or hide email sign-in) | ⚠️ |
| Sentry (B9) | `SENTRY_DSN`, `SENTRY_ENVIRONMENT` | Error capture; no-op without it | Strongly recommended (free tier) | ⚠️ |
| OTLP collector (B9) | `OTEL_EXPORTER_OTLP_ENDPOINT` | Traces only; no-op without it | Optional (Grafana Cloud free) | ⚠️ |
| Firebase FCM (B6) | `FCM_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY` | Backend push send only. **The app has no `firebase_messaging` and never sends a `pushToken`**, so keys alone deliver nothing. Also gates Crashlytics | Post-MVP | ⚠️ + ❌ (mobile) |
| Google Maps (B5) | `GOOGLE_MAPS_API_KEY` | Server-side ETA/route only (OSRM/haversine fallback). The app doesn't use Google Maps | Optional | ⚠️ |
| Brandfetch | `BRANDFETCH_API_KEY` | Brand-logo auto-illustration; curated map otherwise | Optional | ⚠️ |
| Google/Apple sign-in | `GOOGLE_CLIENT_ID`, `APPLE_CLIENT_ID` | Server token verification. The app side is unbuilt | Deferred | n/a |
| Play Console ($25 once) / Apple Developer ($99/yr) | n/a | Store listing | Play required; Apple phase 2 | ⚠️ |

Self-generated secrets (`.env.prod`): `JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY` (the Ed25519 one-liner
is in `env.ts`), `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `MINIO_ROOT_USER/PASSWORD` (also set
`S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY` to the same values and `S3_BUCKET=stall-media`),
`MEILI_MASTER_KEY`, and a random `MOCK_PAYMENTS_WEBHOOK_SECRET` (even if unused). Keep a copy of the JWT
keypair in a password manager. Rotating it logs everyone out.

### 2e. Legal / compliance

| Item | Status | Notes |
|---|---|---|
| Business registration (Ghana RGD) + bank/MoMo merchant account for Paystack KYC | ⚠️ | Paystack live mode needs registered-business docs |
| Privacy policy (hosted URL) | ❌ | Required by Play and Apple. Must cover phone, location, photos/camera, ID documents (KYC), payment, chat, retention (`AUDIT_LOG_RETENTION_DAYS`=365, deletion grace 14 d) |
| Terms of service + marketplace/seller terms + refund/returns policy | ❌ | Link from the phone-entry screen and the Sell on Stall intro |
| Ghana Data Protection Act 2012: register as a data controller with the Data Protection Commission | ⚠️ | You collect ID documents and location |
| Inverse Draw licensing (Gaming Commission / NLA) | ⚠️ decision | The reason it's deferred. Get a legal opinion before enabling |
| LPG retail licence (Tizzi Gas, NPA) | ⚠️ | Phase 2 |
| Third-party licences in the app (ffmpeg-kit **LGPL-3.0** `_min` build; ML Kit) | ✅ / ⚠️ | LGPL: show an attribution/licences screen (Flutter `showLicensePage`), keep dynamic linking (it is: `.so`) |

### 2f. Operations

| Item | Status |
|---|---|
| First ADMIN account + TOTP (§5.1) | ⚠️ manual SQL, no bootstrap script |
| KYC review desk | ✅ `/admin/kyc` |
| Dispute desk + SLA timers | ✅ `/admin/disputes`, worker `dispute-sla` (`DISPUTE_SLA_HOURS`=72) |
| Payout process | ❌ C3 |
| Uptime monitoring (external) | ❌ add UptimeRobot / Better Stack on `https://api.<domain>/api/v1/health` (after C8) + `https://rt.<domain>/health` |
| Backups | ❌ (see 2c) |
| Support inbox / phone number shown in the app and store listing | ⚠️ |

---

## 3. Launch runbook (self-host path, recommended)

Cost: one VPS (~$20–60/mo) + Cloudflare free tier, versus GCP Cloud SQL + Memorystore
(STANDARD_HA in prod) + 3× Cloud Run at `min_instances=1`, which is several times more and
needs the terraform env gaps fixed (2c). Use the GCP path (§3b) only if you need managed
HA.

### 3a. Self-host: ordered steps

| # | Step | Command / file | Needs |
|---|---|---|---|
| 1 | Finish code items **C1–C11** on `stall-rebuild`; `pnpm typecheck && pnpm test`; `flutter analyze` | n/a | dev DB up |
| 2 | Merge `stall-rebuild → main`, tag `v1.0.0` | `git checkout main && git merge --ff-only stall-rebuild` | n/a |
| 3 | Buy the domain; add it to Cloudflare; create an API token (Zone DNS + WAF + Turnstile edit; R2 if used) | dash.cloudflare.com | Cloudflare account |
| 4 | Provision the VPS (Ubuntu LTS); install Docker + Compose plugin; firewall 22/80/443 only; SSH keys only | n/a | VPS provider |
| 5 | Cloudflare records | `cd infra/terraform/selfhost && cp terraform.tfvars.example terraform.tfvars` (`domain`, `vps_ip`, `cloudflare_api_token/zone_id/account_id`) → `terraform init && terraform plan && terraform apply`. Then set SSL/TLS = **Full (strict)** | token |
| 6 | Add the media host (2c) | Add `media.{$DOMAIN}` to `infra/docker/Caddyfile` + a proxied DNS record (manual or tf) | n/a |
| 7 | Clone the repo on the VPS; create `.env.prod` at the repo root | `cp .env.example .env.prod`. Fill in: `NODE_ENV=production`, JWT keys, `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `MINIO_ROOT_*`, `S3_ACCESS_KEY_ID/SECRET` (= MinIO), `S3_BUCKET`, `MEILI_MASTER_KEY`, `DOMAIN`, **`DATABASE_URL` pointing at `postgres:5432`** (realtime fix), `SMS_PROVIDER=nalo` + `NALO_*`, `PAYMENTS_PROVIDER=paystack` + `PAYSTACK_*`, `SMTP_*`, `SENTRY_DSN`, `OSRM_URL` (or blank), `ADMIN_2FA_REQUIRED=true`, `REFERRAL_REWARD_MINOR=0` | all keys in 2d |
| 8 | Start the stack | `docker compose -f infra/docker/docker-compose.prod.yml --env-file .env.prod up -d --build` | n/a |
| 9 | Migrate | `docker compose -f infra/docker/docker-compose.prod.yml --env-file .env.prod exec api pnpm --filter @stall/db migrate:deploy` | n/a |
| 10 | Reference-data seed (**after C7**, demo off) | `… exec api pnpm --filter @stall/db seed` | n/a |
| 11 | Flags for MVP | `/admin/feature-flags`: grandprice → `auction=false`, `advertising=false`, `social_login=false`. Check fees in `/admin/pricing` (seed: 10% commission, 80% courier share, GHS 10 base + GHS 2/km delivery) | admin (§5.1) |
| 12 | Media bucket policy | `docker compose … exec minio-init`, or run `mc anonymous set download local/stall-media/products` (same for `avatars`, `vendors`, never `vendors/kyc`) | n/a |
| 13 | Paystack dashboard: webhook URL → `https://api.<domain>/api/v1/payments/webhook`; test-mode end-to-end order, refund, then switch to live keys | n/a | Paystack |
| 14 | Smoke | `curl https://rt.<domain>/health`; `curl https://api.<domain>/api/v1/config/bootstrap -H 'x-platform: grandprice'`; real phone OTP login; one real GHS 1 order end to end with a real courier | n/a |
| 15 | Backups cron + restore drill; uptime monitors; Sentry alert → email | crontab on VPS | n/a |
| 16 | (optional) k6 against prod before announcing | `infra/loadtest/{checkout,dispatch,tracking}.js` (see `infra/loadtest/README.md`) | n/a |
| 17 | Build + upload the Android app (§4) → internal testing → closed testing → production staged rollout (10% → 50% → 100%) | n/a | Play Console |

Deploying updates (self-host has no CI deploy): `git pull && docker compose … up -d --build && docker compose … exec api pnpm --filter @stall/db migrate:deploy`.
Rollback: `git checkout <prev-tag>` + `up -d --build` (migrations are forward-only, so restore from the
dump if a migration was destructive; see `runbooks/deploy-rollback.md`).

### 3b. GCP path (only if chosen instead)

1. B7: create the project + billing + GCS state bucket. B8: Cloudflare zone/token.
2. `cd infra/terraform && cp terraform.tfvars.example terraform.tfvars` (`project_id`, `region`, `domain`, `cloudflare_*`, `github_repository`) → `terraform init -backend-config="bucket=<state>"` → `plan` → `apply`.
3. **Before the first deploy**, extend `infra/terraform/gcp.tf`/`variables.tf` so Cloud Run gets `SMS_PROVIDER`, `NALO_*`, `PAYMENTS_PROVIDER`, `PAYSTACK_WEBHOOK_SECRET`, `STORAGE_PROVIDER=s3`, `S3_*` (R2), `SMTP_*`, `REALTIME_URL`. Add a version to every secret in Secret Manager (including unused `STRIPE_SECRET_KEY`/`FLUTTERWAVE_SECRET_KEY`, which can hold a placeholder).
4. GitHub repo secrets for `.github/workflows/deploy.yml`: `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_SERVICE_ACCOUNT`, `GCP_PROJECT_ID`, `GCP_REGION`, `STAGING_DATABASE_URL`, `PROD_DATABASE_URL`. Create GitHub environments `staging` and `production` (with required reviewer).
5. Push to `main`, which deploys staging (needs **C8** `/api/v1/health` or the smoke step fails). Then run `workflow_dispatch target=production`.

---

## 4. App store checklist

### 4a. Google Play (GrandPrice, `com.stall.grandprice`)

- [ ] Create the **upload keystore**: `keytool -genkey -v -keystore upload-keystore.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload`. Write `mobile/android/key.properties` (see `key.properties.example`, gitignored). Back up both off-machine. Without it, the build silently signs with the **debug** key (`build.gradle.kts`).
- [ ] Enrol in **Play App Signing** (Google holds the app key; you keep the upload key).
- [ ] Build: `flutter build appbundle --release --flavor grandprice --dart-define=STALL_PLATFORM=grandprice --dart-define=STALL_API_URL=https://api.<domain> --dart-define=STALL_REALTIME_URL=https://rt.<domain> --dart-define=STALL_MEDIA_URL=https://media.<domain>/stall-media`
- [ ] Bump `version:` in `mobile/pubspec.yaml` per upload. Keep `app.min_version` (AppConfig, seeded 1.0.0) in step.
- [ ] Target API level = current Play requirement (`targetSdk = flutter.targetSdkVersion`; check the Flutter SDK version meets it).
- [ ] App size: ffmpeg `_min` `.so`s are large. Upload an AAB so ABI splits apply.
- [ ] Store listing: icon 512², feature graphic 1024×500, ≥2 phone screenshots, short and full description, category Shopping, support email, **privacy policy URL** (C11).
- [ ] **Account deletion URL** (web page) + in-app path (C5).
- [ ] Content rating questionnaire: marketplace with user-generated content (listings, reviews, chat), user-to-user communication = yes, location sharing = yes (courier), no gambling (draw off). Expect "Everyone/PEGI 3 with users interact".
- [ ] Ads declaration: **No** (no ad SDK; in-house sponsored listings are off).
- [ ] Testing: closed track with ≥12 testers for 14 days if the developer account is a new personal account (current Play rule for personal accounts).

**Data-safety form** (derived from code):

| Data type | Collected | Shared | Purpose | Optional? | Source |
|---|---|---|---|---|---|
| Phone number | Yes | With SMS provider (processor) | Account management, fraud prevention | Required | `auth/otp` |
| Name, email | Yes | No | Account | Optional | `me/profile`, email sign-in |
| Precise location | Yes | Yes. Shown to customer/courier during a delivery | App functionality (delivery, nearby) | Optional for buyers, required for couriers | `core/location.dart`, realtime tracking |
| Photos/videos | Yes | Public (listings, avatars) | App functionality | Optional | `media/upload` |
| Government ID / selfie (KYC) | Yes | No (staff review) | Fraud prevention, compliance | Required to sell/courier | `KycDocKind` |
| Audio (voice search) | Processed on-device speech → text | No | App functionality | Optional | `RECORD_AUDIO`, `voice_search_dialog.dart` |
| Financial info: purchase history | Yes | Payment processor | App functionality | Required for purchases | orders/ledger |
| Payment info | Handled by Paystack (no PAN stored after C4) | Paystack | Payments | n/a | n/a |
| Payout details (bank / MoMo number) | Yes | Payment processor | Payouts | Sellers/couriers | `PayoutMethod` |
| Messages (chat) | Yes | Other party only | App functionality | Optional | `chat` |
| App interactions / recently viewed | Yes | No | Personalisation, analytics | n/a | `me/recently-viewed`, `AdEvent` |
| Crash logs / diagnostics | Yes if Sentry set | Sentry (processor) | Diagnostics | n/a | `observability.ts` |
| Device IDs / sessions | Yes | No | Security (sessions, login activity) | n/a | `auth/sessions` |

Encrypted in transit: **yes** (HTTPS only in release). Users can request deletion: **yes** (C5).

### 4b. Apple App Store (phase 2)

- [ ] Apple Developer Program (organisation account needs a D-U-N-S number, which takes days). Note the Team ID.
- [ ] **Bundle IDs are inconsistent:** iOS is `com.grandprice.grandprice` (`ios/Runner.xcodeproj`), Android is `com.stall.grandprice`. Pick one scheme (suggest `com.stall.grandprice` / `com.stall.tizzigas`) before the first upload. It can't change later.
- [ ] iOS flavors/schemes for tizzigas (manual Xcode step, `08-HARDENING.md` §7).
- [ ] **Deployment target:** pbxproj says `12.0`. `ffmpeg_kit_flutter_new_min` needs ≥14.0, and google_mlkit plugins currently need ≥15.5. Set the Runner + Podfile platform to 15.5 and verify with `pod install`.
- [ ] **Usage strings** in `ios/Runner/Info.plist`. Present: Microphone, Speech, Camera (barcode only). Missing: `NSPhotoLibraryUsageDescription` (listing/avatar/KYC photo pick), `NSLocationWhenInUseUsageDescription` (nearby, delivery, courier). Extend the camera string to cover listing/KYC photos.
- [ ] Sign in with Apple: only required if any other social login ships (deferred, so not needed).
- [ ] No IAP needed for physical goods/delivery (guideline 3.1.3(e)). Keep advertising/boost **off** on iOS. Keep the draw off (§5.3).
- [ ] Privacy nutrition labels: mirror the Play table. Account deletion in-app (5.1.1(v)).
- [ ] **Review notes + demo account:** login is SMS OTP only and there is no bypass in `auth/otp/route.ts`. Options: (a) give reviewers a real number you control and answer within the review window (fragile); (b) **recommended:** add an allow-listed reviewer phone (env, e.g. `REVIEW_PHONE` + fixed `REVIEW_OTP`) accepted only for that number. Provide a demo buyer account with a saved address, plus a demo vendor. Explain that couriers/KYC need ID upload. The same applies to Play's "App access" section.

---

## 5. Day-1 operations

### 5.1 Admin bootstrap (no script exists, so do it once by hand)

The console (`https://api.<domain>/admin`) logs in by **SMS OTP + TOTP** (`ADMIN_2FA_REQUIRED`
default true, `apps/api/app/admin/actions.ts`). It accepts any user with an ACTIVE `STAFF` or
`ADMIN` role (`apps/api/src/admin/session.ts`). The seed creates no admin.

1. Sign up in the app with your phone (creates `users` row).
2. Grant ADMIN:
   ```sql
   -- docker compose … exec postgres psql -U stall -d stall
   INSERT INTO user_roles (id, "userId", role, status, "kycStatus", "activatedAt", "createdAt", "updatedAt")
   SELECT 'bootstrap-admin', id, 'ADMIN', 'ACTIVE', 'NONE', now(), now(), now()
   FROM users WHERE phone = '+233XXXXXXXXX'
   ON CONFLICT ("userId", role) DO UPDATE SET status = 'ACTIVE';
   ```
3. In the app: **Security Centre → enable 2FA** (scan the TOTP into an authenticator, store the recovery codes).
4. Log in to `/admin`. Add support staff later with the same SQL using role `STAFF`. (Worth turning into a `packages/db/scripts/grant-role.ts`.)

### 5.2 Daily operating loop

| Task | Where | Cadence |
|---|---|---|
| KYC review: vendors (Sell on Stall) and couriers. Check ID front/back + selfie + business reg; approve or reject with a reason | `/admin/kyc` → `[id]` | 2× daily at launch. Sellers can't publish until approved (`kyc.required=true`) |
| Product review queue | `/admin/product-review` | daily |
| Disputes: respond inside `DISPUTE_SLA_HOURS` (72 h); appeals window 7 d | `/admin/disputes` | daily; follow `runbooks/dispute-surge.md` |
| Payouts: until C3 is real, pay vendor/courier withdrawals manually by MoMo/bank and record the reference | n/a (C3) | 2×/week, published schedule |
| Safety: suspensions, reports, blocks | `/admin/users`, audit log | as needed |
| Broadcasts (outage, promos) | `/admin/broadcasts` | as needed |
| Check Sentry, uptime alerts, `docker compose logs --since 24h worker \| grep -i error` | n/a | daily |
| Backups verified (dump file size/date) + monthly restore drill | VPS cron | daily / monthly |
| Support: one support email + WhatsApp number, listed in the store and the help centre | `support_screen.dart` | daily |

Seed supply before announcing: onboard 10–30 real vendors yourself (KYC approved, listings
reviewed) and 5–10 couriers in one city (Accra; `AUCTION_WAREHOUSE_*` and pricing rows default to GH).

---

## 6. Known risks & open decisions

| # | Risk / decision | Recommendation |
|---|---|---|
| D1 | **Inverse Draw legality** (paid entry + random winner) | Off at MVP. Get a Ghana gaming-law opinion. If you redesign it, consider a free-entry route or skill-based qualification |
| D2 | Payments provider | **Decided S64: Flutterwave** (hosted card page + in-app MoMo/OPay/Apple Pay/Google Pay/bank). Paystack adapter removed |
| D3 | Payouts: manual vs Paystack Transfers | Manual at MVP (low volume, fraud control); automate when volume demands it |
| D4 | Hosting: self-host VPS vs GCP | VPS (`selfhost/`). Revisit at ~10k DAU or when you need HA |
| D5 | Courier offers missed when the app is backgrounded (no FCM) | Accept for a single-city pilot with a small courier pool; FCM (B6) is the first post-launch item |
| D6 | Public media bucket exposing KYC docs if misconfigured | Policy by prefix only, or move KYC to a private bucket + signed URLs |
| D7 | OSRM demo server / CARTO tiles terms | Unset `OSRM_URL` (haversine) or self-host; confirm the tile provider plan |
| D8 | Reviewer access with OTP-only login | Add an allow-listed review number (4b) |
| D9 | Never device-tested (S61 aapt2 deadlock on the dev PC) | Fix the Defender exclusions or build in CI/another machine; full tap-through is a hard gate |
| D10 | Legacy gas app still calls `apps/api/app/api/[...api]/route.ts` (auth shim, else 410) | Decide whether the old Tizzi Gas app is live; if so, keep the shim and plan a forced update via `app.min_version` |
| D11 | Referral rewards are cash-like | `REFERRAL_REWARD_MINOR=0` at launch; enable with caps later |
