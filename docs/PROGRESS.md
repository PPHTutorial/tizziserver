# STALL — PROGRESS LEDGER

> **This is the single source of truth for "where are we".** Every session updates it.
> Resume a cleared session by typing **`RESUME STALL`** (see `docs/RESUME.md`).
> Flush state before clearing context by typing **`SAVE STALL`**.

Last updated: **2026-09-01** (Session 9)

---

## CURRENT STATE (one paragraph)

**Session 9 — Phase 2 (Catalog / vendors / search) backend + mobile slice is in.**
**Schema v2 Domain 3** added to `packages/db` (migration `20260901231947_catalog_domain3`):
`Category` (tree + materialised `path` + `platformSlugs`), `Product` (+ `Unsupported("tsvector")`
`searchVector`), `ProductMedia`/`ProductVariant`/`Inventory`, `VendorOffer` (multi-vendor,
`@@unique([productId,vendorId])`), `PriceHistory`, `ProductReview`/`ProductQuestion`/
`ProductAnswer`, `WishlistItem`, `RecentlyViewed`, `GasCylinderListing`, plus `KycCase`.
Manual DDL in the migration: `pg_trgm`, a `BEFORE INSERT/UPDATE` trigger maintaining
`searchVector` (title=A/brand=B/description=C), and 3 GIN indexes (`search_vector` +
`title`/`brand` trigram); the 5 baseline GiST indexes were preserved (differ's spurious
`DROP INDEX`s stripped per `packages/db/README.md`). **Seed** extended: 2 vendor users +
profiles + approved `KycCase`, a 12-node category tree (general for `grandprice`, LPG for
`tizzi-gas`), 5 products / 6 offers (incl. a multi-vendor phone and a gas cylinder with a
`GasCylinderListing`), + Accra business `location`s for `/search/nearby`. **`@stall/core/catalog`**
(new): `categories` (list + tree), `products` (`listProducts` cursor-paged + `getProductDetail`
with offers/variants/reviews/Q&A), `search` (`searchProducts` FTS+trigram via `$queryRawUnsafe`,
`nearbyVendors` via PostGIS `ST_DWithin`), `vendors` (onboarding → `KycCase`, mock
`reviewVendorKyc`, `createProductDraft`/`updateProductDraft`/`publishProduct`/`listMyProducts`),
`engagement` (wishlist / recently-viewed / reviews / Q&A). **17 `/api/v1` routes** added
(catalog, search, vendors, `me/wishlist`, `me/recently-viewed`) — `withApi` gained a `params`
arg for `[slug]`/`[id]` dynamic segments. **Contracts**: `packages/contracts/src/catalog.ts` →
`openapi.json` now **30 paths / 35 operations** (path params emitted). **Vitest**: +9 catalog
integration tests (tenant scope, multi-vendor offers, cross-tenant 404, FTS + typo/trigram,
onboarding→KYC→publish gate) — 18 TS tests green. **Live-verified** against the Docker `stall`
DB (all curl-checked): category tree, product list, multi-vendor detail (`184900` from Kumasi
Gadget Store vs `189900`), gas listing, cross-tenant `404`, search, vendor page, nearby (527 m).
**Mobile**: `lib/api/catalog_models.dart` + `StallApi` catalog methods; `features/catalog/`
providers + screens — customer home feed, category explorer, category grid (sortable), search
(query/sort/empty/error), product detail (gallery, multi-seller offers, variants, reviews,
write-review, ask-question, wishlist), vendor storefront, wishlist, **seller hub**
(onboarding → KYC-pending → dashboard) + add/edit product wizard with publish. `HomeShell`
tabs now render the real catalog/vendor bodies from `bootstrap.nav`. Green: pnpm
build/typecheck/lint/test (18) · flutter analyze (0) · flutter test (9).

**Session 9 (cont.) — Phase 2 depth: promotions + home rails + the rest of the shopper/seller
screens.** Schema: `Promotion` (kind FLASH_DEAL/CAMPAIGN/BANNER, `platformSlugs`, window) +
`PromotionItem` (`discountBps`) — migration `20260901235617_promotions_readside`. Seed: 5 live
promos (gp + gas scoped), 2 more grandprice products (`orbit-a34-phone`, `nimbus-pro-16-laptop`)
so "similar" has siblings. `@stall/core/catalog` gained `promotions` (active + by-slug, deal
price = `price·(1−bps/1e4)`), `home` (`homeRails` — one call: flash/campaign/banner rails +
newArrivals + topRated + recentlyViewed), `similarProducts` (same-category), vendor
`addBusinessDocument`/`listBusinessDocuments`/`vendorStats`. **9 new `/api/v1` routes**
(`catalog/home`, `promotions`, `promotions/[slug]`, `catalog/products/[slug]/similar`,
`vendors/business/documents` GET+POST, `vendors/stats`) → **36 paths / 42 ops** in `openapi.json`.
**+5 Vitest** (`promotions.test.ts`: tenant scope, deal-price math, kind filter, home rails,
similar) — 23 TS tests green. Live-verified: home rails (184900→166410 @10%), gas promos
scoped, cross-tenant 404, similar returns `orbit-a34-phone`. **Mobile**: home feed rewritten
onto `homeRails` (flash-deal carousel w/ strikethrough + countdown, banner gradient cards,
campaign/new/top/recent rails, Flash-deals + Nearby quick actions); new screens — `DealsScreen`,
`NearbyVendorsScreen` (GoogleMap + list, Accra fallback centre + radius picker),
`BusinessDocsScreen` (add/list KYC docs); product detail gained a fullscreen gallery viewer +
"You might also like" rail; search gained a price-range filter sheet + session recent-searches;
seller dashboard gained a stats card. +4 model tests → **flutter analyze 0 · flutter test 13**.

--- earlier ---

**Session 8 — Phase 1 auth is feature-complete for the backend.** Added the `withApi(opts,
handler)` wrapper (`apps/api/src/http/route.ts`): body/query Zod parse, `auth`/`Role` guard,
`capability` gate (`assertFeature`), Redis fixed-window **rate-limit**, **`Idempotency-Key`**
replay via the `IdempotencyKey` table, **`AuditLog`** write, unified envelope + error mapping —
all 12 `/api/v1` routes refactored onto it. New: **TOTP 2FA** (`@stall/core/auth/credentials`
— enroll/confirm/status/disable + recovery codes as a hashed array; login `verify` returns
`{mfaRequired}` then accepts `totpCode` or a recovery code), **transaction PIN** (argon2id +
lockout), **password**, **social sign-in** (`/api/v1/auth/social` — Google/Apple via JWKS in
`jose`, Facebook via Graph debug_token). **`_compat` bridge**: `apps/api/app/api/[...api]`
translates `auth.send-otp` / `auth.verify-otp` / `auth.refresh-token` to the new flows (old
`{success,data:{token}}` shape); every other legacy action → `410`. `@stall/core` gained
`redis` (shared ioredis + `rateLimit`). **Verified live** (Docker `stall` DB, `scratchpad/
authtest.mjs`): login → 2FA enroll → confirm (10 recovery codes) → relogin gated
(`mfaRequired`) → relogin w/ TOTP → relogin w/ recovery code → set PIN → disable 2FA; plus
rate-limit 429, `_compat` old-shape round-trip, AuditLog rows written. Green: build (12 v1
routes), typecheck, lint (0).

