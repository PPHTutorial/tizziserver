# GRANDPRICE — ARCHITECTURE

Companion to `00-MASTER-PLAN.md`. Covers backend structure, request lifecycle, auth, the
multi-platform capability system, realtime, geo, background jobs, security, and infra.

---

## 1. Service topology

```
                 ┌────────────────────────────────────────────────┐
                 │              Cloudflare (prod only)             │
                 │   DNS · WAF · CDN · Turnstile · Images · R2     │
                 └───────────────┬────────────────┬───────────────┘
                                 │                │
                 ┌───────────────▼───┐   ┌────────▼──────────┐
   Flutter  ───▶ │  apps/api         │   │  apps/realtime    │ ◀── Flutter (WS)
   Admin    ───▶ │  Next.js (Node)   │   │  Fastify+socket.io│
                 │  REST /api/v1/*   │   │  /tracking /chat  │
                 │  /admin  /(mktg)  │   │  /notifications   │
                 └───┬────────┬──────┘   └───┬─────────┬─────┘
                     │        │              │         │
        ┌────────────▼──┐  ┌──▼───────────┐  │   ┌─────▼───────┐
        │ Postgres 16   │  │  Redis 7     │◀─┴──▶│ apps/worker │
        │ + PostGIS     │  │ cache/queue  │      │  BullMQ     │
        └───────────────┘  │ geo/pubsub   │      └─────────────┘
                           └──────────────┘
        ┌───────────────┐  ┌──────────────┐
        │ MinIO / R2    │  │ Mailpit/SES  │
        └───────────────┘  └──────────────┘
```

All three Node services import **`packages/core`** (domain use-cases) and **`packages/db`**
(Prisma). `apps/api` owns HTTP; `apps/realtime` owns sockets; `apps/worker` owns jobs. None of
them duplicate business rules — those live in `core`.

## 2. `apps/api` internal structure

Retire the single `app/api/[...api]/route.ts` `action`-dispatcher. Replace with modular route
handlers under a version prefix. Keep a **compatibility shim** that maps the old `{action}` body
to the new handlers until the Tizzi Gas app ships its updated client.

```
apps/api/
├── app/
│   ├── api/v1/
│   │   ├── auth/           route handlers (otp, refresh, social, 2fa, pin, sessions)
│   │   ├── users/          profile, addresses, preferences
│   │   ├── catalog/        categories, products, variants, search, nearby
│   │   ├── vendors/        onboarding, products, orders, wallet, analytics
│   │   ├── cart/  checkout/ orders/  payments/  wallet/
│   │   ├── delivery/       jobs, offers, active, verification, tracking, disputes
│   │   ├── couriers/       onboarding, kyc, vehicles, service-areas, earnings
│   │   ├── auctions/       (gated) auctions, tickets, qualification, draws, prizes
│   │   ├── coupons/  promotions/  campaigns/  boosts/
│   │   ├── chat/  notifications/
│   │   ├── kyc/  reports/  disputes/  support/
│   │   ├── config/         public feature-flag + app-config bootstrap
│   │   └── _compat/        old-RPC shim
│   ├── admin/              Next.js pages — ops console (Phase 7)
│   └── (marketing)/        public site (low priority)
├── src/
│   ├── http/               handler factory, middleware chain, error mapper, OpenAPI reg
│   ├── auth/               token issue/verify, session store, guards
│   ├── platform/           capability resolver (platform ∩ role ∩ overrides ∩ region)
│   └── observability/      otel, sentry, pino
└── openapi.json            generated from packages/contracts
```

### Request lifecycle (every `/api/v1` handler)

1. **Parse** — `X-Platform`, `X-App-Version`, `X-Device-Id`, `Idempotency-Key` headers; body via Zod.
2. **Authenticate** — verify access JWT (`jose`), load minimal principal `{ userId, activeRole, roles[], platform, deviceId }`. Anonymous allowed for whitelisted routes.
3. **Resolve capabilities** — `platform.features ∩ role.features ∩ user.overrides ∩ region.rules` → `ctx.features`. Handler declares required capability; missing → `403 FEATURE_DISABLED`.
4. **Authorize** — RBAC policy check (resource ownership + role + capability).
5. **Rate-limit / idempotency** — Redis token bucket per `(principal, route)`; replay-safe writes keyed by `Idempotency-Key`.
6. **Execute** — call a `packages/core` use-case. DB writes wrap domain mutation **+ `OutboxEvent` insert** in one transaction.
7. **Respond** — envelope `{ ok, data, error, meta }`; consistent error codes; `traceId` echoed.
8. **Emit** — outbox relay (in `worker`) publishes committed events to Redis pub/sub.

## 3. Auth (custom, mobile-first)

