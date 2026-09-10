# Phase 8 — Hardening & cloud

Status at S14: **code-complete for everything buildable without cloud credentials.**
The GCP project + Cloudflare zone (blockers **B7 / B8**) and a real OTLP collector +
Sentry project are the only things between this and a running staging environment.

---

## 1. Security review

A focused pass over the Phase 7/8 surface (`ads`, `analytics`, `referrals`, `admin`
console, `privacy`) plus a re-check of the money paths. Findings + fixes:

| # | area | finding | fix |
|---|---|---|---|
| S1 | `ads.settleCampaign` | a retry after a partial failure (release done, refund threw) could re-release spend into REVENUE → double-booking | flip the campaign to its terminal state **first**, guarded by `updateMany({ where: { status: current } })`; a retry hits the early return. Stuck-in-escrow is now the only failure mode, and it's detectable via the escrow reconciliation query (see `runbooks/payment-outage.md`). |
| S2 | `ads.chargeBudget` | `campaign.paymentIntentId` was set **after** the money-moving tx; a crash in between left funds in escrow that `settleCampaign` would never refund (`charged=false`) | move the `paymentIntentId` write **inside** the same `$transaction`. |
| S3 | `POST /ads/events` (`auth:false`, CPC billing) | repeat CLICK/CONVERSION from one viewer could drain a competitor's budget | de-dup billable events per `(kind, campaignId, adId, sessionId|ip)` for 90 s in Redis; impressions are not de-duped. Cloudflare rate-limit + Turnstile are the frontline (`infra/terraform/cloudflare.tf`). Marginal cost is still clamped to the remaining budget. |
| S4 | `privacy.anonymiseUser` | `phone` is `@unique`; a short-slice tombstone value risked a collision that aborts (and infinitely retries) the deletion | tombstone with the full id: `phone = "deleted:<userId>"`. |
| S5 | admin console session | — | verified: `httpOnly` + `secure` (prod) + `sameSite=lax`, `path=/admin`, own JWT audience `stall-admin`, TTL from `ADMIN_SESSION_TTL_HOURS`; STAFF/ADMIN role checked on **every** page + server action via `requireAdmin()`. Next server actions carry built-in same-origin enforcement. Login reuses the OTP flow (cooldown + attempt lockout). |
| S6 | `admin.findUsers` / `userDetail` | returns phone + email of any user | accepted — it's an ops tool gated to STAFF/ADMIN; every mutating action is `audit`-logged. |
| S7 | `exportMyData` | — | returns only `ctx.principal.userId`'s data; rate-limited 3/hour/principal; `audit`-logged. |

Every new `/api/v1` route goes through `withApi` → RBAC + capability gate + rate-limit +
`Idempotency-Key` on writes + `AuditLog` on sensitive actions. The advertising routes are
`capability: "advertising"` (already OFF for `tizzi-gas`). DTOs were reviewed for PII: the
sponsored-card + analytics payloads carry no user identifiers.

**S17 update:** a full `security-review` skill sweep of the entire surface at the time (7
parallel domain-scoped passes — auth, payments/wallet/ledger, admin console,
delivery/realtime, auctions, chat/trust, catalog/ads/privacy) found 13 confirmed fixes:
webhook HMAC-gating + no FAILED→SUCCEEDED resurrection, atomic status-guards on
`completeVendorOrder`/`cancelOrder`, a `postTxn` WALLET-debit TOCTOU overdraft fix,
ad-event dedup moved off client-supplied `sessionId`, a new `requireSuperAdmin()` gate on
the sensitive admin actions, closed the legacy `_compat` 2FA bypass, DB-revocable admin
sessions, a delivery-reschedule IDOR fix, dispute party-check + `againstId` correctness,
chat `typing` entitlement, draw-seed pre-`completedAt` leak, and auction-qualification
score capping/dedup/status-gating. See `PROGRESS.md` Session 17 for the full list.