**Session 8 (cont.) — Phase 1 exit gate landed + a real test suite.** Added the capability
probe route **`GET /api/v1/auctions/ping`** (`auth: true`, `capability: "auction"`) — the
Phase-1 exit assertion: `200` under `x-platform: grandprice`, `403 FEATURE_DISABLED` under
`tizzi-gas`. Stood up **Vitest** as the repo test runner (`pnpm test` → `turbo run test`;
`packages/core` + `apps/api` each have a `vitest.config.ts` + `test/setup.ts` that loads the
root `.env`). **9 integration tests, all green** against the Docker `stall` DB: `@stall/core`
— refresh-token rotation (one family, one live session per hop), **reuse-detection** (replaying
a rotated token revokes the whole family), **token-epoch bump** (`revokeAllForUser` increments
`TokenEpoch.ver` + kills every session), and the `grandprice`/`tizzi-gas` capability resolver;
`@stall/api` — the `/auctions/ping` route through `withApi` returns 200 / 403 / 401 as
specified. Green: build (**13** v1 routes), typecheck (core tsconfig now also covers `test/`),
lint (0), test (9).

**Session 8 (cont.) — Phase 1 client: contracts → OpenAPI → Flutter auth.** `packages/
contracts` now carries the full Phase-1 Zod contract (`src/auth.ts` — 11 auth ops + bootstrap +
`auctions/ping`, shared models); `scripts/build-openapi.ts` rewritten to emit real paths, query
params, bearer security, and the standard error envelope for 400/401/403/404/429 →
`openapi.json` (13 paths / 14 operations). **Flutter `mobile/` app built out** (analyze + 5
tests green): hand-written typed **dio client** (`lib/api/` — `StallApi` + models + envelope
unwrap + one-shot refresh-token rotation on 401 → `forceLogout`), secure-storage `TokenStore`,
Riverpod `AuthController` / `bootstrapProvider`, `go_router` with an auth/onboarding redirect,
and **screens 1–20**: splash · 3-slide onboarding · welcome (+social) · phone & email OTP
request · OTP entry with resend countdown + TOTP 2FA challenge · dedicated social · forgot /
reset / create password · account recovery · select-role + role-switcher sheet · signed-in
devices (revoke / sign-out-everywhere) · security alert · account suspended / disabled. **§32**
`AppBottomNav` renders from `bootstrap.nav`; `HomeShell` account tab wires sessions, 2FA
enrol, PIN, password, logout. New dep `flutter_secure_storage`. CI `test` job (postgis
service) + Flutter job already cover the suites. Green: pnpm build/typecheck/lint/test (9) ·
flutter analyze (0) · flutter test (5).

--- earlier ---

**Session 7 — Phase 1 auth module is live and curl-verified.** New `@stall/core` package:
argon2id (`@node-rs/argon2`, prebuilt), EdDSA JWT (`jose`), OTP issue/verify, rotating-refresh
sessions with **family reuse-detection**, role switch, capability resolver, bootstrap builder.
`/api/v1/auth/{otp,verify,refresh,logout,sessions,switch-role}` + `/api/v1/config/bootstrap`
served by `apps/api` (envelope + `getContext` principal/TokenEpoch check). Verified end-to-end
against the Docker `stall` DB: request OTP (code to server log) → verify → EdDSA access +
rotating refresh + device row → authed bootstrap returns `activeRole`+`nav` → refresh rotates
→ replaying the old refresh triggers `REFRESH_REUSE_DETECTED` (family revoked) → switch to an
unheld role `403 ROLE_NOT_ACTIVE`. `bootstrap` gates correctly: `grandprice` auction=true/
scope=all vs `tizzi-gas` auction=false/scope=gas. Green: build (7 v1 routes), typecheck, lint
(0). Migration `20260901201604_session_role_platform` added `Session.activeRole`+`platformSlug`
(and the PostGIS geo-DDL is now hand-managed — see `packages/db/README.md`).

--- earlier ---

**Session 6 — Phase 1 started: schema v2 Domains 0+1+2 is live.** `packages/db/prisma/
schema.prisma` is now the v2 baseline (platform/config/system · identity with relational
`UserRole` · profiles); migration `20260901191354_init` applied to the local `stall` DB
(**43 tables, PostGIS 3.5.2, 5 GiST indexes**); seed loaded (`grandprice` + `tizzi-gas`
platforms, 12 feature flags, per-platform gating verified — auction/advertising OFF + catalog
`gas` for Tizzi Gas). The 6 legacy Tizzi-Gas RPC services are archived under
`apps/api/_legacy_services/`; the catch-all route now returns `410 ENDPOINT_MIGRATED`. All
green: `pnpm -r build` · `pnpm -r typecheck` · `@stall/api` lint (0 warnings now) · seed.
Next in Phase 1: the auth module (`jose` + argon2), capability resolver, `/api/v1/config/
bootstrap`, middleware chain.

--- earlier ---

**Session 5 — renamed the engine to `Stall` + verified the Docker dev path.** The system is
**Stall** (multi-tenant marketplace + delivery engine); **GrandPrice** and **Tizzi Gas** are
`Platform` *tenants*. `@grandprice/*` → **`@stall/*`**, Flutter `Gp*` → **`App*`**, keyword →
**`RESUME STALL`**, dev DB → `stall`, memory files renamed; tenant slugs `grandprice`/
`tizzi-gas` unchanged. **Docker Desktop now works** — the compose stack is up and healthy:
Postgres 16 + **PostGIS 3.5** (extension enabled, migrations applied), Redis 7, MinIO (bucket
`stall-media` created), Mailpit (:8025). Verified against it: `vendor.list` returns real DB
data, realtime/worker `/health`, email → Mailpit round-trip. **Image tags are now pinned** in
`docker-compose.yml` — floating `:latest` gave corrupt / `exec format error` layers after the
Docker Desktop factory-reset. `.env` + `.env.example` default `DATABASE_URL` is the Docker
form (`stall:stall@localhost:5432/stall`); the no-Docker fallback (`pnpm dev:db`) still works.
All checks re-verified green. **Repo folder is still `tizziserver`** — the OS rename to `stall`
is pending (locked in-session; steps in NEXT ACTIONS).

**Phase 0 remains DONE** (branch `phase-0-foundation`). The repo is a pnpm +
Turborepo **monorepo**: `apps/api` (Next.js **16.3.4**, the old catch-all route + 6 services
moved in intact), `apps/realtime` (Fastify + Socket.IO skeleton), `apps/worker` (BullMQ
skeleton), `mobile/` (Flutter app booting a token-driven theme), `packages/{db,config,tokens,
contracts}`, `infra/docker`. Prisma upgraded **6 → 7.10.0** (new `prisma-client` generator,
ESM, `@prisma/adapter-pg` driver adapter, `prisma.config.ts`); schema still v1 (Tizzi Gas
baseline). `@stall/config` is a zod env loader; `@stall/tokens` builds the measured
Figma tokens into `tokens.ts`/`.css`/`mobile/.../tokens.g.dart`; `@stall/contracts` emits
a starter `openapi.json`. **Phase 0 is COMPLETE and verified running** — both via the Docker
compose stack (default, S5) and the no-Docker fallback (`pnpm dev:db` / `dev:redis` /
`dev:mail`, S4). **All green:** `pnpm -r build` (note: `NODE_ENV` must NOT be in `.env` — it
breaks `next build`), `pnpm -r typecheck`, `@stall/api` lint (0 errors), `flutter analyze`,
`flutter test`. `docs/DEV_SETUP.md` documents both paths. **Phase 1 is next.**

## ACTIVE PHASE

**Phase 2 — Catalog, vendors, search, discovery.** Started S9. Branch `stall-rebuild`.
See `docs/05-ROADMAP.md` §Phase 2 + `docs/02-DATA-MODEL.md` §Domain 3 + `docs/04-SCREEN-CATALOG.md` §03–05, §25.

