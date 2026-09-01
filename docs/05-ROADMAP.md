# STALL — EXECUTION ROADMAP

Phased plan. Each phase has a **goal**, a **checklist**, and **exit criteria** that must all be
true before the next phase becomes ACTIVE in `PROGRESS.md`. Cross-cutting requirements at the
bottom apply to *every* phase.

Phases are scoped so a cleared session can pick up one checklist item at a time.

---

## Phase 0 — Foundation

**Goal:** Monorepo, upgrades, local infra, pipelines. No product features yet.

- [x] `pnpm-workspace.yaml` + `turbo.json`; root `tsconfig.base.json` (extends, not project refs — `workspace:*` + `exports` instead).
- [x] `git mv` Next.js app → `apps/api/`; `@/` alias kept, `next.config` + flat `eslint-config-next`.
- [x] Upgrade Next.js 15.4 → **16.3.4**; React 19.2; Turbopack; `typedRoutes`.
- [x] `packages/db`: moved `prisma/`; Prisma 6 → **7.10.0** (`prisma-client` generator, ESM, `@prisma/adapter-pg` + `prisma.config.ts`). PostGIS extension migration → **deferred to Phase 1** (lands with schema v2; needs live DB).
- [~] `bcryptjs` → `argon2` — **deferred to Phase 1** (with the auth rebuild; `bcryptjs` only in `lib/utils.ts`, unused by OTP flow).
- [x] `packages/config`: zod `env.ts`. Wiring into `apps/api` (replace direct `process.env`) → Phase 1.
- [x] `infra/docker/docker-compose.yml`: postgres+postgis 16, redis 7, minio+bucket-init, mailpit, meilisearch(profile). Root `.env.example`.
- [x] `apps/realtime` skeleton (Fastify + socket.io + 4 namespaces + `/health`); `apps/worker` skeleton (BullMQ `outbox-relay` + `/health`).
- [x] `packages/tokens`: `tokens.json` (measured) + zero-dep `build.mjs` → `dist/tokens.ts`, `dist/tokens.css`, `mobile/lib/design/tokens.g.dart`. (Style Dictionary = later if needed.)
- [x] `packages/contracts`: zod envelope + route registry → `openapi.json` (zod v4 `z.toJSONSchema`). Full param generator + Dart client → Phase 1.
- [x] `mobile/`: `flutter create --empty`; riverpod, go_router, dio, font_awesome_flutter, google_maps_flutter; `AppTheme` from `tokens.g.dart`; `lib/{app,design,features,api,core}`; smoke test.
- [x] `.github/workflows/ci.yml`: node (install → prisma generate → `pnpm -r build` → `pnpm -r typecheck` → api lint) + flutter (analyze + test) + docker-config.
- [x] Repo cleanup: 9 legacy `.md` → `docs/legacy/`; removed `package-lock.json`, stale `.next`; `.gitignore` + `.gitattributes` rewritten. (`next.svg`/`vercel.svg` still under `apps/api/public` — trim in Phase 2 when the marketing page is redone.)
- [x] `docs/` committed (this corpus).

**Exit — MET:** ✅ `pnpm -r build` · ✅ `pnpm -r typecheck` · ✅ `@stall/api` lint (0 err) ·
✅ `flutter analyze` · ✅ `flutter test` · ✅ `prisma migrate deploy` · ✅ api :3000 +
realtime :3001 + worker :3002 booted & health-checked · ✅ DB-backed request returns real
data · ✅ email round-trip. Verified on **both** the Docker compose stack (S5 —
Postgres+PostGIS 3.5, Redis, MinIO+bucket, Mailpit healthy; image tags pinned) **and** the
no-Docker fallback (S4). CI green on the PR still pending push.

---

## Phase 1 — Identity & platform core

**Goal:** Multi-role auth + the capability system. MD §02, §32.

