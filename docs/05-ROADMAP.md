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

- [x] Schema v2 Domain 3 (catalog) + `GasCylinderListing` + `KycCase`; migration `20260901231947_catalog_domain3` (manual DDL: `pg_trgm`, `searchVector` trigger, 3 GIN indexes). *Legacy gas-listing migration still TODO — currently seed data only.*
- [x] `catalog` module (`@stall/core/catalog`): categories (tree + materialised `path`), products/variants/media, multi-vendor `VendorOffer`, inventory, reviews/Q&A, wishlist, recently-viewed.
- [x] Search: Postgres FTS (weighted `tsvector`) + `pg_trgm` typo fallback; sort/price/category filters; nearby vendors via PostGIS `ST_DWithin` (`/api/v1/search/nearby`).
- [x] `vendors` module: onboarding → `KycCase`, mock `reviewVendorKyc` (STAFF/ADMIN), product draft → update → publish, `listMyProducts`. *Doc upload + performance stub → Phase 2 depth.*
- [x] Promotions **read side** — `Promotion`/`PromotionItem`, `@stall/core/catalog` `promotions` + `homeRails`, routes (`catalog/home`, `promotions`, `promotions/{slug}`, `products/{slug}/similar`). Sponsored/boosted card data + `Campaign` write side stay Phase 7.
- [x] Contracts for catalog/search/vendor/promotions (`packages/contracts/src/catalog.ts` → `openapi.json` 36 paths / 42 ops). Dart client extended by hand in `mobile/lib/api/`.
- [x] Mobile: customer home feed **with rails** (flash-deal carousel + countdown + strikethrough, banners, campaign/new/top/recent), category explorer + grid (sort), search (query/sort/**price filter**/**recent searches**/empty/error), product detail (**fullscreen gallery**, multi-seller offers, variants, reviews + write-review + ask-question, **similar products**, wishlist), vendor storefront, wishlist, **Deals** screen, **Nearby Vendors** (map + list), seller hub (onboarding → KYC-pending → dashboard + **stats card**), add/edit product wizard + publish, **verification-documents** screen. *Polish left: real geolocation, product video.*

**Exit:** On both platforms a customer can browse categories, search, filter by location, open a
product with multiple vendor offers, and view a vendor page; a vendor can register, pass
business KYC (mock reviewer), and publish a product; **all existing Tizzi Gas listings are
visible and orderable-shaped** under `catalog.scope='gas'`.

> **Status (S9):** all backend + mobile screens **code-complete and gate-green** (23 TS tests,
> 13 Flutter tests, curl-verified). Legacy-gas migration is N/A (no prod data). Only a device
> e2e pass remains before Phase 2 closes.

---

## Phase 3 — Cart, checkout, orders, payments, wallet  ✅ CODE-COMPLETE (S10)

**Goal:** Take money, create orders. MD §06, §07, §19, §20.

- [x] Schema v2 Domain 4 (cart/orders/fulfilment) + Domain 6 (ledger/payments/wallet). Migration `20260902004441_commerce_domain4_6`.
- [x] `cart` (multi-vendor grouping, live re-price, save-for-later), `coupons` (window/platform/min-spend/scope/redemption/per-user/first-order + `listCoupons`), address book (+ order snapshot).
- [x] `checkout`: server-computed quote (subtotal/discount/delivery/service/tax/total lines from `FeeSchedule` + `AppConfig(checkout.fees)`), fulfilment method (DELIVERY/PICKUP), `Idempotency-Key` on `POST /checkout`. *Delivery is a flat fee until Phase 4 distance pricing.*
- [x] `payments`: `PaymentGateway` port + deterministic **`MockGateway` sandbox** (no external accounts — B4) + **stubbed** Paystack/Flutterwave/Stripe adapters on the same port; `PaymentIntent`/`Payment`/`PaymentMethod`/`Payout`; idempotent `payments/webhook`.
- [x] `wallet`: double-entry `LedgerAccount`/`LedgerEntry`/`LedgerTxn` (`postTxn` balance-asserted); top-up (via gateway), transactions feed, **transaction-PIN-gated withdrawal**; escrow capture → release-on-`VendorOrder`-completion.
- [x] `orders`: `Order`/`VendorOrder`/`OrderItem`/`Fulfilment`/`OrderEvent`/`Return`/`Refund`/`Invoice`; cancel (→ wallet refund), return request, vendor status transitions, `completeVendorOrder`. *Exchange + formal `OrderIssue` → Phase 6 (disputes).*
- [x] `_compat` `order.*` / `vendor.nearby` — already `410 ENDPOINT_MIGRATED` (shim only bridged `auth.*`).
- [x] Contracts `commerce.ts` → `openapi.json` (60 paths / 72 ops). Vitest `commerce.test.ts` (7) + opt-in `phase3-e2e.test.ts` (4). 27 TS tests green.
- [x] Mobile: cart (groups/qty/save-later/coupon), checkout (method → address → payment → live quote → place), order placed, orders (filter tabs), order detail (sub-orders/timeline/fees/cancel), wallet (balance/txns/top-up/PIN-withdraw), address book (+editor), coupons. Product-detail add-to-cart; app-bar cart badge; account-tab entries. `flutter analyze` 0 / `test` 18. *Deeper 81–123 / 339–368 sub-screens (reorder, invoice PDF, refund detail, referral) = Phase 3 depth / later.*