- [x] **Schema v2 Domain 3** — `Category` · `Product` (+`tsvector`) · `ProductMedia`/`ProductVariant`/`Inventory` · `VendorOffer` (multi-vendor) · `PriceHistory` · `ProductReview`/`ProductQuestion`/`ProductAnswer` · `WishlistItem` · `RecentlyViewed` · `GasCylinderListing` · `KycCase`. Migration `20260901231947_catalog_domain3` (manual DDL: `pg_trgm`, `searchVector` trigger + 3 GIN indexes; baseline GiST indexes preserved). `migrate deploy` on the local `stall` DB.
- [x] **Seed** extended — 2 vendor users + profiles + approved `KycCase`; 12-node category tree (general→`grandprice`, LPG→`tizzi-gas`); 5 products / 6 offers (multi-vendor phone, gas cylinder w/ `GasCylinderListing`); Accra business `location`s.
- [x] **`@stall/core/catalog`** — `categories` (list/tree), `products` (`listProducts` cursor-paged + `getProductDetail`), `search` (`searchProducts` FTS+trigram via `$queryRawUnsafe`; `nearbyVendors` PostGIS `ST_DWithin`), `vendors` (onboarding→`KycCase`, mock `reviewVendorKyc`, product draft/update/publish, `listMyProducts`), `engagement` (wishlist / recently-viewed / reviews / Q&A).
- [x] **17 `/api/v1` routes** — `catalog/{categories,products,products/[slug],products/[slug]/reviews,products/[slug]/questions}` · `search` · `search/nearby` · `vendors/{[id],[id]/products,me,onboarding,kyc/review,products,products/[id],products/[id]/publish}` · `me/{wishlist,recently-viewed}`. `withApi` gained a `params` arg for dynamic segments. Live-verified via curl.
- [x] **Contracts** — `packages/contracts/src/catalog.ts` → `openapi.json` **30 paths / 35 ops** (path params emitted).
- [x] **Vitest** — +9 catalog integration tests (tenant scope, multi-vendor offers, cross-tenant 404, FTS + typo trigram, onboarding→KYC→publish gate). 18 TS tests green.
- [x] **Mobile** — `lib/api/catalog_models.dart` + `StallApi` catalog methods; `features/catalog/` providers + screens: home feed · category explorer · category grid (sort) · search (query/sort/empty/error) · product detail (gallery, multi-seller offers, variants, reviews, write-review, ask-question, wishlist) · vendor storefront · wishlist · seller hub (onboarding → KYC-pending → dashboard) · add/edit product wizard (+publish). `HomeShell` tabs render real bodies from `bootstrap.nav`. analyze 0 / 9 tests.
- [x] **Promotions read-side** (S9 cont.) — `Promotion`/`PromotionItem` (migration `20260901235617_promotions_readside`), `@stall/core/catalog` `promotions` + `home` (`homeRails`) + `similarProducts`, 4 routes (`catalog/home`, `promotions`, `promotions/[slug]`, `catalog/products/[slug]/similar`), 5 seed promos. *Sponsored/boosted cards + `Campaign`/`Advertisement` write-side stay Phase 7.*
- [x] **Mobile depth** (S9 cont.) — home rails (flash-deal carousel + countdown + strikethrough, banner cards, campaign/new/top/recent rails), `DealsScreen`, `NearbyVendorsScreen` (GoogleMap + list), product fullscreen gallery + "similar" rail, search price-filter sheet + recent searches, `BusinessDocsScreen` (doc upload), seller stats card (`vendors/stats`). Remaining: real geolocation (needs a `geolocator` dep), product video, per-vendor map coords, richer personalisation.
- [ ] **Migrate legacy gas listings** — **N/A this session**: no production gas listings exist (pre-prod); the gas catalog is seed data in the `VendorOffer`/`GasCylinderListing` shape already. Revisit only if real legacy data appears.
- [ ] **Device e2e** — run `mobile/` against the live API: home rails → category → search (+filter) → product → similar → wishlist; vendor onboard → (STAFF `POST /vendors/kyc/review`) → add product → publish → appears in `/catalog/products` + seller stats. Also closes the deferred Phase-1 device sign-off.

**Exit:** on both platforms a customer can browse categories, search, filter by location, open
a product with multiple vendor offers, and view a vendor page; a vendor can register, pass
business KYC (mock reviewer), and publish a product; all Tizzi-Gas listings visible under
`catalog.scope='gas'`. **All backend + mobile screens are code-complete and gate-green (S9);
only a device e2e pass remains before Phase 2 closes.** (Sponsored/advertising write-side and
real geolocation are explicitly Phase 7 / later.)

---

## Phase 1 — Identity & platform core ✅ CODE-COMPLETE (S6–S8)

Branch `stall-rebuild`. Every checklist item done; all gates green. Open thread carried into
Phase 2: a device/emulator run of register → role-switch → capability gate against the live API.

- [x] **Schema v2 Domains 0+1+2** — `packages/db/prisma/schema.prisma` rewritten (Domain 0 platform/config/system, Domain 1 identity/access with relational `UserRole`, Domain 2 profiles). Fresh baseline migration `20260901191354_init` (hand-added `CREATE EXTENSION postgis` + 5 GiST indexes on `geography` columns). Old v1 gas models + migrations dropped. `prisma migrate reset` (user-consented) + `deploy` on the local `stall` DB → **43 tables, PostGIS 3.5.2, 5 GiST indexes**.
- [x] **Seed** (`packages/db/prisma/seed.ts`) — 4 currencies, 3 regions, `grandprice` + `tizzi-gas` platforms, 12-flag registry, 24 `PlatformFeature` rows. Verified: `grandprice` auction/advertising=**true** catalog.scope=**all**; `tizzi-gas` auction/advertising=**false** catalog.scope=**gas**. Starter `FeeSchedule` + `PricingRule` + `AppConfig`. (Gas `Category` moves to Phase 2 / Domain 3.)
- [x] **Legacy RPC retired** — 6 Tizzi-Gas services → `apps/api/_legacy_services/` (excluded from tsc + eslint); catch-all `/api/[...api]` route gutted to `test` + `410 ENDPOINT_MIGRATED`. `lib/{utils,email,constants,email-templates,prisma}.ts` kept (compile clean).
- [x] **`packages/core`** (`@stall/core`) — new shared-domain package. `crypto` (argon2id via `@node-rs/argon2` — prebuilt, no C++ toolchain; sha256 for refresh lookup; numeric OTP), `jwt` (EdDSA via `jose`, `TokenEpoch`-aware `AccessClaims`), `auth/{sms,otp,identity,tokens}`, `platform/{features,nav,bootstrap}`, `errors` (`AppError` + codes).
- [x] **Auth flows** — OTP issue+verify (SMS `log` adapter for dev / email via Mailpit), `issueTokenPair` (new session + family), `rotateTokenPair` (**reuse-detection → revoke family**), `switchRole`, `revokeSession`/`revokeAllForUser` (+epoch bump), `listSessions`, `registerDevice`, `findOrCreateUserByPhone` + `markPhoneVerified`. Session gained `activeRole` + `platformSlug` (migration `20260901201604`).
- [x] **`/api/v1` routes** — `apps/api/src/http/{envelope,context,dto}` + `auth/{otp,verify,refresh,logout,sessions,switch-role}` + `config/bootstrap`. Envelope `{ok,data,error,meta}`, `AppError`→status mapping, `getContext` (X-Platform/X-Device-Id/bearer→principal + TokenEpoch check).
- [x] **Capability resolver + bootstrap** — `resolveFeatures` (platform ∩ role ∩ region ∩ user-override), `hasFeature`/`assertFeature`, `buildBootstrap`. **Verified live:** `GET /config/bootstrap` returns `auction=true`/`catalog.scope="all"` for `grandprice`, `auction=false`/`"gas"` for `tizzi-gas`; authed → `activeRole` + role-based `nav`. Full flow curl-tested (verify→tokens→refresh→**reuse-detect**→switch-role 403).
- [x] Social sign-in (`/api/v1/auth/social` — Google/Apple via JWKS, Facebook via Graph) · **TOTP 2FA** (`/api/v1/auth/2fa` enroll/confirm/status/disable + recovery codes; login MFA gate) · **transaction PIN** (`/api/v1/auth/pin`, argon2id + lockout) · **password** (`/api/v1/auth/password`).
- [x] **`withApi` middleware wrapper** — Zod body/query, `auth`/`Role` guard, `capability` gate, Redis rate-limit, `Idempotency-Key` replay, `AuditLog`. All 12 `/api/v1` routes use it. `@stall/core/redis` (shared ioredis + `rateLimit`).
- [x] **`_compat` bridge** — `apps/api/app/api/[...api]` maps `auth.send-otp`/`verify-otp`/`refresh-token` to the new flows (old shape); other actions → `410`.
- [x] **Exit gate + tests** — `GET /api/v1/auctions/ping` (`capability: "auction"` → 200 grandprice / 403 tizzi-gas). **Vitest** wired as the repo test runner; 9 integration tests green (`@stall/core`: refresh rotation · reuse-detection · epoch bump · capability resolver — `@stall/api`: the `/auctions/ping` gate 200/403/401).
- [x] **Contracts → OpenAPI** — `packages/contracts/src/auth.ts` (11 auth ops + bootstrap + `auctions/ping` as Zod, shared models); `build-openapi.ts` emits real paths, query params, bearer security, standard error envelope (400/401/403/404/429) → `openapi.json` (13 paths / 14 ops). *Dart client is hand-written, not generator-emitted (see DECISION LOG S8).*
- [x] **Mobile auth (screens 1–20 + §32)** — `mobile/lib/api/` hand-written typed dio client (`StallApi` + models, envelope unwrap, one-shot 401→refresh→retry→`forceLogout`), `TokenStore` (flutter_secure_storage), Riverpod `AuthController` + `bootstrapProvider`, `go_router` auth/onboarding redirect. Screens: splash · onboarding ×3 · welcome (+social) · phone & email OTP request · OTP entry (resend countdown + TOTP challenge) · social · forgot/reset/create password · account recovery · select-role + switcher sheet · signed-in devices · security alert · suspended/disabled. `AppBottomNav` from `bootstrap.nav`; `HomeShell` account tab (sessions, 2FA, PIN, password, logout). `flutter analyze` 0, `flutter test` 5.