**S32 update:** a targeted re-review of everything shipped in S27–S31 (returns/refunds,
vendor payouts, invoice PDFs, storage, observability, self-host infra, real FCM push) —
scoped to the new surface rather than re-walking the whole branch. One confirmed finding
(8/10): `requestReturn` had no transaction/lock/unique-constraint guarding its
read-check-create, so two concurrent return requests for the same item could both create a
`REQUESTED` row and a vendor approving both would trigger two real refunds for one
returned item. Fixed with a `Serializable` transaction around `requestReturn`, plus an
aggregate re-check inside `reviewReturn` at approval time as defense in depth (rejects an
approval that would over-refund against every *other* non-rejected return on the same
sub-order). Everything else checked (payout/invoice ownership scoping, `guardNonNegative`
atomicity, `storage/mock.ts` path-traversal handling, Sentry context scrubbing, the WIF
`attribute_condition` repo scope, FCM key/payload handling) held up clean. See
`PROGRESS.md` Session 32.

Not yet done (tracked): an external pen-test checklist — scheduled for the pre-launch gate
once staging is up. Each new feature area still needs its own review as it ships; this
file should keep growing rather than being treated as a one-time gate.

## 2. Observability

**Real SDKs now (S29)** — this section previously described a dependency-free hand-rolled
shim (its own docstring called it a no-op stub) with zero test coverage; "wired" overstated
what existed. `@stall/core/observability.ts` — one bootstrap, called at the top of
`apps/{api,realtime,worker}` and from `withApi`'s unhandled-error path.

- **Tracing**: real spans via `@opentelemetry/api`'s stable global tracer — `withSpan()`
  always creates one (a harmless no-op tracer when nothing is registered, by OTel API
  design). `Sentry.init()` owns the global tracer-provider registration (Sentry v8+ is
  built on OTel internally); a generic OTLP/HTTP `BatchSpanProcessor` is plugged into it via
  `openTelemetrySpanProcessors` when `OTEL_EXPORTER_OTLP_ENDPOINT` is set. (Deliberately not
  a second independent `NodeTracerProvider` — two SDKs racing to register the global
  provider only lets one win, the OTel API drops the loser with a warning.)
- **Errors**: `captureError()` forwards to `@sentry/node`'s real `Sentry.captureException`
  (unconditionally — safe pre-init and with no DSN, per the SDK's own documented no-op
  behavior) instead of a hand-rolled `fetch()` POST to Sentry's legacy ingest endpoint.
- **Scrubbing**: keys matching `/token|secret|password|pin|authorization|cookie/i` are
  stripped before anything leaves the process (span attributes and Sentry `extra` both).
- Env: `OTEL_*`, `SENTRY_*` in `packages/config/src/env.ts` (all optional) — `SENTRY_DSN`
  and `OTEL_EXPORTER_OTLP_ENDPOINT` stay independently controllable.
- **Tested**: `packages/core/test/observability.test.ts` registers an `InMemorySpanExporter`
  and asserts on real captured spans (name, scrubbed attributes, OK/ERROR status, recorded
  exceptions) and on `Sentry.captureException` call args — 4/4 green. Also manually booted
  `apps/worker` + `apps/realtime` both unconfigured and with fake OTEL/Sentry env values to
  confirm neither path crashes at runtime (not live-verified against a real collector/Sentry
  project — no such infra available this session).

Dashboards + alert routing: `docs/runbooks/on-call.md`.

## 3. Load tests

`infra/loadtest/{checkout,dispatch,tracking}.js` (k6). Thresholds + tuning knobs in
`infra/loadtest/README.md`. Run against **staging** before any launch-scale event.

## 4. Infrastructure as code

**Two deploy paths now (S30): GCP (below) and self-hosted (primary — see next).** Locked
S30: production runs **self-hosted** (a VPS + docker-compose + Cloudflare) rather than GCP, to
avoid Cloud Run/Cloud SQL/Memorystore's always-on billing at a scale this app doesn't need it
for — see `infra/terraform/selfhost/README.md` for the full rationale + deploy flow. The GCP
path below stays in the repo as an alternative, not deleted.

`infra/terraform/` — GCP (Artifact Registry, Cloud SQL PG16 + PITR + PostGIS, Memorystore
Redis, 3× Cloud Run, Secret Manager, VPC connector, Cloud Scheduler, IAM, Workload Identity
Federation for keyless CI/CD auth — `wif.tf`, S29) + Cloudflare (DNS, managed WAF,
auth/checkout rate-limit, cache-bypass for `/api`, Turnstile, R2).
`terraform validate`-clean; `apply` needs B7/B8.

