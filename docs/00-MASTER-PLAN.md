# GRANDPRICE — MASTER PLAN

**Mission:** Elevate `tizziserver` from a single-purpose gas-delivery backend into **GrandPrice**,
a unified multi-vendor commerce ecosystem — marketplace + ordering + a full delivery/courier
network (live tracking like Bolt/Uber) + an auction engine + wallet/payments + trust & safety —
serving **multiple consumer platforms from one backend**, with **Tizzi Gas kept as a
first-class platform**, not an afterthought.

> One ecosystem: **the customer buys · the vendor sells · the courier delivers · the platform
> governs · the auction engine creates premium opportunities · the wallet moves money · the
> trust system protects everyone.**

---

## 1. Product surfaces

| Surface | Tech | Audience | Notes |
|---|---|---|---|
| **GrandPrice mobile app** | Flutter (`mobile/`) | Customer / Vendor / Courier (role-switched in one binary) | The 522-screen spec in `GrandPrice — Mobile Figma Screen Expansion Specification`. Google Maps + live tracking. |
| **Tizzi Gas mobile app** | Flutter (same codebase, `--flavor tizzigas`) or a slim variant | Customer / Vendor / Courier | Same backend, `X-Platform: tizzi-gas`, auction/advertising features gated **off**, catalog scoped to gas. |
| **Backend API** | Next.js (latest) `apps/api` | All apps + admin | Versioned REST `/api/v1/*`, OpenAPI-described, Dart client generated for Flutter. |
| **Realtime gateway** | Fastify + socket.io `apps/realtime` | Apps + ops | Live courier location, chat, notifications, dispatch board. |
| **Workers** | BullMQ `apps/worker` | — | Payouts, auction draws, KYC pipelines, notification fan-out, ETA refresh, breadcrumb compaction. |
| **Admin / Ops console** | Next.js (in `apps/api`, `/admin`) | Staff | KYC review, dispute desk, feature-flag editor, pricing rules, draw supervision, analytics. Built in Phase 7. |
| **Marketing site** | Next.js (in `apps/api`, `/`) | Public | Overhauls the current starter frontend. Low priority. |

## 2. Core principles

1. **One backend, many platforms.** A `Platform` row + `FeatureFlag`s define each app's
   capabilities. Middleware resolves `ctx.features = platform ∩ role ∩ user-overrides ∩ region`
   on every request. Nav and API surface are generated from the resolved set. Auction endpoints
   `403` on `tizzi-gas`.
2. **Order ≠ Delivery.** They are separate concepts and separate tables (MD §07). An order can
   be fulfilled by pickup, by platform delivery, or by a vendor's own logistics. A delivery can
   exist for an auction prize with no marketplace order.
3. **Multi-vendor by default.** A cart, and an order, can span vendors → `VendorOrder`
   sub-orders, per-vendor fulfillment, per-vendor payout/settlement.
4. **Money is double-entry.** Every balance change is a pair of `LedgerEntry` rows against
   `LedgerAccount`s. Wallet balance is a projection, never a mutable counter.
5. **Roles are additive.** `User` ⟷ `UserRole` (many-to-many), each with its own status/KYC.
   One person can be customer + vendor + courier. `activeRole` in the JWT selects the lens.
6. **Events are reliable.** Domain writes emit `OutboxEvent` in the same DB transaction; a relay
   publishes to Redis → realtime gateway / workers. No lost or phantom events.
7. **Geo is native.** PostGIS for vendor/courier/customer points, service-area and delivery-zone
   polygons; Redis GEO for hot dispatch queries.
8. **Config over hardcode.** Boost tiers, fees, pricing rules, surge, qualification weights,
   feature flags — all backend-configurable (MD §26 explicitly).
9. **Secure by construction.** argon2id, short-lived access tokens + rotating refresh, per-device
   sessions, 2FA, transaction PIN, rate limiting, idempotency keys, append-only `AuditLog`,
   least-privilege RBAC, PII minimization (couriers never see full customer data pre-acceptance).
10. **Local-first infra.** Everything runs in Docker Compose before it touches a cloud. GCP +
    Cloudflare only in Phase 8, via Terraform.
11. **Design is one system.** Flat 2.0, Font Awesome only, responsive typography, light/dark,
    tablet/foldable variants. Tokens are generated once → web + Flutter + admin.

## 3. Technology stack (locked in Session 1)