**Exit:** phone-OTP register on Flutter → access+refresh → role switch → `bootstrap` returns
different `features` for `grandprice` vs `tizzi-gas` → an auction endpoint `403`s under
`tizzi-gas`; refresh-rotation + reuse-detection covered by integration tests.
→ **Backend + client code all in place and gate-green.** Only outstanding confirmation: an
on-device run of the full flow against the live API (no emulator was run this session).

---

## Phase 0 — Foundation ✅ DONE (S3–S5)

- [x] pnpm + Turborepo monorepo (`apps/*`, `packages/*`, `mobile/`, `infra/`); `tsconfig.base.json`; `.npmrc`, `.nvmrc`, `.gitattributes`
- [x] `git mv` Next.js app → `apps/api`; upgrade Next **15.4 → 16.3.4** (Turbopack, `typedRoutes`, flat `eslint-config-next`); dropped unused `next-auth`, `socket.io` from api
- [x] Prisma **6 → 7.10.0** in `packages/db`: `prisma-client` generator (ESM, `../src/generated`), `@prisma/adapter-pg` driver adapter, `prisma.config.ts` (loads root `.env`), singleton in `src/index.ts`, `@/lib/prisma` shim kept. Schema still v1.
- [~] `bcryptjs` → `argon2` — **deferred to Phase 1** (only `lib/utils.ts` uses it, unused by the OTP flow; swap belongs with the auth rebuild)
- [x] `infra/docker/docker-compose.yml` — postgres+postgis 16, redis 7, minio (+bucket init), mailpit, meilisearch(profile). `.env.example`. Validated with `docker compose config`; **live `up` not verified (Docker Desktop was off)**
- [x] `packages/config` — zod env loader (`env`, `loadEnv`)
- [x] `packages/tokens` — `tokens.json` (measured) + zero-dep `build.mjs` → `dist/tokens.ts`, `dist/tokens.css`, `mobile/lib/design/tokens.g.dart` (`AppColors` ThemeExtension, `AppType`, `AppSpace`, `AppRadius`). *Style Dictionary swap = later if needed.*
- [x] `packages/contracts` — `envelope.ts` + `routes.ts` (health, config/bootstrap) → `openapi.json` via zod v4 `z.toJSONSchema`. *Full path-param generator + Dart client = Phase 1.*
- [x] `apps/realtime` skeleton (Fastify + Socket.IO, 4 namespaces, `/health`); `apps/worker` skeleton (BullMQ `outbox-relay`, `/health`)
- [x] `.github/workflows/ci.yml` — node (build/typecheck/lint) + flutter (analyze/test) + docker-config jobs
- [x] `mobile/` — `flutter create --empty`; deps: riverpod, go_router, dio, font_awesome_flutter, google_maps_flutter; `AppTheme` from `tokens.g.dart`; `lib/{app,design,features,api,core}`; `test/smoke_test.dart` (asserts primary == `#FF6200`)
- [x] cleanup: 9 legacy `.md` → `docs/legacy/`; removed `package-lock.json`, stale `.next`; `.gitignore` rewritten

**Exit criteria — ALL MET:** ✅ `pnpm -r build` · ✅ `pnpm -r typecheck` · ✅ `@stall/api`
lint (0 err) · ✅ `flutter analyze` · ✅ `flutter test` · ✅ `prisma migrate deploy` ·
✅ api + realtime + worker booted & health-checked · ✅ DB-backed request returns real data ·
✅ email round-trip. Verified on **both** the Docker compose stack (S5 — Postgres+PostGIS 3.5,
Redis, MinIO+bucket, Mailpit all healthy) **and** the no-Docker fallback (S4).

## NEXT ACTIONS (ordered, concrete — start here on resume)

1. **Device e2e (closes Phase 1 sign-off + Phase 2 exit)** — `flutter run --dart-define=STALL_API_URL=http://10.0.2.2:3000`.
   Customer: phone-OTP register (code in the api log, `SMS_PROVIDER=log`) → home feed → open a
   category → search `laptop` → product detail (multi-seller) → heart it → Wishlist tab.
   Vendor: account tab → "Sell on Stall" → onboard → `POST /api/v1/vendors/kyc/review`
   `{vendorId, decision:"APPROVED"}` from a STAFF token (or Studio) → add product → publish →
   confirm it appears in `/catalog/products`. Under `--dart-define=STALL_PLATFORM=tizzi-gas`
   confirm only gas categories/products show.
2. **Phase 3** — Domain 4 (cart, orders, fulfilment, payments, wallet). Expand
   `docs/04-SCREEN-CATALOG.md` §06–07, §19; schema + `@stall/core` + `/api/v1/{cart,checkout,orders,wallet}`;
   mobile cart/checkout/orders screens. See `docs/05-ROADMAP.md` §Phase 3.
3. **Phase 2 polish (non-blocking)** — `geolocator` for real device location + per-vendor map
   coords; product video media; boosted-card placeholder wiring for Phase 7.

### Deferred / user-owned
- Rename repo folder `tizziserver` → `stall` (locked in-session): close IDE, `cd 'E:\Projects\NextJs'; Rename-Item tizziserver stall`, reopen at new path. GitHub repo rename + `git remote set-url` yourself.
- Merge `stall-rebuild → main` when ready.