- [x] Schema v2 Domain 0 (Platform/FeatureFlag/…) + Domain 1 (identity, relational `UserRole`) + Domain 2 profiles; baseline migration `20260901191354_init` (+ PostGIS extension + 5 GiST indexes); seed (`grandprice`, `tizzi-gas`, 12-flag registry, per-platform gating). *Gas `Category` deferred to Phase 2 (Domain 3).* Legacy `{action}`-RPC services archived; catch-all route → `410`.
- [x] `@stall/core` + `apps/api/src/auth`: OTP (phone via SMS port / email via Mailpit), access JWT (`jose` EdDSA, `TokenEpoch`-aware), rotating refresh + **family reuse-detection**, session/device list + revoke, role switch. `/api/v1/auth/{otp,verify,refresh,logout,sessions,switch-role}`. argon2 via `@node-rs/argon2`. **curl-verified.** *(social sign-in · TOTP 2FA · transaction PIN — still to do.)*
- [x] `@stall/core/platform`: capability resolver (`platform ∩ role ∩ region ∩ user-override`) + `GET /api/v1/config/bootstrap` (features + role `nav` + theme + minAppVersion). Verified: gating differs grandprice vs tizzi-gas.
- [x] Middleware: `withApi(opts, handler)` wrapper — Zod body/query, `auth`/`Role` guard, `capability` gate, Redis fixed-window rate-limit, `Idempotency-Key` replay (`IdempotencyKey` table), `AuditLog` write, envelope + error mapping. All 12 `/api/v1` routes use it.
- [x] Auth extras: **TOTP 2FA** (`/api/v1/auth/2fa`, recovery codes, login MFA gate), **transaction PIN** (`/api/v1/auth/pin`, argon2id + lockout), **password**, **social sign-in** (`/api/v1/auth/social` — Google/Apple JWKS via `jose`, Facebook Graph).
- [x] `_compat` shim: `apps/api/app/api/[...api]` bridges `auth.send-otp`/`verify-otp`/`refresh-token`; other legacy actions → `410`.
- [x] `_compat` RPC shim for existing `auth.*` gas-app actions.
- [x] Exit gate: `GET /api/v1/auctions/ping` (`capability: "auction"`). **Vitest** integration suite (9 tests, live DB): refresh rotation + reuse-detection + token-epoch bump + capability gate 200/403/401.
- [x] Contracts: auth + config schemas → OpenAPI. `packages/contracts/src/auth.ts` (Zod, 14 ops) → `openapi.json` (real paths/params/bearer/error envelope). Dart client is **hand-written** in `mobile/lib/api/` (dio wrapper + models), not generator-emitted.
- [x] Mobile: splash, onboarding ×3, welcome (+social), phone/email OTP request, OTP entry (resend countdown + TOTP challenge), dedicated social, forgot/reset/create password, account recovery, select-role + role-switcher sheet, signed-in devices (revoke / sign-out-everywhere), security alert, account suspended/disabled (screens 1–20). `AppBottomNav` rendered from `bootstrap.nav`; `HomeShell` account tab wires 2FA/PIN/password/logout. `go_router` redirect + Riverpod `AuthController`; tokens in `flutter_secure_storage`; one-shot refresh on 401. `flutter analyze` 0 · `flutter test` 5.

**Exit:** New user registers via phone OTP on the Flutter app → receives access+refresh →
switches between Customer/Vendor/Courier roles → `bootstrap` returns different `features` for
`grandprice` vs `tizzi-gas` → a sample auction endpoint returns `403 FEATURE_DISABLED` under
`tizzi-gas`. Refresh rotation + reuse-detection covered by integration tests.

> **Status (S8): CODE-COMPLETE.** Backend gates 200/403 by platform; rotation + reuse-detection
> + epoch bump covered by Vitest (`pnpm test`, 9 green). The Flutter register → role-switch →
> gated-screen flow is fully implemented and analyze/test-green. Outstanding: a single
> emulator/device run against the live API for final sign-off (tracked in PROGRESS NEXT ACTIONS).

---

## Phase 2 — Catalog, vendors, search, discovery

**Goal:** Browse and sell. MD §03, §04, §05, §23 (profile basics), §25 (vendor catalog parts).