| Concern | Choice |
|---|---|
| Monorepo | pnpm workspaces + Turborepo; TS project references |
| Backend framework | Next.js **latest** (App Router, Route Handlers, Node runtime) — `apps/api` |
| Realtime | Fastify + socket.io + `@socket.io/redis-adapter` — `apps/realtime` |
| Background jobs | BullMQ on Redis — `apps/worker` |
| Language | TypeScript 5.x (strict), ESM everywhere |
| ORM | **Prisma v7** (`prisma-client` generator, no rust engine / queryCompiler) — `packages/db` |
| Database | PostgreSQL 16 + **PostGIS** |
| Cache / queue / geo-hot / rate-limit / locks | Redis 7 (`ioredis`) |
| Validation | Zod v4 → OpenAPI (`@asteasolutions/zod-to-openapi`) |
| Auth | Custom: argon2id, `jose` for JWT, TOTP (`otpauth`), refresh-token rotation |
| Object storage | S3 API — **MinIO** local, **Cloudflare R2** prod; presigned uploads |
| Search | Postgres FTS first; Meilisearch container optional later |
| Payments | Port + adapters: **Paystack / Flutterwave** (GHS, MoMo), Stripe |
| Maps | Google Maps Platform: `google_maps_flutter`, Directions, Distance Matrix, Places, Geocoding (server-proxied + cached) |
| Push | Firebase Cloud Messaging (Android/iOS) + in-app via socket.io |
| Email | Port + adapter: nodemailer→Mailpit (dev), Resend/SES (prod) |
| Mobile | Flutter (stable), Riverpod, `go_router`, `dio` (generated client), `font_awesome_flutter` |
| Design tokens | W3C DTCG JSON → Style Dictionary → `tokens.ts` / `tokens.dart` / `tokens.css` |
| Observability | OpenTelemetry, Sentry, `pino` structured logs |
| IaC | Terraform (GCP + Cloudflare) |
| CI/CD | GitHub Actions → Google Artifact Registry → Cloud Run |
| Local infra | Docker Compose: postgres+postgis, redis, minio, mailpit, meilisearch(opt), api, realtime, worker |

## 4. Target repository layout

```
tizziserver/                     (repo root — folder name unchanged unless user renames)
├── apps/
│   ├── api/                     Next.js — REST API + /admin console + marketing site
│   ├── realtime/                Fastify + socket.io gateway
│   └── worker/                  BullMQ workers
├── mobile/                      Flutter app (GrandPrice + Tizzi Gas flavors)
├── packages/
│   ├── db/                      Prisma schema, migrations, seed, generated client
│   ├── core/                    domain use-cases shared by api/worker/realtime
│   ├── contracts/               Zod schemas → OpenAPI spec → generated Dart client
│   ├── config/                  zod-validated env loader, shared constants, feature-flag keys
│   └── tokens/                  design tokens + Style Dictionary build
├── infra/
│   ├── docker/                  Dockerfiles + docker-compose.yml + .env.example
│   └── terraform/               GCP + Cloudflare modules
├── docs/                        ← this planning corpus + PROGRESS ledger
└── .github/workflows/           CI
```

## 5. Documents in this corpus

| File | Contents |
|---|---|
| `PROGRESS.md` | **Living ledger** — current state, active phase, next actions, decisions, blockers. Read first. |
| `RESUME.md` | Session resume protocol + key phrases (`RESUME GRANDPRICE`, `SAVE GRANDPRICE`). |
| `00-MASTER-PLAN.md` | This file — vision, principles, stack, layout. |
| `01-ARCHITECTURE.md` | Backend architecture, module boundaries, auth, realtime, geo, infra, security. |
| `02-DATA-MODEL.md` | Prisma v7 schema redesign — every domain, key entities, gating, migration from gas schema. |
| `03-DESIGN-SYSTEM.md` | GrandPrice mobile design system — tokens, type scale, components, from MD §01/§29/§31. |
| `04-SCREEN-CATALOG.md` | All 34 MD sections → module / roles / feature-gate / realtime / maps, + build-status tracking. |
| `05-ROADMAP.md` | Phase 0–8 execution plan with checklists and exit criteria. |

## 6. What is explicitly NOT in the Figma/MD and we are adding

- **Google Maps integration** across the app (map discovery, live delivery map, courier
  navigation, jobs map, service-area polygon editor, location picker) — see
  `03-DESIGN-SYSTEM.md` §Maps screens and `01-ARCHITECTURE.md` §Geo.
- **WebSocket live courier tracking** (Bolt/Uber-style) — `01-ARCHITECTURE.md` §Realtime.
- **Multi-platform feature gating** so Tizzi Gas ≠ GrandPrice — `02-DATA-MODEL.md` §Platform.

## 7. Open inputs still needed from the user

See `PROGRESS.md` → BLOCKERS. Headline items: the **reference image / brand guide** (B1),
the repo-rename decision (B2). Cloud/payments/maps/firebase credentials are Phase-specific and
not blocking yet.