### Resume the dev env
Docker stack is up (`restart: unless-stopped`). `pnpm dev`. Redis rate-limit keys: `docker exec stall-redis-1 redis-cli FLUSHALL` to reset during testing.

### Tests
`pnpm test` (→ `turbo run test`). **Integration-only** — needs the Docker `stall` DB up + seeded
(`pnpm db:seed`). CI runs them in a `node (integration tests)` job with a `postgis/postgis:16-3.5`
service. Add a `vitest.config.ts` + `test/` to any package that grows testable logic.

### Deferred / user-owned
- **Rename the repo folder** `tizziserver` → `stall` (locked in-session). Close IDE + terminals,
  then `cd 'E:\Projects\NextJs'; Rename-Item tizziserver stall`, reopen at the new path
  (`pnpm install` if paths complain). GitHub repo rename + `git remote set-url` — do yourself.
- Merge `stall-rebuild → main` when ready (6 commits: monorepo → dev-env → rename → Docker →
  schema-v2).
4. Wire `@stall/config` into `apps/api` (replace direct `process.env` reads in `lib/constants.ts`, `lib/email.ts`).
5. (optional, non-blocking) B1c — real Figma Variables if Enterprise/Tokens Studio becomes available.

### To resume the running dev env
Docker stack is up (Postgres/Redis/MinIO/Mailpit, `restart: unless-stopped`) — just `pnpm dev`.
If containers are down: `docker compose -f infra/docker/docker-compose.yml --env-file .env.example up -d`.
No-Docker fallback: `pnpm dev:db` · `pnpm dev:redis` · `pnpm dev:mail` (+ point `.env` DATABASE_URL at `postgres@localhost`). See `docs/DEV_SETUP.md`.

## BLOCKERS / NEEDS FROM USER

| # | Need | Blocks | Status |
|---|------|--------|--------|
| B1 | ~~GrandPrice reference image / brand guide~~ | ~~Final brand palette~~ | **RESOLVED** by Figma export (S2). Only open bit: no dark theme in Figma — `03-DESIGN-SYSTEM.md` dark columns are derived, need a review pass. |
| B1b | ~~Populate the Figma file + run `npm run figma:pull`~~ | ~~Locking the design blueprint~~ | **RESOLVED** S2 — 64 frames pulled to `docs/design/Untitled/`, tokens mined, docs reconciled. Re-run `npm run figma:pull` whenever the Figma file changes. |
| B1c | (optional) Enterprise Figma or a token export plugin (Tokens Studio) for real Variables — REST `variables/local` returned 403 | Formal token collection with Light/Dark modes; not blocking (values were mined from nodes) | OPEN — low priority |
| B2 | ~~Rename repo folder?~~ | — | **DECIDED (S5): rename to `stall`.** OS move is blocked in-session (folder locked); manual steps in NEXT ACTIONS #1. |
| B3 | GCP project + billing, Cloudflare account | Phase 8 (cloud deploy) only | OPEN (not yet needed) |
| B4 | Payment provider accounts (Paystack/Flutterwave sandbox) | Phase 3 | OPEN (not yet needed) |
| B5 | Google Maps Platform API key(s) | Phase 4 | OPEN (not yet needed) |
| B6 | Firebase project (FCM) | Phase 4/6 | OPEN (not yet needed) |

