# STALL — PROGRESS LEDGER

> **This is the single source of truth for "where are we".** Every session updates it.
> Resume a cleared session by typing **`RESUME STALL`** (see `docs/RESUME.md`).
> Flush state before clearing context by typing **`SAVE STALL`**.

Last updated: **2026-09-01** (Session 8)

---

## CURRENT STATE (one paragraph)

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

**Phase 2 — Catalog, vendors, search, discovery.** See `docs/05-ROADMAP.md` §Phase 2 +
`docs/02-DATA-MODEL.md` §Catalog + `docs/04-SCREEN-CATALOG.md` §03–05. Not started.

**Phase 1 — Identity & platform core: CODE-COMPLETE (S6–S8).** Branch `stall-rebuild`. All
checklist items done; every gate green (pnpm build/typecheck/lint/test · flutter analyze/test).
The one open thread is a physical device/emulator run of register → role-switch → capability
gate against the live API — do that first thing in Phase 2 as the last Phase-1 sign-off.

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

1. **Phase 1 sign-off** — run `mobile/` on an emulator/device against the live API
   (`flutter run --dart-define=STALL_API_URL=http://10.0.2.2:3000`): phone OTP register (code in
   the api server log, `SMS_PROVIDER=log`) → land on `HomeShell` → account tab → switch role →
   confirm `bootstrap` nav changes → hit an auction-gated screen under `x-platform: tizzi-gas`
   (`--dart-define=STALL_PLATFORM=tizzi-gas`) and see the 403 surface. Fix anything that breaks.
2. **Phase 2 kickoff** — expand `docs/04-SCREEN-CATALOG.md` §03–05 to per-screen tables; schema
   v2 Domain 3 (catalog: `Category`, `Product`, `Vendor`, `Listing`, media) + migration + seed
   (gas category tree for `tizzi-gas`); `/api/v1/catalog/*` + `/vendors/*` + `/search`.
3. Contracts + Flutter grow per phase: add catalog ops to `packages/contracts`, new screens to
   `mobile/lib/features/`, and a `vitest.config.ts` wherever testable logic lands.

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