| Element | Design |
|---|---|
| **Access token** | JWT (`jose`, EdDSA). ~15 min TTL. Claims: `sub`, `activeRole`, `roles`, `platform`, `deviceId`, `sid`, `ver`. Never stored server-side. |
| **Refresh token** | Opaque 256-bit random. Stored **hashed** (argon2id) in `Session` with `deviceId`, `userAgent`, `ip`, `expiresAt` (~60d), `rotatedFrom`. **Rotation on every use**; reuse of a rotated token ⇒ revoke the whole session family (theft detection). |
| **OTP** | Phone = primary (SMS provider port). Email = secondary. 6 digits, hashed at rest, 5-attempt cap, short TTL, resend backoff. |
| **Social** | Google / Apple / Facebook — verify the platform ID token server-side, link/create `SocialIdentity`. |
| **2FA (TOTP)** | `otpauth`; recovery codes (hashed). Required for staff; optional for vendor/courier. |
| **Transaction PIN** | Separate argon2id hash; required for withdrawals, payout-account changes, high-value actions. Rate-limited, lockout on repeated failure. |
| **Role switch** | `POST /auth/switch-role` → new access token with a different `activeRole` (must be an active, KYC-cleared role). Refresh unchanged. |
| **Session mgmt** | List / revoke individual devices; "log out everywhere" bumps `ver` and drops all sessions. |
| **Password** | Optional (phone-OTP is primary). If set: argon2id, breach-check against a local k-anon list, never logged. Replaces `bcryptjs`. |

Guards compose: `requireAuth()`, `requireRole('COURIER')`, `requireCapability('auction')`,
`requireOwnership(resource)`, `requireKyc('COURIER','APPROVED')`, `requirePin()`.

## 4. Multi-platform capability system

```
Platform         id, slug ('grandprice' | 'tizzi-gas' | ...), name, defaultCurrency,
                 supportedRegions[], theme, status
FeatureFlag      key ('auction','advertising','wallet.withdraw','delivery.live_tracking',
                 'catalog.multi_vendor_cart', ...), description, type(bool|number|json)
PlatformFeature  platformId, flagKey, value            -- per-platform capability set
RoleFeature      role, flagKey, value                  -- per-role capability set
UserFeatureOverride userId, flagKey, value, expiresAt  -- targeted enable/disable, A/B, comps
RegionRule       regionCode, flagKey, value            -- legal/regulatory gating (e.g. auctions)
```

Resolver returns an immutable `Features` map. Example for **Tizzi Gas**:
`auction=false`, `advertising=false`, `catalog.scope='gas'`, `delivery.live_tracking=true`,
`wallet=true`. For **GrandPrice**: everything on, `catalog.scope='all'`.

Clients call `GET /api/v1/config/bootstrap` on launch → `{ platform, features, theme, nav,
minAppVersion }`. The mobile bottom-nav (MD §32) is **rendered from `nav`**, not hardcoded.

Catalog scoping: `Product`/`VendorProduct` carry `platformIds[]` (a listing can belong to one
or many platforms). Gas cylinder listings ∈ `['tizzi-gas','grandprice']`; a fashion vendor ∈
`['grandprice']`.

## 5. Realtime (`apps/realtime`)

**Namespaces**

| NS | Rooms | Purpose |
|---|---|---|
| `/tracking` | `delivery:{id}`, `courier:{id}`, `zone:{id}` | Live courier position, ETA, status transitions. Customers/vendors/ops subscribe by entitlement. |
| `/chat` | `conversation:{id}` | Messages, typing, receipts (MD §21). |
| `/notifications` | `user:{id}` | In-app notification stream, badge counts (MD §22). |
| `/delivery-ops` | `ops:dispatch`, `ops:region:{code}` | Staff dispatch board, incident feed. |

**Connect:** client sends access JWT → gateway verifies → joins only entitled rooms.
**Location ingest:** courier app emits `location` — adaptive cadence: **3–5 s on active
delivery**, **15–30 s idle-online**, paused offline. Gateway:
- writes position to **Redis GEO** (`couriers:online`, `couriers:zone:{code}`) for dispatch,
- broadcasts to `delivery:{id}` room immediately,
- enqueues a throttled **breadcrumb** to Postgres (`DeliveryLocation`) — every ~20–60 s or on
  >75 m movement — for history/replay/disputes.

**Event delivery:** domain services never call the socket layer directly. They write
`OutboxEvent` in the same tx as the state change. The `worker` outbox-relay reads new rows,
publishes to Redis pub/sub channels; `apps/realtime` subscribes and fans out to rooms. At-least-
once; consumers idempotent on `event.id`.

**Scaling:** multiple `realtime` instances behind a sticky LB, `@socket.io/redis-adapter` for
cross-instance broadcast. Presence in Redis with TTL heartbeats.

## 6. Geo & maps

**Postgres/PostGIS**
- `geography(Point,4326)` on `VendorProfile.location`, `CourierProfile.lastLocation`,
  `Address.location`, `Delivery.pickupPoint` / `dropoffPoint`.