- [ ] Schema v2 Domain 3 (catalog) + `GasCylinderListing`; migrate gas vendors/products into `VendorProfile`/`Business`/`Product`/`VendorOffer`.
- [ ] `catalog` module: categories (tree), products/variants/media, vendor offers (multi-vendor), inventory, reviews/Q&A, wishlist, recently-viewed, reports.
- [ ] Search: Postgres FTS + trigram; filters/sort/price/location/vendor/condition (MD §04); nearby vendors/products via PostGIS `ST_DWithin`.
- [ ] `vendors` module: vendor onboarding + `Business` KYC (`KycCase`), product creation wizard, drafts, publish, product performance stub.
- [ ] Promotions: flash deals, campaigns, banners (read side); sponsored/boosted card data (write side is Phase 7).
- [ ] Contracts + Dart client for catalog/search/vendor.
- [ ] Mobile: customer home + personalized home, category explorer/all/products, trending/recommended/new/top/flash, nearby products & **Nearby Vendors map**, recently viewed, saved, featured/sponsored vendors, promos (screens 21–40); global search + active + results + suggestions + recents + trending + filters + sort + empty/error (41–59); product details + gallery + fullscreen + video + specs + description + reviews + questions + variants + availability + seller + vendor products + similar + share + report + wishlist + add-to-cart + buy-now + unavailable/loading (60–80); vendor onboarding + dashboard + products + add/edit product wizard + drafts (subset of 435–462).

**Exit:** On both platforms a customer can browse categories, search, filter by location, open a
product with multiple vendor offers, and view a vendor page; a vendor can register, pass
business KYC (mock reviewer), and publish a product; **all existing Tizzi Gas listings are
visible and orderable-shaped** under `catalog.scope='gas'`.

---

## Phase 3 — Cart, checkout, orders, payments, wallet

**Goal:** Take money, create orders. MD §06, §07, §19, §20.

- [ ] Schema v2 Domain 4 (cart/orders) + Domain 6 (ledger/payments/wallet).
- [ ] `cart` (multi-vendor grouping, save-for-later), `coupons` (validate/apply/limits), address book.
- [ ] `checkout`: quote (fees: subtotal/discount/coupon/delivery/service/tax/total), fulfilment method selection, `Idempotency-Key` enforced.
- [ ] `payments`: `PaymentGateway` port + **Paystack/Flutterwave sandbox** adapter (GHS, MoMo) + Stripe adapter; `PaymentIntent`/`Payment`/`PaymentMethod`.
- [ ] `wallet`: double-entry `LedgerAccount`/`LedgerEntry`/`LedgerTxn`; wallet top-up, transactions feed, transaction PIN gate; escrow → release-on-completion flow.
- [ ] `orders`: `Order`/`VendorOrder`/`OrderItem`/`Fulfilment`/`OrderEvent`; cancel, return, exchange, refund, invoice, order issue.
- [ ] Retire `_compat` shim for `order.*`, `vendor.nearby` (gas app now on generated client).
- [ ] Mobile: cart + empty + item detail + multi-vendor/vendor-grouped + quantity + save-later + coupon apply/select + address select/add/edit + delivery method/speed + courier estimate + pickup + order summary + payment method/add + processing/failed/success + confirmation (81–103); orders list/active/completed/cancelled + details + items + vendor order + fulfilment + timeline + cancel + return/exchange/refund + refund status + issue/report + reorder + invoice/receipt + support (104–123); wallet + balance + transactions + deposit + withdrawal + payment methods + transaction detail + refunds + PIN + verification (339–356); coupon center + available + mine + detail + terms + apply + applied + expired/invalid + promo detail + referral rewards + history (357–368).

**Exit:** A customer places a **paid multi-vendor order** in the payment sandbox; funds land in
escrow; each `VendorOrder` completion releases vendor payout (minus commission) and platform
revenue via balanced ledger entries; a refund reverses correctly; wallet top-up + PIN-gated
action work.

---

