# GRANDPRICE — PROGRESS LEDGER

> **This is the single source of truth for "where are we".** Every session updates it.
> Resume a cleared session by typing **`RESUME GRANDPRICE`** (see `docs/RESUME.md`).
> Flush state before clearing context by typing **`SAVE GRANDPRICE`**.

Last updated: **2026-09-01** (Session 3)

---

## CURRENT STATE (one paragraph)

**Phase 0 is essentially done** (branch `phase-0-foundation`). The repo is now a pnpm +
Turborepo **monorepo**: `apps/api` (Next.js **16.3.4**, the old catch-all route + 6 services
moved in intact), `apps/realtime` (Fastify + Socket.IO skeleton), `apps/worker` (BullMQ
skeleton), `mobile/` (Flutter app booting a token-driven theme), `packages/{db,config,tokens,
contracts}`, `infra/docker`. Prisma upgraded **6 → 7.10.0** (new `prisma-client` generator,
ESM, `@prisma/adapter-pg` driver adapter, `prisma.config.ts`); schema still v1 (Tizzi Gas
baseline). `@grandprice/config` is a zod env loader; `@grandprice/tokens` builds the measured
Figma tokens into `tokens.ts`/`.css`/`mobile/.../tokens.g.dart`; `@grandprice/contracts` emits
a starter `openapi.json`. **All green:** `pnpm -r build`, `pnpm -r typecheck`,
`@grandprice/api` lint (0 errors), `flutter analyze`, `flutter test`, `docker compose config`.
Not yet verified: live `docker compose up` (Docker Desktop wasn't running) and DB migrations.
No feature code written yet — Phase 1 is next.

## ACTIVE PHASE

**Phase 0 — Foundation.** ~95% done on branch `phase-0-foundation`. See `docs/05-ROADMAP.md` §Phase 0.

- [x] pnpm + Turborepo monorepo (`apps/*`, `packages/*`, `mobile/`, `infra/`); `tsconfig.base.json`; `.npmrc`, `.nvmrc`, `.gitattributes`
- [x] `git mv` Next.js app → `apps/api`; upgrade Next **15.4 → 16.3.4** (Turbopack, `typedRoutes`, flat `eslint-config-next`); dropped unused `next-auth`, `socket.io` from api
- [x] Prisma **6 → 7.10.0** in `packages/db`: `prisma-client` generator (ESM, `../src/generated`), `@prisma/adapter-pg` driver adapter, `prisma.config.ts` (loads root `.env`), singleton in `src/index.ts`, `@/lib/prisma` shim kept. Schema still v1.
- [~] `bcryptjs` → `argon2` — **deferred to Phase 1** (only `lib/utils.ts` uses it, unused by the OTP flow; swap belongs with the auth rebuild)
- [x] `infra/docker/docker-compose.yml` — postgres+postgis 16, redis 7, minio (+bucket init), mailpit, meilisearch(profile). `.env.example`. Validated with `docker compose config`; **live `up` not verified (Docker Desktop was off)**
- [x] `packages/config` — zod env loader (`env`, `loadEnv`)
- [x] `packages/tokens` — `tokens.json` (measured) + zero-dep `build.mjs` → `dist/tokens.ts`, `dist/tokens.css`, `mobile/lib/design/tokens.g.dart` (`GpColors` ThemeExtension, `GpType`, `GpSpace`, `GpRadius`). *Style Dictionary swap = later if needed.*
- [x] `packages/contracts` — `envelope.ts` + `routes.ts` (health, config/bootstrap) → `openapi.json` via zod v4 `z.toJSONSchema`. *Full path-param generator + Dart client = Phase 1.*
- [x] `apps/realtime` skeleton (Fastify + Socket.IO, 4 namespaces, `/health`); `apps/worker` skeleton (BullMQ `outbox-relay`, `/health`)
- [x] `.github/workflows/ci.yml` — node (build/typecheck/lint) + flutter (analyze/test) + docker-config jobs
- [x] `mobile/` — `flutter create --empty`; deps: riverpod, go_router, dio, font_awesome_flutter, google_maps_flutter; `GpTheme` from `tokens.g.dart`; `lib/{app,design,features,api,core}`; `test/smoke_test.dart` (asserts primary == `#FF6200`)
- [x] cleanup: 9 legacy `.md` → `docs/legacy/`; removed `package-lock.json`, stale `.next`; `.gitignore` rewritten

**Exit criteria:** ✅ `pnpm -r build`, ✅ `pnpm -r typecheck`, ✅ `@grandprice/api` lint (0 err),
✅ `flutter analyze`, ✅ `flutter test`, ✅ `docker compose config`. ⚠️ live `docker compose up`
+ health checks and `prisma migrate` **still to run once Docker Desktop is up**.

## NEXT ACTIONS (ordered, concrete — start here on resume)

1. `git commit` the Phase 0 branch (240 files). Open a PR `phase-0-foundation → main` (or fast-forward merge).
2. Start Docker Desktop → `docker compose -f infra/docker/docker-compose.yml --env-file .env.example up -d` → confirm all services healthy. Point `.env` `DATABASE_URL` at the local PG, then `pnpm --filter @grandprice/db migrate` to baseline schema v1 locally.
3. Decide **B2** (rename folder `tizziserver` → `grandprice`?). Non-blocking; default = keep.
4. **Begin Phase 1 — Identity & platform core** (`docs/05-ROADMAP.md` §Phase 1): schema v2 Domain 0 (Platform/FeatureFlag) + Domain 1 (identity, multi-role `UserRole`) + Domain 2 profiles; migration + seed (`grandprice` + `tizzi-gas` platforms, flag registry, gas category). This is where **argon2 + jose** replace bcryptjs/jsonwebtoken and the middleware chain + capability resolver + `/api/v1/config/bootstrap` land.
5. Wire `@grandprice/config` into `apps/api` (replace direct `process.env` reads in `lib/constants.ts`, `lib/email.ts`).
6. (optional, non-blocking) B1c — real Figma Variables if Enterprise/Tokens Studio becomes available.

## BLOCKERS / NEEDS FROM USER

| # | Need | Blocks | Status |
|---|------|--------|--------|
| B1 | ~~GrandPrice reference image / brand guide~~ | ~~Final brand palette~~ | **RESOLVED** by Figma export (S2). Only open bit: no dark theme in Figma — `03-DESIGN-SYSTEM.md` dark columns are derived, need a review pass. |
| B1b | ~~Populate the Figma file + run `npm run figma:pull`~~ | ~~Locking the design blueprint~~ | **RESOLVED** S2 — 64 frames pulled to `docs/design/Untitled/`, tokens mined, docs reconciled. Re-run `npm run figma:pull` whenever the Figma file changes. |
| B1c | (optional) Enterprise Figma or a token export plugin (Tokens Studio) for real Variables — REST `variables/local` returned 403 | Formal token collection with Light/Dark modes; not blocking (values were mined from nodes) | OPEN — low priority |
| B2 | Rename repo folder `tizziserver` → `grandprice`? | Monorepo restructure naming | OPEN (proceeding as "keep") |
| B3 | GCP project + billing, Cloudflare account | Phase 8 (cloud deploy) only | OPEN (not yet needed) |
| B4 | Payment provider accounts (Paystack/Flutterwave sandbox) | Phase 3 | OPEN (not yet needed) |
| B5 | Google Maps Platform API key(s) | Phase 4 | OPEN (not yet needed) |
| B6 | Firebase project (FCM) | Phase 4/6 | OPEN (not yet needed) |

## DECISION LOG (append-only, newest first)

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-09-01 (S3) | **Prisma 7 uses driver adapters** — `url`/`directUrl` removed from `schema.prisma`; connection string now in `prisma.config.ts` (CLI, loads root `.env` via dotenv) and `new PrismaClient({ adapter: new PrismaPg({ connectionString }) })` (runtime, from `@grandprice/config`). Generator is `prisma-client` (not `-js`), ESM, output `packages/db/src/generated`. | Mandatory in Prisma 7.10; `@prisma/adapter-pg` + `pg`. |
| 2026-09-01 (S3) | Monorepo uses **pnpm `workspace:*` + package `exports` (raw `.ts`)** for internal packages, resolved via symlinks + Next `transpilePackages` — no TS path aliases for `@grandprice/*`. `tsconfig.base.json` sets `allowImportingTsExtensions` + `noEmit` for all. | Simplest that builds under Next 16 Turbopack + `tsx` for node services. |
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
| 2026-09-01 | 1 | Read spec + repo; confirmed Figma file is empty; 4 architecture decisions locked (monorepo / custom JWT / GCP+Cloudflare / master-plan-first). Created `docs/`: PROGRESS, RESUME, 00-MASTER-PLAN, 01-ARCHITECTURE, 02-DATA-MODEL, 03-DESIGN-SYSTEM, 04-SCREEN-CATALOG, 05-ROADMAP. Saved Figma API responses to `docs/design/`. Wrote project memory. Added `scripts/figma-pull.mjs` + `npm run figma:pull` + `docs/design/README.md` — one-pass reproducible Figma export (user will populate the file first). |
| 2026-09-01 | 2 | User populated the Figma file + gave a new token. Ran `npm run figma:pull` → `docs/design/Untitled/` (64 frames @390×844, `file.json` 31MB, `nodes/Page-1.json`, 64 `renders/*.png`, `manifest.json`; variables 403 — not Enterprise). Wrote `scripts/figma-extract-tokens.mjs` → `extracted-tokens.json` (41 colors, 63 text styles, radii, shadows, spacing). Read 6 key renders. Reconciled `03-DESIGN-SYSTEM.md` (§1–4 + new §9 patterns — real orange/cream/Outfit+Inter system), `02-DATA-MODEL.md` (Domain 7 → Inverse Draw), `04-SCREEN-CATALOG.md` (64-frame → MD-section map). B1/B1b resolved. Still no production code changed. |
| 2026-09-01 | 3 | **Phase 0 executed** on branch `phase-0-foundation`. Monorepo (pnpm+turbo): `git mv` app → `apps/api`; new `apps/realtime` + `apps/worker` + `packages/{db,config,tokens,contracts}` + `infra/docker`. Next **15.4→16.3.4**, Prisma **6→7.10.0** (driver adapter + `prisma.config.ts`), flat eslint. `packages/tokens` builds measured Figma tokens → ts/css/`tokens.g.dart`. `mobile/` `flutter create` + token theme + smoke test. `docker-compose.yml` (pg+postgis/redis/minio/mailpit). CI workflow. Legacy `.md` → `docs/legacy/`. **Green:** `pnpm -r build/typecheck`, api lint, `flutter analyze/test`, `docker compose config`. Not run: live `docker compose up`, `prisma migrate`. Fixed 4 latent v1 typecheck bugs (`phone1` on Vendor ×2, `'DELIVERED'` order status, unchecked-index). Not yet committed. |