**Exit — ✅ MET (S10):** a customer places a **paid multi-vendor order** in the mock payment
sandbox; funds land in escrow; each `VendorOrder` completion releases vendor payout (minus
commission) and platform revenue via balanced ledger entries; order cancel reverses the
capture to the wallet; wallet top-up + PIN-gated withdrawal work. Covered by `commerce.test.ts`
(7, reconciled to the cent) + `phase3-e2e.test.ts` (4, live API). Real gateway adapters
stubbed pending B4.

---

## Phase 4 — Delivery, courier, realtime, maps  ✅ CODE-COMPLETE (S11)

**Goal:** The Bolt/Uber-style delivery network. MD §08–§16, plus the map screens we own.

- [x] Schema v2 Domain 5 (delivery/courier ops) + courier KYC (`KycCase.level`, `KycDocument`, `LivenessCheck`). Migrations `20260902045932_delivery_domain5`, `20260902051042_delivery_verify_codes`.
- [x] `couriers`: onboarding → unified `KycCase`/`KycDocument`/mock `LivenessCheck` + STAFF/ADMIN mock review; vehicles + docs + mock review; service-area circles (+ polygon), availability schedule; online/offline + `CourierShift` + heartbeat; dashboard + performance metrics; PII-masked jobs feed. *Real OCR/liveness provider hooks + the review console = Phase 6.*
- [x] `delivery`: `ensureDeliveryForVendorOrder` (spawn from `Fulfilment` on `READY_FOR_PICKUP`) + adhoc wallet-funded creation; **dispatch engine** (Redis GEO / PostGIS `ST_DWithin` shortlist → ranked `DeliveryOffer` waterfall with TTL, `sweepExpiredOffers`, `expireUndispatchable`); `DeliveryJob` marketplace (pre-acceptance area labels only); active-delivery **state machine** (`courierAdvanceDelivery`, every hop → `DeliveryEvent` + `OutboxEvent`); pickup verification (code/QR/photo/count/condition); delivery verification (code/QR/signature/POD photo); ratings (roll courier avg); reassign / reschedule / fail / customer-cancel / courier-cancel.
- [x] `apps/realtime` `/tracking`: JWT connect, `delivery:{id}` room entitlement (`getDeliveryTrack`), location ingest → `recordBreadcrumb` (throttled `DeliveryLocation`) → room broadcast, Redis `stall:realtime` sub → rebroadcast; `/delivery-ops` (STAFF/ADMIN); `@socket.io/redis-adapter`.
- [x] `apps/worker`: real `outbox-relay` (→ `stall:realtime` + push-log), `dispatch-sweep`, `eta-refresh`, `payout-drain` (mock), `breadcrumb-compact`.
- [x] Maps: server-proxied Distance Matrix with Redis cache + haversine/avg-speed fallback (B5); `/api/v1/maps/route`. *Flutter map uses GoogleMap markers + a straight-line polyline until Directions polylines land.*
- [x] Contracts `delivery.ts` → `openapi.json` (103 paths / 118 ops); hand-written Dart client in `mobile/lib/api/`. *Typed socket event layer is informal (string events) for now.*
- [x] Mobile — customer: **tracking + live map + courier marker + trail + ETA** + status stepper + courier card + call + drop-off code + cancel + rate; order-detail "Track delivery". *Adhoc-send / history / dispute-detail sub-screens deferred.*
- [x] Mobile — courier: onboarding (register + KYC docs + vehicle + agreement); dashboard (online toggle + heartbeat + stats + active job); jobs board (countdown + accept/decline); active delivery (map + one-tap advance + verify pickup/dropoff + POD + report-issue + rate); earnings (summary + feed + PIN withdraw); performance (stats + rating breakdown). *Service-area map editor, working prefs, notif/privacy/security settings, achievements = deferred depth.*
- [ ] Mobile — vendor: ready-for-pickup, courier arrived, pickup verification (445–447) — **deferred**: needs a seller-orders management screen (itself deferred from Phase 3). Backend `GET /vendors/deliveries/{id}` is ready.