## DECISION LOG (append-only, newest first)

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-09-01 (S9) | **Promotions carry `PromotionItem.discountBps`; deal prices are computed, not stored.** A flash-deal item's `dealPriceMinor = round(minActiveOfferPrice · (1 − bps/10000))` at read time. Offers/variants are never mutated by a promotion. `BANNER` promos have no items (just `imageKey` + `ctaRoute`); `CAMPAIGN`/`FLASH_DEAL` do. | Keeps the offer the single source of truth for price; a promo ending never needs a price rollback. Basis points avoid float drift. Advertising/boost economics (`Campaign`, `AdEvent`) are a separate Phase-7 concern. |
| 2026-09-01 (S9) | **`GET /api/v1/catalog/home` returns all home rails in one call** (`homeRails`): flash/campaign/banner promos + `newArrivals` + `topRated` + `recentlyViewed`. The mobile home feed is one `FutureProvider`. | One round-trip on the hottest screen; the client doesn't orchestrate 5 requests. Rails can be added server-side without a client release. |
| 2026-09-01 (S9) | **Nearby-vendors uses a fixed Accra fallback centre (`kDefaultLatLng`), no geolocation dep.** The map fans markers out around the centre (the vendor DTO has distance, not coords). | Avoids pulling `geolocator` + platform permission plumbing into Phase 2; the endpoint already does the PostGIS distance math. A real device-location + per-vendor coords pass is a later refinement. |
| 2026-09-01 (S9) | **Catalog scoping is by `Product.platformSlugs` (array `has` filter), not the `catalog.scope` flag.** `catalog.scope` (`"all"`/`"gas"`) stays in `bootstrap` for the client to theme/label; server-side tenant isolation is `platformSlugs @> [ctx.platform]` on every catalog query (empty ⇒ all tenants). Cross-tenant reads 404. | The flag is always truthy so `assertFeature` can't gate on it; an explicit per-row tenant list is precise, index-friendly, and lets one product list on several tenants later. |
| 2026-09-01 (S9) | **Product search = Postgres FTS + `pg_trgm`, maintained by a DB trigger, queried via `$queryRawUnsafe`.** `Product.searchVector` is `Unsupported("tsvector")`; a `BEFORE INSERT/UPDATE` trigger rebuilds it (title A / brand B / description C). Queries use `websearch_to_tsquery('simple', …)` with a `title % :q` trigram fallback for typos. No Meilisearch yet. | Zero extra infra, good enough for Phase 2 scale, survives Prisma migrations (trigger + hand-added GIN indexes live in the migration SQL, documented in `packages/db/README.md`). Meilisearch (compose profile) can front it later without schema change. |
| 2026-09-01 (S9) | **`KycCase` is a standalone table keyed `@@unique([subjectType, subjectId])`, no FK to the subject.** A mock `reviewVendorKyc` (STAFF/ADMIN route) flips `status` + syncs `VendorProfile.status` + the `UserRole`. | One review-case shape serves vendors now and couriers in Phase 4; skipping the polymorphic FK keeps it simple. Real STAFF console is §24 (Phase 6). |
| 2026-09-01 (S8) | **The Flutter API client is hand-written, not generated.** `packages/contracts` stays the OpenAPI source of truth (Zod → `openapi.json`); `mobile/lib/api/` is a hand-authored dio wrapper + plain model classes kept faithful to those schemas. A drift check (contract vs route DTOs vs Dart) is a Phase-2 task. | `openapi-generator` needs a JVM in CI and emits non-idiomatic Dart; the surface is ~14 ops. A hand client gives the envelope-unwrap + one-shot refresh-rotation behaviour the screens need, with far less machinery. Revisit if the surface balloons. |
| 2026-09-01 (S8) | **Test runner = Vitest**, one `vitest.config.ts` per package (`packages/core`, `apps/api` so far). Tests are **integration-first** — they run against the live Docker `stall` DB (seed required), no mocking of Prisma/Redis. `test/setup.ts` loads the root `.env`; `pnpm test` → `turbo run test` (`dependsOn: ^build`). A package's `tsconfig` `include` is widened to cover `test/` so test code is typechecked. | Fast, ESM-native, zero-config with the Vite resolver (handles `workspace:*` + raw-`.ts` `exports`). The auth surface's risk is in real DB state transitions (rotation, family revoke, epoch) — mocks would test nothing. |
| 2026-09-01 (S7) | **argon2 via `@node-rs/argon2`** (Rust, prebuilt binaries) instead of the `argon2` npm package. | `argon2` needs node-gyp + a C++ toolchain; there's no Visual Studio on this machine and the prebuild download failed. `@node-rs/argon2` ships per-platform `.node` binaries, zero build step, same argon2id. |
| 2026-09-01 (S7) | **JWT = EdDSA (Ed25519)** via `jose`, keys as base64 DER (PKCS8/SPKI) in env, wrapped to PEM at load. Access token carries `ver` (TokenEpoch); `getContext` rejects tokens whose `ver` ≠ the user's current epoch. Refresh = 256-bit opaque, stored `sha256` for O(1) lookup, `familyId` chain, rotate-on-use, replay of a rotated token ⇒ revoke the whole family. | Roadmap-specified. sha256 (not argon2) for refresh because it's already high-entropy. |
| 2026-09-01 (S7) | **PostGIS geo DDL is hand-managed.** `prisma migrate dev` can't see GiST indexes on `Unsupported()` columns → it emits `DROP INDEX` for them every run. Workflow: `migrate dev --create-only`, delete the `DROP INDEX "..._gist"` lines, hand-add any new geo index, `migrate deploy`. Documented in `packages/db/README.md`. | No clean Prisma-native option for GiST-on-geography; explicit + reviewed SQL beats fighting the differ. |
| 2026-09-01 (S6) | **Schema v2 = a clean rewrite, not a migration from v1.** Dropped the gas-era models (`Order`/`Vendor`/`Customer`/`Courier`/…) and both v1 migrations; new baseline `init` covers Domains 0+1+2 only (3–10 arrive in Phases 2–6). The 6 legacy `{action}`-RPC services are archived under `apps/api/_legacy_services/` (excluded from build); the catch-all route returns `410 ENDPOINT_MIGRATED`. `_compat` for the gas app's `auth.*` comes with the auth module later in Phase 1. | 0 production rows; roadmap already mandated a fresh v2 baseline. Keeping v1 models alongside v2 would fork `User` and bloat the schema. Gas-app clients are pre-production. |
| 2026-09-01 (S6) | **PostGIS via raw migration SQL**, not the Prisma `postgresqlExtensions` preview. `geography(Point/Polygon, 4326)` columns modelled as `Unsupported(...)`; `CREATE EXTENSION` + `CREATE INDEX … USING GIST` hand-appended to `init/migration.sql` (generated with `migrate dev --create-only`). | Avoids a preview-feature flag; the GiST indexes Prisma can't express are explicit and reviewable. Re-generate future geo migrations the same way. |
| 2026-09-01 (S5) | **Docker compose image tags pinned** (`postgis/postgis:16-3.5`, `minio/minio:RELEASE.2025-04-22…`, `minio/mc:RELEASE.2025-04-16…`, `axllent/mailpit:v1.21`, `getmeili/meilisearch:v1.12`). MinIO healthcheck rewritten to `mc alias set … && mc ready`. `.env`/`.env.example` DB default → Docker form (`stall:stall@localhost:5432/stall`). | After the Docker Desktop factory-reset, floating `:latest` tags resolved to corrupt/mismatched layers → containers restart-looped with `exec format error` (even though VM + image arch were both amd64). Fresh pinned tags work; `redis:7-alpine` and `alpine:3` were unaffected. |
| 2026-09-01 (S5) | **Engine renamed `GrandPrice` → `Stall`.** Stall = the multi-tenant marketplace+delivery engine; **GrandPrice** and **Tizzi Gas** are `Platform` tenants on it. Package scope `@grandprice/*` → `@stall/*`; Flutter `Gp*` → `App*`; root pkg + Flutter pkg name → `stall`; dev DB `grandprice` → `stall`; resume keyword `RESUME/SAVE/STATUS GRANDPRICE` → `… STALL`; memory files `grandprice-*` → `stall-*`; docs prose separates engine vs tenant. **Tenant slugs `grandprice` / `tizzi-gas` unchanged** (they're `Platform.slug` values). | User: the name must be universal — "we strip GrandPrice and TizziGas out"; both are just marketplaces (gas vs general goods) with per-tenant feature switches over the same engine. Data model already used `Platform` for tenants, so this only formalizes naming. |
| 2026-09-01 (S4) | **Dev stack runs without Docker.** Native PostgreSQL 16 cluster in `./.pgdata` (`scripts/dev-postgres.mjs`, trust auth, `pnpm dev:db`), `redis-server` (scoop, `pnpm dev:redis`), `maildev` (npm devDep, `pnpm dev:mail`, SMTP :1025 / UI :1080). Docker Compose file retained as the intended path. | Docker Desktop's WSL2 backend is broken on the machine (`vpnkit-bridge handshake failed`; `Restart-Service`/service-start need admin). Native services were already installed. |
| 2026-09-01 (S4) | **`NODE_ENV` must never be in `.env`.** Removed from `.env`/`.env.example`. | `dotenv -e .env` injected `NODE_ENV=development` into `next build`, causing a React dev/prod mismatch → `/_global-error` prerender crash (`useContext` of null). Tooling sets `NODE_ENV` itself. |
| 2026-09-01 (S4) | `apps/api/lib/email.ts` made sandbox-friendly: defaults to `localhost:1025`, omits SMTP `auth` when `SMTP_USER` empty, `from` uses `EMAIL_FROM`. Expired prod SMTP (`smtp.titam.email`) is no longer referenced. | User's prod SMTP expired; dev uses maildev/Mailpit which need no auth. |
| 2026-09-01 (S3) | **Prisma 7 uses driver adapters** — `url`/`directUrl` removed from `schema.prisma`; connection string now in `prisma.config.ts` (CLI, loads root `.env` via dotenv) and `new PrismaClient({ adapter: new PrismaPg({ connectionString }) })` (runtime, from `@stall/config`). Generator is `prisma-client` (not `-js`), ESM, output `packages/db/src/generated`. | Mandatory in Prisma 7.10; `@prisma/adapter-pg` + `pg`. |
| 2026-09-01 (S3) | Monorepo uses **pnpm `workspace:*` + package `exports` (raw `.ts`)** for internal packages, resolved via symlinks + Next `transpilePackages` — no TS path aliases for `@stall/*`. `tsconfig.base.json` sets `allowImportingTsExtensions` + `noEmit` for all. | Simplest that builds under Next 16 Turbopack + `tsx` for node services. |
| 2026-09-01 (S3) | **argon2 swap deferred to Phase 1.** Kept `bcryptjs`/`jsonwebtoken` in `apps/api` for Phase 0. | `bcryptjs` is only in `lib/utils.ts` and unused by the live OTP flow; swapping crypto without the Phase 1 auth rebuild is churn. |
| 2026-09-01 (S3) | Phase 0 tooling: **zero-dep `build.mjs`** for tokens (not Style Dictionary yet); **zod v4 `z.toJSONSchema`** for `openapi.json` (not a full generator yet). Both flagged to upgrade in Phase 1 when the surface grows. | Avoid large dep trees for skeletons; keep CI fast. |
| 2026-09-01 (S3) | Local dev loads a single **root `.env`** into every app via `dotenv-cli -e ../../.env` in each `dev`/`build`/`start` script (shared DB/Redis across services). | One source of truth; Next only reads its own dir otherwise. |
| 2026-09-01 (S2) | **GrandPrice is an "Inverse Draw" platform**, not a classic auction: seat/ticket pool at a `ticketPrice`, sell-out triggers an auditable draw, winner buys the item at a low `winTarget` (retail struck-through), unsold → wallet refund; retail purchase coexists. `02-DATA-MODEL.md` Domain 7 reworked (`Auction` gets `seatsTotal/seatsSold/ticketPriceMinor/winTargetMinor/retailValueMinor/drawTrigger/nonWinnerPolicy`; `AuctionTicket`=seat; add `WinTargetPurchase`; `AuctionRefund.reason=UNSOLD_DRAW`). | Confirmed by Figma frames `inverse-auction-hub`, `auction-detail`, copy "LIVE INVERSE DRAW / Win a Mercedes S-Class for $10K / 2,340 of 5,000 seats sold", wallet "Wallet Refund (Unsold Draw)" |
| 2026-09-01 (S2) | **Design system = measured, not seeds.** Brand orange `#FF6200` (+ gradient `#FF5C00→#C61F00`) on warm cream `#FAF9F6`, warm-black `#111111` ink, warm-gray borders `#EFECE8`. Fonts **Outfit** (600/700/800 display) + **Inter** (400/600/700 body). Radii pill/16/20; very soft shadows + `brand-glow`; spacing 2/4/6/8/10/12/14/16/20/24/32/40. No letter-spacing/uppercase anywhere. `03-DESIGN-SYSTEM.md` §1–4 + §9 rewritten from `docs/design/Untitled/extracted-tokens.json`. | Extracted from the 64-frame Figma export via `scripts/figma-extract-tokens.mjs` + reading `renders/*.png` |
| 2026-09-01 (S2) | Design device baseline **390×844** (iPhone 13/14). No dark theme in the Figma file — dark token columns are our derivation, flagged for review. | Only frame size in the export (plus one 390×1267 scroll frame) |
| 2026-09-01 | Monorepo: pnpm workspaces + Turborepo; `apps/api` (Next.js), `apps/realtime` (Fastify+socket.io), `apps/worker` (BullMQ), `mobile/` (Flutter), `packages/{db,core,contracts,config,tokens}`, `infra/` | Atomic backend+app changes, shared contracts/types/tokens |
| 2026-09-01 | Auth: custom JWT — short-lived access (~15m) + rotating opaque refresh (hashed, per-device) + phone/email OTP + social (ID-token verify) + TOTP 2FA + transaction PIN; `activeRole` claim + role-switch endpoint; argon2id hashing | Identical flow for Flutter + web, no vendor lock-in, full control of security surface |
| 2026-09-01 | Cloud target: GCP Cloud Run (api/realtime/worker as separate services) + Cloud SQL Postgres+PostGIS + Memorystore Redis; Cloudflare in front (DNS/WAF/CDN/R2/Turnstile/Images); Terraform IaC | socket.io works natively on Cloud Run; Cloudflare free tier usable in dev |
| 2026-09-01 | DB: PostgreSQL 16 + PostGIS; Prisma v7 (`prisma-client` generator, ESM, no rust engine) | Geo is core (nearby, zones, tracking); v7 is the current best practice |
| 2026-09-01 | API style: versioned REST `/api/v1/*` with OpenAPI generated from Zod; generate a Dart client for Flutter. Retire the single `action` RPC dispatcher (keep a compat shim for Tizzi Gas during migration) | Flutter has no tRPC; OpenAPI → typed Dart client is the clean path |
| 2026-09-01 | Multi-platform gating: `Platform` + `FeatureFlag` tables; every request carries `X-Platform`; middleware computes `ctx.features = platform ∩ role ∩ user-overrides ∩ region`. Auction/tickets gated OFF for `tizzi-gas` | User requirement: "the auction system is not supposed to be part of all platforms" |
| 2026-09-01 | Fresh schema v2 (gas DB is tiny/pre-prod). Generic `Order`; gas specifics move to product attributes / `GasCylinderListing`. Seed `grandprice` + `tizzi-gas` platforms | Clean base beats contorting the gas-only schema |
| 2026-09-01 | Realtime: dedicated `apps/realtime` socket.io gateway + Redis adapter + transactional outbox (`OutboxEvent`) relay; namespaces `/tracking`, `/chat`, `/notifications`, `/delivery-ops` | Reliable fan-out, horizontally scalable, no lost events |
| 2026-09-01 | Session-1 scope = planning corpus in `docs/` only, no code changes | User chose "Master plan + resume system" as first deliverable |

## SESSION LOG

| Date | Session | What changed |
|------|---------|--------------|
| 2026-09-01 | 9 (cont.) | **Phase 2 depth — promotions + home rails + remaining screens.** Schema: `Promotion` + `PromotionItem` (migration `20260901235617_promotions_readside`). Seed +5 promos, +2 products. `@stall/core/catalog`: `promotions` (active/by-slug, computed deal price), `home` (`homeRails`), `similarProducts`, vendor `addBusinessDocument`/`listBusinessDocuments`/`vendorStats`. 9 new routes → `openapi.json` 36 paths / 42 ops. +5 Vitest (`promotions.test.ts`) → 23 TS green. Mobile: home feed rebuilt on `homeRails` (flash carousel + countdown + strikethrough, banner cards, rails), `DealsScreen`, `NearbyVendorsScreen` (GoogleMap + list), product fullscreen gallery + similar rail, search price-filter sheet + recent searches, `BusinessDocsScreen`, seller stats card. +4 model tests → flutter analyze 0 / 13 tests. Green: pnpm build/typecheck/lint/test (23) · flutter analyze/test (13). |
| 2026-09-01 | 9 | **Phase 2 — Catalog / vendors / search (backend + mobile slice).** Schema v2 Domain 3 (12 models + `KycCase`) → migration `20260901231947_catalog_domain3` with manual DDL (`pg_trgm`, `searchVector` trigger, 3 GIN indexes; baseline GiST preserved). Seed +vendors/categories/products/offers (multi-vendor phone, gas cylinder + `GasCylinderListing`, Accra locations). New `@stall/core/catalog` (categories/products/search/vendors/engagement). 17 `/api/v1` routes (catalog, search, search/nearby, vendors CRUD + KYC review, me/wishlist, me/recently-viewed); `withApi` gained a `params` arg for `[slug]`/`[id]`. Contracts `catalog.ts` → `openapi.json` 30 paths/35 ops. +9 Vitest catalog tests (18 TS green). Live-verified via curl (tenant scope, multi-vendor detail, gas listing, cross-tenant 404, FTS, nearby 527 m). Mobile: `catalog_models.dart` + `StallApi` methods; `features/catalog/` (home feed, category explorer/grid, search, product detail w/ offers+variants+reviews+Q&A+wishlist, vendor page, wishlist, seller hub onboarding→KYC→dashboard, add/edit product wizard). `HomeShell` tabs render real bodies. flutter analyze 0 / 9 tests. Green: pnpm build/typecheck/lint/test (18) · flutter analyze/test (9). |
| 2026-09-01 | 8 (cont.) | **Phase 1 client — contracts → OpenAPI → Flutter auth.** `packages/contracts/src/auth.ts` (11 auth ops + bootstrap + `auctions/ping` Zod + shared models); `build-openapi.ts` rewritten → real paths/params/bearer/error-envelope, `openapi.json` 13 paths/14 ops. `mobile/`: hand-written typed dio client (`lib/api/` — `StallApi`, models, envelope unwrap, one-shot 401→refresh→`forceLogout`), `TokenStore` (flutter_secure_storage), Riverpod `AuthController`/`bootstrapProvider`, `go_router` auth+onboarding redirect, **screens 1–20** (splash, onboarding, welcome+social, phone/email OTP, OTP entry w/ resend + TOTP, social, forgot/reset/create password, recovery, select-role + switcher, sessions, security alert, suspended/disabled), **§32** `AppBottomNav` from `bootstrap.nav`, `HomeShell` account tab (sessions/2FA/PIN/password/logout). New dep `flutter_secure_storage`. Hardened storage reads for the test env. Green: pnpm build/typecheck/lint/test (9) · flutter analyze (0) · flutter test (5). ACTIVE PHASE → Phase 2. |
| 2026-09-01 | 8 (cont.) | **Phase 1 exit gate + test suite.** `GET /api/v1/auctions/ping` (`capability: "auction"` → 200 grandprice / 403 tizzi-gas / 401 no-token). **Vitest** wired repo-wide (`pnpm test` → `turbo run test`; per-pkg `vitest.config.ts` + `test/setup.ts` loading root `.env`; `packages/core` tsconfig widened to typecheck `test/`). 9 integration tests green vs the Docker `stall` DB: refresh rotation (single family/live session), reuse-detection (family revoke), epoch bump (`revokeAllForUser`), capability resolver grandprice/tizzi-gas, and the `/auctions/ping` route through `withApi`. Green: build (13 v1 routes) · typecheck · lint (0) · test (9). |
| 2026-09-01 | 8 | **Phase 1 — auth hardening + extras.** `withApi` wrapper (Zod parse · auth/role guard · capability gate · Redis rate-limit · Idempotency-Key replay · AuditLog) — all 12 `/api/v1` routes refactored onto it. TOTP 2FA (`@stall/core/auth/credentials` — enroll/confirm/status/disable, recovery codes as hashed array, login `mfaRequired` gate), transaction PIN (argon2id + lockout), password, social sign-in (Google/Apple JWKS, FB Graph). `_compat` bridge for `auth.*` legacy actions. `@stall/core/redis`. Fixed: recovery codes violated `Credential @@unique([userId,kind])` → now one row w/ `params.codes[]`. Verified end-to-end via `scratchpad/authtest.mjs` (2FA lifecycle, MFA-gated relogin, recovery-code login, PIN, rate-limit 429, `_compat` round-trip, AuditLog rows). Green: build/typecheck/lint(0). |
| 2026-09-01 | 7 | **Phase 1 — auth module.** New `@stall/core` (crypto/jwt/auth/platform/errors). argon2 via `@node-rs/argon2` (prebuilt — no VS C++ toolchain on this box; the `argon2` npm pkg failed node-gyp). EdDSA JWT keypair added to `.env`/`.env.example`; `packages/config` gained JWT/OTP/SMS/social keys. `Session.activeRole`+`platformSlug` (migration `20260901201604`, hand-stripped its spurious geo `DROP INDEX`s → `packages/db/README.md` documents the manual geo-DDL workflow). `apps/api/src/http` + 7 `/api/v1` routes. **curl-verified full flow**: OTP→verify→tokens→authed bootstrap (nav)→refresh rotate→reuse-detect→switch-role 403; bootstrap gating grandprice vs tizzi-gas. Green: build/typecheck/lint(0). |
| 2026-09-01 | 6 | **Phase 1 started — schema v2 Domains 0+1+2.** Rewrote `schema.prisma` (platform/config/system + identity w/ relational `UserRole` + profiles). Dropped v1 gas models + both v1 migrations; fresh `20260901191354_init` with hand-added `CREATE EXTENSION postgis` + 5 GiST indexes on `geography` cols. `prisma migrate reset` (**user-consented** — Prisma 7 AI guardrail) + `deploy` on local `stall` DB → 43 tables, PostGIS 3.5.2. New `seed.ts`: currencies/regions, `grandprice`+`tizzi-gas` platforms, 12-flag registry, 24 PlatformFeature rows (gating verified). Archived the 6 legacy RPC services → `apps/api/_legacy_services/` (tsc+eslint excluded); catch-all route → `410 ENDPOINT_MIGRATED`. Green: build, typecheck, lint (0 warnings), seed, DB smoke. |
| 2026-09-01 | 1 | Read spec + repo; confirmed Figma file is empty; 4 architecture decisions locked (monorepo / custom JWT / GCP+Cloudflare / master-plan-first). Created `docs/`: PROGRESS, RESUME, 00-MASTER-PLAN, 01-ARCHITECTURE, 02-DATA-MODEL, 03-DESIGN-SYSTEM, 04-SCREEN-CATALOG, 05-ROADMAP. Saved Figma API responses to `docs/design/`. Wrote project memory. Added `scripts/figma-pull.mjs` + `npm run figma:pull` + `docs/design/README.md` — one-pass reproducible Figma export (user will populate the file first). |
| 2026-09-01 | 2 | User populated the Figma file + gave a new token. Ran `npm run figma:pull` → `docs/design/Untitled/` (64 frames @390×844, `file.json` 31MB, `nodes/Page-1.json`, 64 `renders/*.png`, `manifest.json`; variables 403 — not Enterprise). Wrote `scripts/figma-extract-tokens.mjs` → `extracted-tokens.json` (41 colors, 63 text styles, radii, shadows, spacing). Read 6 key renders. Reconciled `03-DESIGN-SYSTEM.md` (§1–4 + new §9 patterns — real orange/cream/Outfit+Inter system), `02-DATA-MODEL.md` (Domain 7 → Inverse Draw), `04-SCREEN-CATALOG.md` (64-frame → MD-section map). B1/B1b resolved. Still no production code changed. |
| 2026-09-01 | 5 | **Renamed engine → `Stall`** (`@grandprice/*`→`@stall/*`, Flutter `Gp*`→`App*`, keyword `RESUME STALL`, dev DB `stall`, memory files `stall-*`); `docs/` prose separates engine from tenants; tenant slugs unchanged. **Docker Desktop fixed by user → verified the containerized dev path:** brought up the compose stack (had to pin image tags — `:latest` gave `exec format error` after the factory-reset; fixed MinIO healthcheck), enabled PostGIS 3.5, `migrate deploy`, pointed `.env` at Docker PG, re-ran the full smoke (api DB request, realtime/worker health, email→Mailpit) — all pass. `.env`/`.env.example` default → Docker. Re-verified `pnpm -r build/typecheck`, api lint, `flutter analyze/test`. **Repo folder still `tizziserver`** — OS rename locked in-session; manual steps in NEXT ACTIONS. |
| 2026-09-01 | 4 | **Phase 0 verified running.** Docker Desktop WSL backend broken → built a no-Docker dev path: `scripts/dev-postgres.mjs` (native PG 16 in `./.pgdata`), scoop `redis-server`, `maildev` (new devDep) + `dev:db`/`dev:redis`/`dev:mail` scripts. Patched `.env` → local sandboxes (backup `.env.backup.20260901`). `prisma migrate deploy` → both v1 migrations on fresh `grandprice` DB; Prisma 7 + adapter-pg queries confirmed via `packages/db/scripts/smoke.ts`. Booted api/realtime/worker, health-checked all; `vendor.list` returns real DB data; email → maildev round-trip OK. Fixed `next build` regression (removed `NODE_ENV` from `.env`). Made `lib/email.ts` sandbox-friendly. Added `docs/DEV_SETUP.md`. Removed Next-16 auto `AGENTS.md`/`CLAUDE.md` (gitignored). All checks green. |
| 2026-09-01 | 3 | **Phase 0 executed** on branch `phase-0-foundation`. Monorepo (pnpm+turbo): `git mv` app → `apps/api`; new `apps/realtime` + `apps/worker` + `packages/{db,config,tokens,contracts}` + `infra/docker`. Next **15.4→16.3.4**, Prisma **6→7.10.0** (driver adapter + `prisma.config.ts`), flat eslint. `packages/tokens` builds measured Figma tokens → ts/css/`tokens.g.dart`. `mobile/` `flutter create` + token theme + smoke test. `docker-compose.yml` (pg+postgis/redis/minio/mailpit). CI workflow. Legacy `.md` → `docs/legacy/`. **Green:** `pnpm -r build/typecheck`, api lint, `flutter analyze/test`, `docker compose config`. Not run: live `docker compose up`, `prisma migrate`. Fixed 4 latent v1 typecheck bugs (`phone1` on Vendor ×2, `'DELIVERED'` order status, unchecked-index). Not yet committed. |