**Self-hosted (S30):** `infra/docker/docker-compose.prod.yml` runs the whole stack on one
VPS — Postgres+PostGIS, Redis, MinIO (S3-compatible, no R2/GCS needed), Meilisearch, and the
three app services built from the *same* `Dockerfile.{api,realtime,worker}` the GCP path uses
(so there's exactly one set of container images, not two deploy-path-specific builds), fronted
by Caddy for automatic HTTPS. `infra/terraform/selfhost/` is a separate, GCP-independent
Terraform module (local state, no `google`/`google-beta` provider) that only provisions the
Cloudflare side — DNS A/AAAA records pointed at the VPS IP instead of a Cloud Run hostname, plus
the same WAF/rate-limit/cache/Turnstile rules as the GCP path's `cloudflare.tf` (copy-adapted,
not reinvented). `terraform validate`/`fmt -check` clean; `docker compose ... config` clean
(both checked with the real binaries, not just read-through). Not live-deployed anywhere this
session — no VPS or Cloudflare zone available to apply against.

`infra/docker/Dockerfile.{api,realtime,worker}` + `.dockerignore` — multi-stage pnpm
workspace builds; `start:prod` scripts added to each service (no `dotenv` prefix — env
comes from Cloud Run).

## 5. CI/CD

`.github/workflows/deploy.yml` — reuses `ci.yml` as the gate, then: build + push
`sha-<12>` images → `prisma migrate deploy` (staging) → deploy **no-traffic** revisions →
shift traffic → smoke-test `/health`. Production is a gated `workflow_dispatch` with a
manual approval on the `production` environment and an automatic traffic-rollback if the
post-deploy health check fails. Keyless auth via Workload Identity Federation (`infra/terraform/wif.tf`).

**S29 fix**: the `gate: uses: ./.github/workflows/ci.yml` reusable-workflow call was broken —
`ci.yml` had no `workflow_call:` trigger, so GitHub Actions couldn't resolve it (a parse/run-time
failure on the very first push to main, unrelated to secrets). Fixed by adding the trigger. Also:
the WIF pool/provider `deploy.yml` needs (`GCP_WORKLOAD_IDENTITY_PROVIDER`,
`GCP_SERVICE_ACCOUNT`) didn't exist in terraform at all — "needs GCP WIF secrets" understated
the gap. `infra/terraform/wif.tf` now authors both, scoped to one GitHub repo via
`attribute_condition` (a security-relevant detail — without it any GitHub repo could impersonate
the deploy service account) — see §4.

## 6. Data protection (GDPR / CCPA)

`@stall/core/privacy` + `AccountDeletionRequest` (migration `20260902074802`):

- `GET /api/v1/me/data-export` — portable JSON bundle (profile, orders, wallet txns,
  addresses, reviews, deliveries, referrals). Rate-limited 3/hour.
- `POST/GET/DELETE /api/v1/me/account/deletion` — request enters a **cancellable grace
  period** (`ACCOUNT_DELETION_GRACE_DAYS`, default 14); blocked while orders are open.
- Worker `privacy-sweep` (hourly): past the grace period → anonymise PII (phone tombstoned,
  email/name/avatar nulled, credentials/devices/social/OTP/login-activity deleted, addresses
  scrubbed in place since orders reference them, reviews redacted), revoke every session +
  bump `TokenEpoch`, tombstone vendor/courier profiles, `status = BANNED` + `deletedAt`.
  **Retained** (legal/accounting, stripped of PII): orders, ledger entries, invoices, payouts.
- `AUDIT_LOG_RETENTION_DAYS` (default 365) — daily prune at 03:00 UTC.
- Breach playbook: `docs/runbooks/disaster-recovery.md` §breach (72h notification clock).

Covered by `packages/core/test/privacy.test.ts` (export, request→cancel, full anonymise).

## 7. Flutter release