- `geography(Polygon,4326)` on `CourierServiceArea.area`, `DeliveryZone.area`.
- GiST indexes; `ST_DWithin` for "nearby vendors/products" (MD §03 items 33–34),
  `ST_Contains` for "is this drop-off inside a serviceable zone".
- Prisma v7: model these via `Unsupported("geography(...)")` + raw SQL helpers in
  `packages/core/geo`, or the PostGIS-aware query layer. Migrations enable the extension.

**Redis GEO** — hot path only: `GEOSEARCH couriers:online BYRADIUS ...` to shortlist couriers
for a `DeliveryJob`, ranked by distance + rating + acceptance rate + current load.

**Google Maps Platform** (server holds the secret)
- `apps/api` proxies **Directions** and **Distance Matrix** (route polyline, distance, ETA),
  caching by rounded coordinate pairs + time bucket in Redis. Never expose the server key.
- Flutter uses a **referrer/bundle-restricted** render key for `google_maps_flutter`.
- `Geocoding` / `Places` for address entry and the location picker.

**Map screens we add** (not in Figma/MD) — full list in `03-DESIGN-SYSTEM.md` §Maps:
Nearby-Vendors map, Live Delivery Map (customer), Courier Navigate-to-Pickup, Courier
Navigate-to-Dropoff, Courier Jobs Map, Service-Area polygon editor, Address Location Picker,
plus location-permission primers (MD §28 items 511).

## 7. Background jobs (`apps/worker`)

Queues: `outbox-relay`, `notifications` (push/email/SMS fan-out), `payouts`, `settlements`,
`auction-draws` (scheduled, auditable RNG, backup-winner selection), `kyc-pipeline`
(doc OCR / liveness provider callbacks), `eta-refresh`, `breadcrumb-compaction`,
`search-index`, `analytics-rollup`, `dispute-timers`, `coupon-expiry`.

Idempotent handlers, exponential backoff, dead-letter queue, `worker` exposes `/health` +
queue metrics to OTel.

## 8. Security baseline (applies from Phase 1)

- argon2id for every secret at rest (password, PIN, OTP, refresh, recovery codes).
- Access tokens short-lived; refresh rotation with reuse-detection; `ver` epoch for mass revoke.
- Per-route + per-principal rate limiting; global IP throttle at the edge (Cloudflare/WAF).
- `Idempotency-Key` mandatory on all money-moving + create endpoints.
- Append-only `AuditLog` for auth events, role/permission changes, money movement, KYC
  decisions, admin actions, feature-flag edits.
- PII minimization: courier sees customer name + drop-off area + masked phone (proxy call)
  **only after accepting** a job; full address revealed at "start delivery".
- Input validation via Zod at the edge; output DTOs never leak internal fields.
- Secrets via env (`packages/config` zod loader) → Docker secrets locally, GCP Secret Manager
  in prod. Nothing sensitive in the repo; `.env.example` only.
- Dependency scanning + `pnpm audit` in CI; `security-review` skill before each release.
- Row-level ownership checks on every read/write; no `query.custom` raw passthrough (the
  current `UserService.executeCustomQuery` is removed).

## 9. Infra

**Local — `infra/docker/docker-compose.yml`**
`postgres` (postgis/postgis:16), `redis:7`, `minio` + `createbuckets`, `mailpit`,
`meilisearch` (optional profile), `api`, `realtime`, `worker`. One `.env` from
`infra/docker/.env.example`. `pnpm dev` runs the three Node apps with hot reload against the
containers; `docker compose --profile full up` runs everything containerized.

**Prod — `infra/terraform/` (Phase 8)**
- GCP: Cloud Run services `api` / `realtime` / `worker`; Cloud SQL Postgres 16 + PostGIS;
  Memorystore Redis; Artifact Registry; Secret Manager; Cloud Scheduler → worker; Cloud
  Storage (or R2) for media.
- Cloudflare: zone, DNS, WAF rules, cache rules, Turnstile, R2 buckets, Images, a Tunnel for
  staging.
- GitHub Actions: build → test → `docker build` → push to Artifact Registry → `gcloud run
  deploy` (staging auto, prod gated). Prisma migrations run as a pre-deploy Cloud Run job.

## 10. Testing strategy (every phase)

- **Unit** — `packages/core` use-cases, pure logic (pricing, qualification weights, ledger).
- **Integration** — `apps/api` handlers against a real Postgres+Redis (Testcontainers / the
  compose stack); auth, capability gating, idempotency, RBAC.
- **Contract** — generated OpenAPI validated; Dart client compiles against it in CI.
- **Realtime** — socket client tests for room entitlement + event fan-out.
- **Flutter** — widget tests for design-system components; integration tests for the auth,
  checkout, and delivery-tracking flows.
- **E2E** — Playwright for the admin console; a scripted "customer orders → courier delivers"
  happy path against the compose stack.
- **Load** — k6 against dispatch + tracking before Phase 8 exit.