**Exit — ✅ MET (S11) at the code + integration-test level:** an order → `READY_FOR_PICKUP`
spawns a `Delivery` → dispatch offers the seeded courier → accept → state machine to
`COMPLETED` with pickup/drop-off code verification + POD → courier earning posted to the ledger
(escrow → courier PAYABLE + platform REVENUE, reconciled to the cent) → both parties rate;
decline / courier-cancel re-dispatch; `expireUndispatchable` covers no-courier. Works
identically on `tizzi-gas` (`delivery.test.ts` "tenant isolation"). *Outstanding: a real
device run on a live Google map + a Maps Platform key (B5); FCM push (B6).*

---

## Phase 5 — Auctions / Inverse Draws, tickets, qualification  *(GrandPrice only)*  ✅ CODE-COMPLETE (S12)

**Goal:** Premium-opportunity engine. MD §17, §18. Gated OFF for Tizzi Gas.

- [x] Schema v2 Domain 7 (17 models). Migration `20260902055055_auction_domain7`.
- [x] `auctions` (`@stall/core/auctions/auctions.ts`): lifecycle transitions, `createAuction` (+ packages + asset + qual rules), reads with `seatsSold` projection + "mine", `refreshAuctionFill`, `resolveAuctionId`, `openAuctionDispute`.
- [x] `tickets`: `buyTickets` (package or count, wallet/gateway → `PaymentIntent(TICKET)` → per-auction `auctionEscrow`, mint PURCHASE + BONUS seats, roll `TicketWallet` + `AuctionParticipant` + `QualificationEvent(TICKETS)`), `myTicketWallets`, `myTickets`.
- [x] Qualification engine: `QualificationRule` weights (TICKETS/ENGAGEMENT/SHARE/REFERRAL), `QualificationEvent` (key-deduped) → `recomputeParticipant` (`score = Σ weight·points`) → `recomputeAuctionRanks`, `getQualification` breakdown, `auctionLeaderboard` — **weighting, never a guarantee** (field names + copy).
- [x] Draw engine (`draw.ts` + `apps/worker` `auction-draws` loop): commit-reveal — `commitDraw` publishes `sha256(seed)`, `runDraw` reveals + builds weighted cumulative `DrawEntry` windows + deterministically picks `Winner` + 3 `BackupWinner`s + publishable `resultHash`; `markUnsold` full refund; escrow settled per `nonWinnerPolicy` (REFUND/CREDIT → wallet, VOUCHER → `Coupon`) then remainder → platform REVENUE; `OutboxEvent` at each step. *Full `AuditLog` via the `audit` route option on STAFF endpoints.*
- [x] Prize flow: `startPrizeClaim` → `submitClaimKyc` (unified `KycCase(USER)` + `KycDocument`) → `reviewPrizeClaim` (APPROVE → CLAIMED / REJECT → FORFEITED + promote `BackupWinner` #1) → `fulfilPrize` (DELIVERY spawns a Phase-4 `Delivery` from the warehouse, platform-funded; PICKUP/DIGITAL/PAYOUT); `purchaseWinTarget` (winner buys at `winTargetMinor` → REVENUE); `AuctionRefund` on unsold/non-winner; `AuctionDispute` open.
- [~] `RegionRule` gate + legal-terms surfaces — `Auction.regionCodes` stored + `rules` JSON surfaced; **enforcement** (region block) + a dedicated terms screen deferred.
- [x] Contracts `auction.ts` → `openapi.json` (122 paths / 137 ops); hand-written Dart client.
- [x] Mobile: **marketplace** + **detail** (fill bar, struck-through retail, dual "Join Draw / Buy retail" CTA, package+qty+payment buy sheet, my-seats card, draw-proof + result card, winner banner, "not a guarantee" copy) + **qualification centre** (breakdown + rank + leaderboard + share/engage/refer actions) + **my tickets** + **winner claim** (claim → KYC → approve → winTarget buy stepper). Account-tab entries gated on `hasFeature('auction')`. *Premium-asset gallery, ticket history, referral-progress, draw-countdown/prep live screens, runner-up notifications, ticket-wallet screen = deferred depth.*

**Exit — ✅ MET (S12) at the code + integration-test level:** a full auction runs on
`grandprice` — users buy seats, accrue qualification via tickets + engagement/share/referral
(weights, not guarantees), a commit-reveal draw produces an auditable `Winner` + backups with a
publishable `resultHash`, the winner claims → KYC → approve → buys at `winTarget`; non-winners
refunded per policy, an unsold pool refunds everyone, `auctionEscrow` nets to zero. Every
`auctions/*` endpoint `403`s under `tizzi-gas` (`phase5-e2e.test.ts` asserts it). *Outstanding:
an on-device pass; the STAFF authoring/ops console (Phase 7); `RegionRule` enforcement.*

---

## Phase 6 — Chat, notifications, trust & safety, support & disputes  ✅ CODE-COMPLETE (S13)

**Goal:** Communication + protection. MD §21, §22, §24, §27.

- [x] Schema v2 Domain 9 (comms/notifications) + Domain 10 (trust/safety/support). Migration `20260902061543_comms_trust_domain9_10` (15 models).
- [x] `chat` (`@stall/core/comms/chat.ts`): typed conversations (customer↔vendor/courier/support), attachments + shareable entities (via `Message.kind` + `attachments`/`meta`), `MessageReceipt` (delivered/read), `block`/`unblock` (enforced on send), `conversationForOrder`/`conversationForDelivery`; `apps/realtime` `/chat` (JWT, `conversation:{id}` rooms, `message`/`typing`/`read`). *Voice capture + entity-share pickers = mobile depth.*
- [x] `notifications` (`comms/notifications.ts`): 12 categories, `NotificationPreference` (default push+email+inApp, PROMO email off), in-app feed via `/notifications`, FCM adapter with a log fallback (B6); `notifyFromOutboxEvent` maps order/delivery/auction OutboxEvents → notifications in the worker relay. *Templates + `Broadcast` send = Phase 7 (admin composer).*
- [x] `kyc` (`trust/kyc.ts`): **unified** `listKycQueue` / `getKycCase` (+ subject summary) / `reviewKycCase` (APPROVE/REJECT/RESUBMIT) — syncs `VendorProfile`/`CourierProfile`/`UserRole` and advances a `VERIFYING` `PrizeClaim`; supersedes the Phase-4/5 mock reviewers. *Real OCR/liveness provider hooks pending a provider.*
- [x] `security` (`trust/reports.ts` + existing `auth`): `safetyCenter` (2FA/PIN/password state, active sessions, recent `LoginActivity`, blocked/reports counts); `submitReport` (user/product/vendor/courier/conversation/order/delivery); `applySafetyAction` (WARN/RESTRICT/SUSPEND/BAN/CLEAR → `User.status` + `UserRole` + session revoke + `TokenEpoch` bump). Sessions / 2FA / PIN management already shipped in Phase 1.
- [x] `disputes` (`trust/disputes.ts`): polymorphic `Dispute(kind, refId)` (order/payment/delivery/vendor/courier/auction), party-checked open + SLA clock, `DisputeEvidence` + `DisputeMessage` (staff-only flag), `resolveDispute` (+ ledgered wallet refund), `appealDispute`/`decideAppeal`, `sweepDisputeSla` (`apps/worker` `dispute-sla` loop).
- [x] `support` (`trust/support.ts`): help centre / FAQ (from `AppConfig`, built-in fallback), `SupportTicket` create → opens a backing SUPPORT `Conversation` with the first message, list/get, STAFF assign + status.
- [x] **72 `/api/v1` routes** + a full STAFF/ADMIN block (`staff/kyc`, `staff/disputes`, `staff/reports`, `staff/safety-action`, `staff/support`). `comms.ts` contract → `openapi.json` (159 paths / 179 ops); hand-written Dart client.
- [x] Mobile: **inbox** + **conversation** (bubble thread + composer) + **notification centre** (+ per-category preference sheet) + **disputes** (list + open sheet + detail w/ evidence/messages/appeal) + **help & support** (FAQ + ticket → support chat) + **security centre**; app-bar notifications bell (unread badge) + inbox icon; account-tab Messages / Disputes / Help & support / Security centre; order-detail "Message seller". *Identity-verification capture flow, report deep-screens, chat voice/entity-share = deferred depth (backend + STAFF review ready).*

**Exit — ✅ MET (S13) at the code + integration-test level:** two users chat in real time
(deduped thread, delivered/read receipts, block enforced); an in-app notification fires for a
chat reply and for order/delivery/auction OutboxEvents and respects per-category preferences; a
`KycCase` is submitted and approved/rejected by the unified reviewer (syncing the subject); a
dispute can be opened (party-checked), evidenced, resolved with a ledgered wallet refund, and
appealed — with the SLA sweep running. Covered by `comms.test.ts` (7) + opt-in `phase6-e2e.test.ts`.
*Outstanding: on-device pass; the STAFF/ADMIN web console (Phase 7); real FCM (B6).*

---

## Phase 7 — Advertising & boosting, analytics, admin console  ✅ CODE-COMPLETE (S14)

**Goal:** Monetization + operations. MD §25 (analytics), §26.

- [x] Schema v2 Domain 8 (`BoostTier`, `Campaign`/`CampaignItem`/`Advertisement`/`AdEvent`/`AdDailyStat`, `Boost`, `ReferralCode`/`Referral`, `AnalyticsSnapshot`). Migration `20260902070643_advertising_analytics_domain8`.
- [x] `ads`: **backend-editable `BoostTier`** (no hardcoded tiers anywhere), campaign create (name → tier → budget → products → targeting) → submit (full budget charged to platform escrow via `payments`) → staff review → ACTIVE → `AdEvent` accrual (CPM/CPC/FLAT_DAILY) → auto-pause on budget exhaustion → settle (spend → REVENUE, remainder → wallet); direct product `Boost`; `apps/worker` `ads-sweep` + `analytics-rollup` (`AdDailyStat` + `AdEvent` compaction + conversion attribution).
- [x] `referrals`: stable share code, apply-within-7-days-of-signup, reward-on-first-qualifying-order (ledgered to wallet, fired from `placeOrder`), expiry sweep.
- [x] Analytics: `analytics` module — vendor (sales / top products / customers / payouts / ad ROAS), courier (completion / acceptance / on-time / earnings trend), platform (GMV / users / vendors / deliveries / queues) + `AnalyticsSnapshot` nightly cache + `trend`.
- [x] **Admin/Ops console** (`apps/api/app/admin`, Next.js): OTP login + `stall_admin` EdDSA cookie session (STAFF/ADMIN, `requireAdmin()` on every page + action), dashboard, analytics, KYC review queue + detail, dispute desk + detail (assign / message / resolve+refund), ad-campaign review, **boost-tier editor**, draw supervision (commit / run, publishable hashes), broadcast composer, feature-flag editor, pricing-rule + fee-schedule editors, user directory + safety actions, audit-log viewer. *(`ADMIN_2FA_REQUIRED` env present; enforcement deferred.)*
- [x] 34 `/api/v1` routes + `ads.ts` contract → `openapi.json` 195 paths / 224 ops. **Vitest** `ads.test.ts` (6) + `analytics.test.ts` (5) → 61 TS green; opt-in `phase7-e2e.test.ts`.
- [x] Mobile: `ads_models.dart` + `StallApi` methods; **advertising center** (campaign list + create sheet w/ tier chips + product picker), **campaign detail** (KPIs + pause/resume/cancel + submit&fund), **vendor analytics** (sales / customers / payouts / ad ROI + spark bars), **courier performance history**, **refer & earn** (code + share + apply); router + `HomeShell` account-tab entries (role + `advertising`-gated). `flutter analyze` 0 / `test` 35.
- [ ] **Deferred** — sponsored-card injection into the shopper home/search rails (`sponsoredProvider` + `StallApi.sponsored`/`logAdEvent` shipped, not yet placed); campaign creative editor screen; admin console 2FA enforcement; Playwright admin E2E.

**Exit — ✅ MET (S14) at the code + integration-test level:** a vendor creates a campaign,
funds it from wallet (→ platform escrow via `payments`), staff approves it in the web console,
impressions/clicks accrue spend against the editable `BoostTier` price, the budget auto-pauses
on exhaustion, and settle reconciles (spend → REVENUE, remainder → wallet). Ops staff review
KYC, resolve a dispute with a ledgered refund, toggle a feature flag, edit a pricing rule, run
a draw, and send a broadcast — all from `apps/api/app/admin`. Referral reward lands on a
qualifying first order. *Outstanding: Playwright admin E2E; sponsored placement in the feed.*

---

## Phase 8 — Hardening & cloud  ✅ CODE-COMPLETE (S14) — cloud enablement pending B7/B8/B9

**Goal:** Production on GCP behind Cloudflare. Full detail: `docs/08-HARDENING.md`.

- [x] `security-review` pass on the Phase 7/8 surface + money paths — 4 real fixes (ad-settle double-book guard, charge-budget atomicity, ad-click Redis de-dup, deletion-tombstone uniqueness). *Full-surface skill sweep + pen-test checklist pending staging.*
- [x] Observability — `@stall/core/observability` (dependency-free OTel/Sentry shim), `initObservability` in `apps/{api,realtime,worker}` + `captureError` in `withApi`, secret scrubbing. `OTEL_*`/`SENTRY_*` env. *Real exporters need an endpoint (B9).*
- [x] Load tests — `infra/loadtest/{checkout,dispatch,tracking}.js` (k6) + README with thresholds + tuning knobs. *Run needs staging.*
- [x] `infra/terraform/` — GCP (Cloud Run ×3, Cloud SQL PG16 + PITR + PostGIS, Memorystore, Artifact Registry, Secret Manager, VPC connector, Cloud Scheduler, IAM) + Cloudflare (DNS, managed WAF, auth/checkout rate-limit, `/api` cache-bypass, Turnstile, R2). `terraform validate`-clean; `apply` needs B7/B8.
- [x] CI/CD — `.github/workflows/deploy.yml` (CI gate → build/push `sha-<12>` images → `prisma migrate deploy` → no-traffic deploy → traffic shift → smoke test → auto traffic-rollback; prod is a gated `workflow_dispatch` with a `production` environment approval; keyless WIF auth). `infra/docker/Dockerfile.{api,realtime,worker}` + `.dockerignore` + `start:prod`.
- [x] Backups + PITR (Terraform) + DR runbook + **GDPR/CCPA delete-account pipeline** — `AccountDeletionRequest` (migration `20260902074802`), `@stall/core/privacy` (`exportMyData`, `requestAccountDeletion` + cancellable grace period, worker `processDueDeletions` anonymise + session-revoke + tombstone, `purgeStaleAuditLogs`), routes `GET /me/data-export` + `GET/POST/DELETE /me/account/deletion`, worker `privacy-sweep`. `privacy.test.ts` (3).
- [~] Flutter release builds + store listings — flavors exist; build commands + Crashlytics + staged-rollout plan in `docs/08-HARDENING.md` §7. Signing + store work is manual.
- [x] Runbooks — `docs/runbooks/` (on-call, incident, deploy-rollback, payment-outage, dispatch-degradation, dispute-surge, disaster-recovery).
- [ ] **Cloud enablement (B7/B8/B9)** — `terraform apply`, first `deploy.yml` staging run, OTLP + Sentry endpoints, full E2E on GCP behind Cloudflare, gated prod deploy + tested rollback. **User-owned.**

**Exit — partial (code-complete):** everything not requiring a live GCP project + Cloudflare
zone is built, typed, and (where testable) covered. Staging-on-GCP verification is the
remaining step. `docs/08-HARDENING.md` §8 has the criterion-by-criterion state.

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