**Maps: OpenStreetMap tiles, not Google Maps (S30).** `google_maps_flutter` needs a native API
key wired into `AndroidManifest.xml`/the iOS `AppDelegate` to render at all — confirmed neither
was ever added, so the 3 map screens (nearby-vendors, delivery tracking, courier
active-delivery) were very likely rendering blank/gray maps in practice (not verified on a
real device this session, but this is documented Google Maps SDK behavior with no key) — a
real bug this also fixes incidentally. Replaced with `flutter_map` +
`latlong2` behind a new `AppMap`/`AppMapMarker`/`AppMapPolyline` abstraction
(`mobile/lib/design/app_map.dart`) — no API key, no per-load billing, matching the self-host
cost story. Tile source is a `MAP_TILE_URL_TEMPLATE` dart-define, defaulting to CartoDB's free
Voyager basemap (deliberately not `tile.openstreetmap.org` — their usage policy disallows
heavy/commercial use without self-hosting); swap to a self-hosted tile server later via the
same define, no call-site changes. `flutter analyze` 0/0, `flutter test` 39/39, and a real
`flutter build apk` for both flavors — both succeeded.

**Android flavors (S28) + release-signing plumbing are real now** — the earlier "flavors
already exist" claim here was wrong; there was no native flavor config at all, only a
`--dart-define=STALL_PLATFORM=…` Dart constant, which can't produce two separately-listable
Play Store apps (distinct `applicationId`/name) on its own. `mobile/android/app/build.gradle.kts`
now defines `grandprice` (`com.stall.grandprice`) and `tizzigas` (`com.stall.tizzigas`) product
flavors with per-flavor `app_name` string resources
(`android/app/src/{grandprice,tizzigas}/res/values/strings.xml`), and a `key.properties`-driven
release `signingConfig` (see `android/key.properties.example`) that falls back to the debug
keystore when the file is absent, so `flutter build --release` keeps working before real signing
secrets exist. **The flavor and the dart-define must be passed together and kept in sync** — they
aren't linked automatically:
```
flutter build appbundle --flavor grandprice --dart-define=STALL_PLATFORM=grandprice
flutter build appbundle --flavor tizzigas  --dart-define=STALL_PLATFORM=tizzi-gas
```
Not yet done: distinct per-tenant app icons (no Tizzi Gas icon artwork exists yet — a design
task, not a code one; both flavors currently share the GrandPrice icon), and the iOS equivalent
(Xcode scheme/xcconfig duplication — a manual Xcode-GUI step, not something safely hand-edited
into `project.pbxproj` without Xcode available to verify it).

Crash reporting: `firebase_crashlytics` is **not wired** — unlike the storage/payments mock
pattern, Firebase's native Gradle/Xcode plugins require a real `google-services.json` /
`GoogleService-Info.plist` at build time or the native build fails outright; there's no safe way
to stub this without an actual Firebase project (B6). Staged rollout via the Play Console / App
Store Connect phased release — manual, not automated in CI (needs signing secrets + store
credentials).

## 8. Exit criteria

| criterion | state |
|---|---|
| security-review pass on the whole surface | **partial** — Phase 7/8 surface + money paths done (§1); full-surface skill sweep pending staging |
| OTel traces + Sentry error capture in all 3 services | **real SDKs, tested** (§2, S29); needs a real collector endpoint / Sentry project to see live data |
| Load tests on dispatch + tracking + checkout | **authored** (§3); run needs staging |
| Terraform GCP + Cloudflare + WIF for keyless CI/CD auth | **authored, validate-clean** (§4, WIF added S29); apply needs B7/B8 |
| Self-hosted deploy (docker-compose.prod.yml + Cloudflare) — **primary path (S30)** | **authored, validate-clean** (§4); apply needs a VPS + Cloudflare zone |
| CI/CD staging (auto) + prod (gated) + migrate job + rollback | **authored, test-gate bug fixed** (§5, S29 — `ci.yml` had no `workflow_call` trigger so `deploy.yml`'s gate job couldn't resolve); needs the GCP project the new WIF resources deploy into |
| Backups + PITR + DR runbook + GDPR delete pipeline | **done** — pipeline shipped + tested (§6), DR runbook written |
| Flutter release builds + store listings | **Android flavors + signing plumbing real & build-verified (§7, S28)**; iOS + store work is manual |
| Runbooks | **done** — `docs/runbooks/` (on-call, incident, deploy-rollback, payment-outage, dispatch-degradation, dispute-surge, disaster-recovery) |