## Phase 4 — Delivery, courier, realtime, maps

**Goal:** The Bolt/Uber-style delivery network. MD §08–§16, plus the map screens we own.

- [ ] Schema v2 Domain 5 (delivery/courier ops).
- [ ] `couriers`: onboarding, unified `KycCase` (ID front/back, selfie/liveness), vehicles + docs, service-area polygons, availability schedule, online/offline, performance metrics.
- [ ] `delivery`: creation from `Fulfilment`; **dispatch engine** (Redis GEO shortlist → ranked `DeliveryOffer` waterfall with timeout); `DeliveryJob` marketplace (pre-acceptance PII masking); active-delivery **state machine** (all transitions → `DeliveryEvent` + `OutboxEvent`); pickup verification (OTP/QR/photo/count/condition); delivery verification (OTP/QR/signature/POD photo); ratings; reassignment/reschedule/fail flows.
- [ ] `apps/realtime` `/tracking`: room entitlement, location ingest (adaptive cadence), Redis GEO write, `delivery:{id}` broadcast, throttled `DeliveryLocation` breadcrumb.
- [ ] `apps/worker`: outbox-relay, `eta-refresh` (Google Distance Matrix, cached), breadcrumb-compaction, courier earnings posting → ledger, payout/withdrawal jobs.
- [ ] Maps: server-proxied Directions/Distance Matrix with Redis cache; Flutter `AppMapView` + markers + polyline + camera-follow.
- [ ] Contracts + Dart client for delivery/courier + a typed socket event layer.
- [ ] Mobile — customer: delivery options/estimate/method + courier assigned/profile/rating/vehicle + **tracking + live map + courier location + ETA** + contact/call/message + arriving/arrived + delivery OTP/verification + completed/receipt + failed/unavailable/reschedule/reassignment + report/dispute + history (124–151).
- [ ] Mobile — courier: welcome/registration/setup/personal/photo/phone-verify + **KYC** doc select/upload/selfie/review/pending/approved/rejected/resubmit + agreement/terms/complete (152–170); vehicle setup/type/details/registration/photo/docs/insurance/verification/approved/rejected + my/add/edit/remove/active (171–185); dashboard + online toggle + availability + **service areas + add/edit + radius + courier map** + location permission/explanation/disabled + working prefs (186–197); available jobs + job details + fee breakdown + pickup/dropoff + package info + requirements + distance/duration + accept/decline + reason + expired + none + **jobs map** (198–212); active delivery + **navigate to pickup** + arrived + pickup verify/OTP/QR + vendor/package verify + count/condition/photo + confirmed + start + **delivery navigation** + destination + arrived + verify/OTP/QR + recipient + signature + POD photo + notes + completed/failed/unavailable/reassignment/cancel/issue (213–242); earnings dashboard + today/week/month + breakdown + delivery detail + bonuses/tips/fees/adjustments + wallet + balance + transactions + withdrawal method/confirm/processing/success/failed + payout history (243–262); performance + stats + rates + avg time + rating breakdown + history + achievements + level + warning (263–274); courier profile + edit + verification status + documents + vehicle mgmt + service areas + notification/privacy/location/security settings + password + 2FA + help + terms + logout + deactivation (275–290).
- [ ] Mobile — vendor: ready-for-pickup, courier arrived, pickup verification (445–447).

**Exit:** End-to-end on real devices: customer places an order → dispatch offers the job →
a courier accepts → customer sees the courier **moving live on a Google map with a live ETA** →
pickup OTP at the vendor → delivery OTP + POD photo at the customer → delivery `COMPLETED` →
courier earning posted to the ledger → both parties can rate. Reassignment and failed-delivery
paths tested. Works identically on `tizzi-gas`.

---

## Phase 5 — Auctions, tickets, qualification  *(GrandPrice only)*

**Goal:** Premium-opportunity engine. MD §17, §18. Gated OFF for Tizzi Gas.

- [ ] Schema v2 Domain 7.
- [ ] `auctions`: auction lifecycle, premium assets, ticket packages + purchase (via `payments`), `TicketWallet`, participants.
- [ ] Qualification engine: `QualificationRule` weights (tickets/engagement/share/referral), `QualificationEvent` → recomputed `qualificationScore`, ranking, eligibility — **weighting, never a guarantee** (enforced in model + copy).
- [ ] Draw engine (`apps/worker`): commit-reveal or VRF seed, weighted `DrawEntry` windows, `Winner` + `BackupWinner`, publishable `resultHash` proof, full `AuditLog`.
- [ ] Prize flow: `PrizeClaim` → KYC verify → `PrizeFulfilment` (reuses Domain 5 delivery for physical prizes) → auction delivery tracking; `AuctionRefund`, `AuctionDispute`.
- [ ] `RegionRule` gate + legal-terms surfaces.
- [ ] Contracts + Dart client.
- [ ] Mobile: auction marketplace + categories + details + premium asset details + rules + ticket/seat pricing + buy ticket + quantity + confirmation + my tickets + ticket details/history + qualification status/breakdown + share + referral progress + auction progress + draw countdown/prep/in-progress + winner announcement/details + runner-up + prize claim/verification/fulfilment + auction delivery tracking + result + refund status + terms + dispute (291–321); ticket wallet + buy + package select + quantity + qualification center + level + ticket/engagement/share/referral qualification + ranking + current rank + history + eligibility + draw eligibility + runner-up + notifications (322–338).

**Exit:** A full auction runs on `grandprice`: users buy tickets, accrue qualification via
multiple factors, a scheduled draw produces an auditable winner + backups, the winner claims
and (for a physical prize) receives it through the Phase-4 delivery pipeline. Every
`auctions/*` endpoint returns `403` under `tizzi-gas`; no auction UI renders there.

---

## Phase 6 — Chat, notifications, trust & safety, support & disputes

**Goal:** Communication + protection. MD §21, §22, §24, §27.

- [ ] Schema v2 Domain 9 (comms/notifications) + Domain 10 (trust/safety/support).
- [ ] `chat`: typed conversations (customer↔vendor/courier/support), attachments (image/doc/voice), entity sharing (product/order/delivery), receipts, block, report. `apps/realtime` `/chat`.
- [ ] `notifications`: categories, `NotificationPreference`, templates, FCM integration + in-app via `/notifications`, broadcasts.
- [ ] `kyc`: unified `KycCase` review workflow + provider hooks (OCR/liveness), reusable across user/courier/vendor.
- [ ] `security`: login activity, active sessions, device management, 2FA management, transaction PIN, report user/product/vendor/courier, safety center.
- [ ] `disputes`: polymorphic `Dispute` (order/payment/delivery/vendor/courier/auction), evidence upload, dispute messaging, resolution, appeal, SLA timers (`apps/worker`).
- [ ] `support`: help center/FAQ, support categories, ticket create + detail + support chat.
- [ ] Mobile: inbox + conversation list + customer/vendor + customer/courier + support chat + chat details + product/order/delivery sharing + image/doc/voice + report + block (369–382); notification center + per-category + settings (383–394); identity verification + KYC intro + doc select/capture + selfie + processing + approved/failed + security center + login activity + active sessions + device mgmt + 2FA + transaction PIN + report user/product/vendor/courier + safety center (416–434); help center + FAQ + support categories + create ticket + ticket details + support chat + order/payment/delivery/vendor/courier/auction dispute + evidence upload + status + resolution + appeal (487–502).

**Exit:** Two users chat in real time with attachments; push + in-app notifications fire for
order/delivery/security events and respect preferences; a KYC case can be submitted and
approved/rejected by a reviewer; a dispute can be opened, evidenced, resolved, and appealed
with SLA timers running.

---

## Phase 7 — Advertising & boosting, analytics, admin console

**Goal:** Monetization + operations. MD §25 (analytics), §26.

- [ ] Schema v2 Domain 8 (campaigns/boosts/ads).
- [ ] `campaigns`/`boosts`/`ads`: **backend-configurable `BoostTier`** (no hardcoded tiers), campaign create → type → product select → audience → budget → duration → boost level → preview → pay → active → performance; `AdEvent` capture + `apps/worker` roll-ups.
- [ ] Analytics: vendor (sales, products, customers, payouts), courier (performance history), platform; served to mobile dashboards + admin.
- [ ] **Admin/Ops console** (`apps/api/app/admin`, Next.js): auth (staff role + 2FA), KYC review queue, dispute desk, feature-flag + platform-feature editor, pricing-rule + fee-schedule editor, boost-tier editor, draw supervision, broadcast composer, audit-log viewer, user/vendor/courier management + safety actions.
- [ ] Mobile: advertising center + create campaign + type + product/audience/budget/duration + boost level + premium/platinum/featured (from config) + preview + payment + active + performance + ad analytics + history (470–486); vendor analytics + overview + reviews + customers + earnings + payouts + settings (subset of 440–469); courier performance history (263–274 completion).

**Exit:** A vendor runs a boosted campaign that pays via `payments`, shows impressions/clicks in
its dashboard, and whose tier came from an admin-editable `BoostTier`. Ops staff can review KYC,
resolve a dispute, toggle a feature flag, and adjust a pricing rule entirely from the web
console. Playwright E2E covers the admin happy paths.

---

## Phase 8 — Hardening & cloud

**Goal:** Production on GCP behind Cloudflare.

- [ ] `security-review` skill pass on the whole surface; fix findings; pen-test checklist.
- [ ] OpenTelemetry traces/metrics/logs wired in all 3 services; Sentry; dashboards + alerts.
- [ ] Load tests (k6) on dispatch + `/tracking` + checkout; tune connection pools, Redis, indexes.
- [ ] `infra/terraform`: GCP (Cloud Run api/realtime/worker, Cloud SQL PG16+PostGIS, Memorystore Redis, Artifact Registry, Secret Manager, Cloud Scheduler); Cloudflare (DNS, WAF, cache rules, Turnstile, R2, Images, staging Tunnel).
- [ ] CI/CD: GitHub Actions → build/test → push image → deploy staging (auto) → deploy prod (gated); Prisma migrate as a pre-deploy job; blue/green or revision-based rollback.
- [ ] Backups + PITR for Cloud SQL; disaster-recovery runbook; data-retention + GDPR/CCPA delete-account pipeline.
- [ ] Flutter release builds; Play Store + App Store listings; staged rollout; crash reporting.
- [ ] Runbooks: on-call, incident, dispute-surge, payment-outage, dispatch-degradation.

**Exit:** Staging on GCP behind Cloudflare passes the full E2E suite (order→deliver, auction,
chat, disputes); production deploy is one gated click with automated migrations and a tested
rollback; monitoring + backups + DR runbook in place.

---

## Cross-cutting (every phase, part of that phase's "done")

- **Responsive/tablet** variants (MD §30) for every screen touched — `compact/medium/expanded/large`, two-pane where specified, foldable-aware.
- **Light + dark** for every component/screen.
- **Font Awesome only**; no hardcoded colors/font-sizes (CI-enforced).
- **i18n / currency / language** per `NotificationPreference` + `User.locale` (MD §23).
- **System states** (MD §28) — loading/skeleton/empty/no-results/offline/network-error/server-error/permission/auth-expired/maintenance/feature-disabled/restricted — designed and wired for each feature.
- **Accessibility** — semantics labels, focus order, min tap target 44dp, contrast AA, respects reduce-motion & text scale.
- **Tests** — unit (`core`) + integration (`api`) + realtime + Flutter widget/integration for the phase's surface; CI green.
- **Docs** — expand the owning section of `04-SCREEN-CATALOG.md` to per-screen tables; update `PROGRESS.md` (checkboxes, NEXT ACTIONS, SESSION LOG, DECISION LOG).
- **Security** — new endpoints get RBAC + capability + rate-limit + idempotency (writes) + audit-log (sensitive); DTOs reviewed for PII leakage.
