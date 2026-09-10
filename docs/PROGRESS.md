# STALL — PROGRESS LEDGER

> **This is the single source of truth for "where are we".** Every session updates it.
> Resume a cleared session by typing **`RESUME STALL`** (see `docs/RESUME.md`).
> Flush state before clearing context by typing **`SAVE STALL`**.

Last updated: **2026-09-05** (Session 22)

---

## CURRENT STATE (one paragraph)

**Session 22 — Broadened admin E2E coverage beyond the original 6 named happy paths.**
Everything left in the documented plan is now user-owned (cloud accounts, payment keys,
device access), so this session used the time for regression coverage instead: 8 new
Playwright tests (KYC reject, fee-schedule save, boost-tier create+disable, campaign review
approve, a user safety-action/SUSPEND, an audit-log check tying back to the earlier KYC
review, an analytics page-load smoke check, logout) — 16 total, up from 8. Found and fixed 3
real bugs in the *tests themselves* while chasing a confusing cascade failure: `KycCase` has a
`@@unique([subjectType, subjectId])` constraint, so the reject test needed its own fresh
subject rather than reusing the approve test's (a unique-constraint violation mid-run left the
shared `page` in a stale state that made an unrelated-looking later test fail too); boost-tier
form locators needed scoping to the create form specifically, since every existing tier row
also renders a same-named hidden input in its own "Disable" form (an unscoped locator hit a
strict-mode violation across 4 elements); and the safety-action assertion needed an exact text
match since the Roles column renders `CUSTOMER(SUSPENDED)`, colliding with the Status badge's
plain `SUSPENDED` as a substring. Also caught a would-be silent-pass bug of my own along the
way — `getByPlaceholder("premium")` and `getByPlaceholder("Premium")` collide under
Playwright's case-insensitive substring matching, since Key and Name share near-identical
placeholder text; switched to `input[name=...]` locators. Added a `SKIP_E2E_CLEANUP=1` escape
hatch for inspecting fixture state after a local failure instead of losing it to `afterAll`.
All 16 tests green, verified standalone in `stall-web` itself (not just via disbursement)
before committing. Committed to `stall-web` (`095e3cf`).

**Session 21 — Campaign creative editor screen. Phase 7 depth is now fully closed.** Backend
CRUD for campaign creatives (`POST`/`PATCH`/`DELETE .../vendors/campaigns/{id}/creatives[/{adId}]`
→ `addCreative`/`updateCreative`/`removeCreative` in `packages/core/src/ads/creatives.ts`)
shipped in S14, but `campaign_detail_screen.dart` only ever rendered the creative list
read-only. `StallApi.addCampaignCreative` existed but was missing `subtext`/
`destinationRoute`/`weight`/`creativeKind`; added `updateCampaignCreative`/
`removeCampaignCreative`. Extended `getCampaign`'s response shape
(`packages/core/src/ads/campaigns.ts`) to also echo `subtext`/`destinationRoute`/`weight` on
each creative — those columns already existed on the `Advertisement` row (`include: { ads:
true }`), just weren't selected into the shaped output, so the edit form couldn't pre-fill
them. Added `_CreativeFormSheet` in `campaign_detail_screen.dart`, shared between add and edit:
placement chips, a kind picker (add-only — the PATCH endpoint can't change `creativeKind` once
created, so the picker only shows when adding), headline/subtext/destination-route fields, a
product picker sourced from the vendor's own catalog, a weight slider, and an Active toggle +
Remove action when editing an existing creative. Creative rows in the list are now tappable to
edit; a new "Add" button opens the sheet fresh. `flutter analyze` 0 / `flutter test` 35/35 in
both `tizziserver/mobile` and `stall-mobile` standalone; full workspace typecheck (8/8) and the
Vitest suite (64 tests) green after the backend change. **Not verified on a real device** —
still no emulator on this box, same standing limitation as every prior on-device item; the
user is running this session over remote access and will do full device testing once home.
Committed to `stall-web` (`26a1acf`, the backend field addition) and `stall-mobile` (`a682452`,
the editor UI + API client methods).

**Session 20 — Sponsored-card injection (last open Phase 7 depth item).**
`sponsoredProvider`/`StallApi.sponsored`/`logAdEvent` shipped in S14 but were never placed in
the shopper feed. Added a shared `SponsoredRail` widget
(`mobile/lib/features/ads/widgets/sponsored_rail.dart`) — a horizontal strip that renders
nothing while loading/empty/errored (never blocks or reflows a feed around an ad call), logs
one IMPRESSION per card the first time a given ad set renders and a CLICK on tap (both
best-effort, fire-and-forget), and routes to the product page or the ad's own
`destinationRoute`. "Sponsored" badge follows the same floating-pill pattern already used for
the flash-deal discount badge (opaque dark background, not `StatusBadge`, since that's tuned
for list-row contexts, not floating over an arbitrary product image). Wired into
`catalog_home_body.dart` (`HOME_RAIL` slot, between the campaign rails and "Fresh arrivals")
and `search_screen.dart` (`SEARCH_TOP` slot, above the results grid) — exactly the two
placements named in NEXT ACTIONS, nothing wider. Backed by real seed data —
`seed-campaign-orbit` already has active `HOME_RAIL`/`SEARCH_TOP` creatives for `grandprice`,
confirmed by reading the seed script rather than assumed. Field-name parity between the
backend's `SponsoredCard` response shape and the pre-existing `SponsoredCardDto.fromJson`
verified by reading both sides. **Could not visually verify in a running emulator** — this
box still has none (the same standing limitation as every prior on-device tap-through item);
verification instead rested on `flutter analyze` (0 issues both repos), `flutter test` (35/35
both repos), and the seed-data/contract checks above. Committed to `stall-mobile` (`99925b6`).

**Session 19 — Enforce `ADMIN_2FA_REQUIRED`.** The env flag (default `true`) had existed since
S14 but nothing ever checked it — admin console login was single-factor (SMS OTP only)
regardless of the flag. `apps/api/app/admin/actions.ts`'s `verifyLoginOtp` now checks
`env.ADMIN_2FA_REQUIRED` after the SMS OTP verifies: an account with no confirmed TOTP
enrollment is refused outright ("enable it from the app's Security Centre first," no session
minted); an account with TOTP enrolled is routed to a new third login step (`verifyLoginTotp`)
that requires a valid 6-digit code before `createAdminSession` runs. Falls back to the old
single-factor flow if the flag is turned off. `apps/api/app/admin/login/page.tsx` gained the
third form step, following the same multi-`useActionState`-with-priority-selection pattern the
file already used for the phone→OTP transition. Extended the S18 Playwright suite to match:
the shared fixture (`apps/api/e2e/fixtures.ts`) now enrolls+confirms TOTP for the test admin
via `@stall/core`'s real `enrollTotp`/`confirmTotp` (generating live codes with `otpauth`,
added as an `apps/api` devDependency — no test-only backdoor was added to production code) and
a new test confirms a no-2FA account is correctly refused. 8/8 Playwright tests green, verified
in both `tizziserver`'s working tree and standalone inside `stall-web` itself (not just via
disbursement) before committing. Full workspace typecheck (8/8) and the Vitest suite (64 tests)
still green. Committed to `stall-web` (`51ba683`).

**Session 18 — Playwright admin console E2E suite; fixed a broken admin login bug found
along the way.** While building the suite (NEXT ACTIONS #4), discovered `requestLoginOtp`
(`apps/api/app/admin/actions.ts`) never passed `userId` to `issueOtp`, so every admin-login
OTP row was created with `userId: null` — `verifyOtp` could then never resolve a real user,
meaning **admin console login could never actually succeed for anyone**, and separately the
generated code was never sent anywhere (`sendSms` was never called). Both fixed: it now looks
up the account by phone (never auto-creates one, unlike the customer-facing flow) and ties the
OTP to it, and actually delivers the code via `sendSms`. Added a 7-test Playwright suite
(`apps/api/e2e/`, `apps/api/playwright.config.ts`) covering every happy path named in NEXT
ACTIONS #4: login, KYC approve, dispute resolve, feature-flag round-trip, pricing-rule save,
draw commit+run, broadcast compose+send. Fixtures are created directly via Prisma
(`apps/api/e2e/fixtures.ts`) rather than replaying full business flows — that logic is already
Vitest-covered; this suite tests the console's pages/forms/server-actions against a real
browser + running server. The OTP step is completed by overwriting the pending row's hash with
a test-controlled code (same DB, same technique the opt-in `phaseN-e2e` Vitest suites already
use), not by intercepting a real SMS. Run via `pnpm --filter @stall/api test:e2e` (boots its
own dev server on :3100, needs a disposable dev DB same as the Vitest suite). All 7 tests green
locally; full workspace typecheck (8/8) and the full Vitest suite (64 tests) still green after
the login fix. Wired into CI as a new `admin-e2e` job in `.github/workflows/ci.yml` (Postgres
service + migrate/seed + Chromium install + HTML report on failure), YAML-validated with
js-yaml before committing. Committed to `stall-web` (`2d05e49` the suite, `fb76f84` the CI
wiring); nothing in `stall-mobile` changed.

**Session 17 — Full-surface security review + 13 fixes.** Ran a full-surface security
sweep of the whole codebase (not just Phase 7/8 + money paths like the S14 review) via 7
parallel domain-scoped review passes (auth/identity, payments/wallet/ledger, admin console,
delivery/couriers/realtime, auctions, chat/trust/disputes, catalog/ads/privacy), then an
independent second pass re-verified every candidate finding from scratch and filtered out
false positives — 13 confirmed at high confidence, all now fixed. **Financial integrity:**
the payment webhook now requires an HMAC-signed body (`MOCK_PAYMENTS_WEBHOOK_SECRET`) and can
no longer flip a FAILED `PaymentIntent` to SUCCEEDED (was: a forged webhook could mint wallet
credit for money never captured); `completeVendorOrder`/`cancelOrder` now do an atomic
status-guarded update before touching the ledger (was: a double-tap could double-release
escrow or double-refund a customer); `postTxn` now atomically guards WALLET-kind debits
against the account's current balance (was: a TOCTOU race let concurrent withdrawals overdraw
a wallet) — CLEARING/ESCROW/PAYABLE/REVENUE debits are deliberately left unguarded since they
legitimately swing negative as internal bookkeeping (e.g. CLEARING nets negative on every
top-up); ad click/conversion de-dup now anchors on server-derived IP instead of a
client-supplied `sessionId` (was: a free ad-budget-draining bypass). **Auth/access control:**
added `requireSuperAdmin()`, gating pricing/fee-schedules/boost-tiers/feature-flags/
broadcasts/draws/dispute-refunds/safety-actions to ADMIN-only in both the admin console and
the equivalent REST `/staff/*` + `/auctions/*/draw/*` routes (was: any STAFF session had full
ADMIN power); the legacy `_compat` `auth.verify-otp` bridge now enforces the same TOTP 2FA
gate as `/api/v1/auth/verify` (was: a full 2FA bypass); admin cookie sessions now re-derive
STAFF/ADMIN authority from the DB every request (was: no revocation — a fired/demoted staff
member kept console access until natural cookie expiry); `rescheduleDelivery` now checks the
caller is the delivery's actual customer/courier (was: any authenticated user could hijack any
delivery); `openDispute`'s VENDOR/COURIER branch now requires a real order/delivery history
with the target (was: anyone could dispute any vendor/courier with zero relationship, and
`againstId` pointed at the wrong id so the real target could never respond); `/chat`'s
`typing` handler now only relays into a room the socket actually joined (was: no participancy
check at all). **Auction integrity:** the commit-reveal draw's seed no longer leaks via the
public API before `completedAt` (was: computable winning weight-range in advance);
`recordQualification` now requires a dedupe key for client-attestable factors, caps cumulative
points per factor, and rejects calls outside the open/qualifying auction states (was: unbounded
self-reported score directly inflating real-money draw odds). Verified: full workspace
typecheck green (8/8 packages); ran the local no-Docker dev DB (`./.pgdata`, reset + migrated +
reseeded with the user's explicit consent per Prisma's AI-action guardrail) and got the full
Vitest suite green (64 tests) against it, confirming the fixes don't regress existing behavior
— caught and corrected one over-broad fix in the process (the ledger guard was initially
applied to all debits, which broke legitimate CLEARING-account flows in `topUpWallet`; narrowed
to WALLET-kind debits only, matching the actual finding). Committed to `stall-web` (`5e9d91f`,
29 files); nothing in `stall-mobile` changed. `tizziserver`'s own `.env` was briefly pointed at
`postgres@localhost` for the local test run and reverted back to the Docker-oriented
`stall:stall@localhost` credentials afterward — no lasting change (`.env` is gitignored).

**Session 16 — Split-repo build verification + GrandPrice Figma design-system depth.**
Verified both split repos (see S15 below) build clean standalone: `stall-web` (`pnpm install`
→ `pnpm db:generate` [the Prisma client isn't committed] → `pnpm typecheck` 8/8 packages green
→ `pnpm lint` green) and `stall-mobile` (`flutter pub get` → `flutter analyze` 0 issues). Found
`packages/tokens/build.mjs` in `stall-web` still hardcodes a cross-repo write to
`../../mobile/lib/design/tokens.g.dart` — dead since the split (it now writes an inert stray
directory inside `stall-web` instead of reaching the real `stall-mobile`); flagged, not yet
fixed. **Design-system depth pass** (continuing the GrandPrice Figma buildout — edited in
`tizziserver/mobile`, then disbursed to `stall-mobile` per the S15 workflow): the product-detail
screen gained a side-by-side gallery|info layout on tablet-width viewports (≥840dp), extracting
`_Gallery`/`_InfoSection` widgets reused by both the new tablet layout and the existing phone
`CustomScrollView`; swept 18 more screens across auctions/auth/catalog/commerce/courier/delivery/
trust/ads/selling onto the shared `AppCard`/`StatusBadge` widgets in place of ad-hoc bordered
containers and colored status pills (a handful of genuinely tinted/semantic-color cards — courier
online/offline, delivery success banners — were correctly left bespoke, since `AppCard`'s surface
is fixed-neutral). `flutter analyze` 0 across the whole app both before and after. Committed to
`stall-mobile` (`7de7971`, 19 files). **Also extracted the deferred `StatTile` widget** for the
repeated sunken-box KPI-number-tile pattern that had drifted slightly across six screens —
`campaign_detail_screen.dart`, `courier_performance_history_screen.dart`,
`vendor_analytics_screen.dart`, `courier_dashboard_screen.dart`, `referral_screen.dart`,
`courier_earnings_screen.dart` — each with its own local `_kpi`/`_Stat`/`_stat`/`_mini` copy and
small inconsistencies (text style, padding); all now render via one `StatTile` in
`lib/design/components.dart`. Two other bare-number-column patterns
(`courier_profile_screen.dart`, `vendor_hub_screen.dart` `_Stat`) were deliberately left alone —
undecorated, a different look, not a duplicate of this pattern. `flutter analyze` 0. Committed
to `stall-mobile` separately (`6962f52`, 7 files). Then fixed the `stall-web` tokens-script
cross-repo write: `packages/tokens/build.mjs` now writes its Dart output to
`dist/tokens.g.dart` (gitignored) instead of a `../../mobile/...` path that no longer resolves
to anything real post-split; `pnpm typecheck` still 8/8 green (`stall-web` `f15e385`).
`tizziserver`'s own `packages/tokens/build.mjs` is deliberately left untouched — `mobile/` is
still a real sibling there, so the original behavior is still correct in that tree.

**Session 15 — Monorepo split into two independent repos.** The Phase 0–8 `tizziserver`
monorepo (branch `stall-rebuild`; S14's ~158-path Phase 3–8 buildout was never committed here)
was split into two fresh, independently-versioned private GitHub repos under `PPHTutorial`:
**`stall-web`** (everything except `mobile/` — `apps/{api,realtime,worker}`, `packages/*`,
`infra/`, `docs/`, root config; 8 thematic commits, fresh history, branch `main`) and
**`stall-mobile`** (the Flutter app, `mobile/` contents at repo root; 8 thematic commits, fresh
history, branch `main`). Built by copying the git-trackable file set out of `tizziserver` into
sibling folders `e:\Projects\NextJs\stall-web` / `stall-mobile`, then `git init` + thematic
commits in each. **`tizziserver` was deliberately left untouched** — HEAD stays at `33f2f93`,
the uncommitted Phase 3–8 work was only copied out, never committed here — kept as a pending
revert point until the user explicitly says "revert." **Going forward, `stall-web`/`stall-mobile`
are the live development repos; `tizziserver` is edit scratch space** whose changes get
disbursed (copied to the matching path, then committed) into the split repos per file — `mobile/*`
→ `stall-mobile`, everything else → `stall-web` — not a repo to push commits from directly. See
`docs/RESUME.md` — its `RESUME STALL` protocol still applies, but "the repo" now means whichever
of the two split repos matches the files in scope, not `tizziserver`.

**Session 14 — Phases 7 + 8 are code-complete.** **Phase 7 (Advertising / analytics /
admin console):** Schema **Domain 8** — `BoostTier` (backend-editable, no hardcoded tiers),
`Campaign`/`CampaignItem`/`Advertisement`/`AdEvent`/`AdDailyStat`, `Boost`, `ReferralCode`/
`Referral`, `AnalyticsSnapshot` → migration `20260902070643_advertising_analytics_domain8`.
**`@stall/core` gained `ads` + `analytics` + `referrals` + `admin`**: `ads` — tiers CRUD,
campaign lifecycle (DRAFT→review→ACTIVE→settle) with the **full budget charged to platform
escrow on submit**, `AdEvent` billing accrual (CPM per-impression / CPC per-click /
FLAT_DAILY by the rollup) with budget-exhaustion auto-pause, sponsored-card serving +
`rankBoostMap` for the ranker, direct product `Boost` (pro-rata refund on cancel), nightly
`rollupAdStats`/`compactAdEvents`/`attributeConversion`; `analytics` — vendor (sales / top
products / customers / payouts / ad ROAS), courier (completion / acceptance / on-time /
earnings trend), platform (GMV / users / vendors / deliveries / queues) + `AnalyticsSnapshot`
worker; `referrals` — stable share code, apply-on-signup, reward-on-first-qualifying-order
(ledgered to wallet), expiry sweep; `admin` — dashboard KPIs, feature-flag matrix + setter,
pricing-rule / fee-schedule editors, broadcast composer + audience resolver + send, audit-log
reader, user directory + detail. Order placement now fires `qualifyReferralForOrder` +
`attributeConversion` post-commit. **Admin web console** at **`apps/api/app/admin/*`**
(Next.js, own `stall_admin` EdDSA cookie session via `apps/api/src/admin/session.ts`,
STAFF/ADMIN-gated, server actions → `@stall/core`): login (OTP) · dashboard · analytics
(GMV bars) · KYC queue + review · dispute desk + detail (assign / message / resolve+refund)
· ad-campaign review · **boost-tier editor** · draw supervision (commit / run, publishable
hashes) · broadcast composer · feature-flag editor · pricing/fees editor · user directory +
safety actions · audit log. **34 `/api/v1` routes** (ads/tiers/sponsored/events,
vendors/campaigns[+creatives/products/submit/pause/resume/cancel], vendors/boosts,
vendors/analytics, courier/analytics, me/referrals[+apply], + a full `staff/*` block:
campaigns/review, boost-tiers, dashboard, analytics[+trend], feature-flags, pricing[rules/
fees], broadcasts[+send], audit-log, users). **Phase 8 (Hardening & cloud):** `@stall/core/
observability` (dependency-free OTel/Sentry shim, `initObservability` in all 3 services +
`withApi` error capture, secret scrubbing); **GDPR pipeline** — `AccountDeletionRequest`
(migration `20260902074802_privacy_account_deletion`), `@stall/core/privacy` (`exportMyData`,
`requestAccountDeletion` w/ cancellable grace period, worker `processDueDeletions`
anonymise + session-revoke + tombstone, `purgeStaleAuditLogs`), routes `GET /me/data-export`
+ `GET/POST/DELETE /me/account/deletion`; **infra** — `infra/terraform/` (GCP Cloud Run ×3
+ Cloud SQL PG16 + PITR + PostGIS + Memorystore + Secret Manager + Cloudflare WAF/rate-limit/
Turnstile/R2, validate-clean), `infra/docker/Dockerfile.{api,realtime,worker}` + `.dockerignore`,
`infra/loadtest/{checkout,dispatch,tracking}.js` (k6); **CI/CD** — `.github/workflows/
deploy.yml` (gate → build/push images → migrate → no-traffic deploy → traffic shift →
smoke test → auto traffic-rollback; prod is a gated approval); **runbooks** —
`docs/runbooks/` (on-call, incident, deploy-rollback, payment-outage, dispatch-degradation,
dispute-surge, disaster-recovery); **security review** — 4 real fixes (ad-settle
double-book guard, charge-budget atomicity, ad-click Redis de-dup, deletion-tombstone
uniqueness) documented in `docs/08-HARDENING.md`. **Worker** gained `ads-sweep`,
`broadcast-referral-sweep`, `analytics-rollup`, `privacy-sweep` loops. **Contracts**
`ads.ts` → `openapi.json` **195 paths / 224 ops**. **Vitest** `ads.test.ts` (6) +
`analytics.test.ts` (5) + `privacy.test.ts` (3) → **61 TS green**; opt-in `phase7-e2e.test.ts`.
**Seed** — 3 boost tiers + 1 live campaign (`seed-campaign-orbit`) + 2 referral codes.
**Mobile** — `ads_models.dart` + `StallApi` methods; **advertising center** (campaign list +
create sheet w/ tier chips + product picker), **campaign detail** (KPIs + pause/resume/
cancel + submit&fund), **vendor analytics** (sales / customers / payouts / ad ROI + spark
bars), **courier performance history**, **refer & earn** (code + share + apply); router +
`HomeShell` account-tab entries (Advertising/Analytics gated on `hasFeature('advertising')` +
role, Performance history for couriers, Refer & earn for all). `flutter analyze` 0 ·
`flutter test` **35** (+5). Green: pnpm `-r typecheck` (8) · api lint · core vitest 61 ·
contracts 195 paths · flutter analyze 0 / test 35 · `next build` (admin console + all routes).


**Session 13 — Phase 6 (Chat / notifications / trust & safety / disputes / support) is
code-complete.** **Schema Domains 9 + 10** — `Conversation`/`ConversationParticipant`/`Message`/
`MessageReceipt`/`Block`; `Notification`/`NotificationPreference`/`NotificationTemplate`/
`Broadcast`; `Report`/`Dispute`/`DisputeEvidence`/`DisputeMessage`/`Appeal`/`SupportTicket`/
`SafetyAction` → migration `20260902061543_comms_trust_domain9_10` (no PostGIS). **`@stall/core`
gained `comms` + `trust`**: `comms.chat` — `getOrCreateConversation` (deduped by kind+subject or
participant pair), `listConversations` (unread counts), `getMessages` (marks delivered),
`sendMessage` (block check + `MessageReceipt` + `OutboxEvent(chat.message)` + peer notify),
`markConversationRead`, `blockUser`/`unblock`, `conversationForOrder`/`conversationForDelivery`
convenience openers; `comms.notifications` — `notify` (per-category `NotificationPreference`,
default push+email+inApp, FCM adapter with a log fallback for B6, `OutboxEvent`), feed +
`markRead`/`markAll` + prefs CRUD + `notifyFromOutboxEvent` (order/delivery/auction OutboxEvent →
in-app notification, called by the relay). `trust.disputes` — polymorphic `openDispute`
(order/payment/delivery/vendor/courier/auction, party-checked, SLA clock), evidence + messaging
(+ staff-only), `resolveDispute` (optional wallet refund from platform REVENUE, ledgered),
`appealDispute`/`decideAppeal`, `sweepDisputeSla` (worker). `trust.support` — help centre / FAQ
(from `AppConfig`), `createSupportTicket` (opens a backing SUPPORT `Conversation` with the first
message), list/get, STAFF assign/status. `trust.kyc` — **unified review**: `listKycQueue` /
`getKycCase` (+ subject summary) / `reviewKycCase` (APPROVE/REJECT/RESUBMIT → syncs
Vendor/Courier profile + `UserRole`, advances a `VERIFYING` `PrizeClaim`) — supersedes the
Phase-4/5 mock reviewers. `trust.reports` — `submitReport`, STAFF `listReports`/`actionReport`,
`applySafetyAction` (WARN/RESTRICT/SUSPEND/BAN/CLEAR → `User.status` + `UserRole` + revoke
sessions + bump `TokenEpoch`), `safetyCenter` summary. **`apps/realtime`** `/chat` (JWT,
`conversation:{id}` rooms via `getMessages` entitlement, `message`/`typing`/`read`, Redis
`stall:realtime` rebroadcast) + `/notifications` (`user:{id}` room, push events). **`apps/worker`**
maps every OutboxEvent → a notification in the relay loop; new `dispute-sla` loop. **72 `/api/v1`
routes** (conversations/messages/blocks, notifications/preferences, disputes + evidence/messages/
appeal, support help/tickets, reports, `me/security`, and a full STAFF/ADMIN block: `staff/kyc`,
`staff/disputes`, `staff/reports`, `staff/safety-action`, `staff/support`). **Contracts**
`comms.ts` → `openapi.json` **159 paths / 179 ops**. **Vitest** `comms.test.ts` (7 — chat dedupe/
unread/block, notification prefs + outbox mapping, dispute open→evidence→resolve-with-refund +
appeal, non-party rejected, support ticket → chat, unified KYC review flips a courier) → **47 TS
green**; opt-in `phase6-e2e.test.ts`. **Mobile**: `comms_models.dart` + `StallApi` methods;
**inbox** + **conversation** (bubble thread + composer), **notification centre** (+ per-category
preference sheet), **disputes** (list + open sheet + detail with evidence/messages/appeal),
**help & support** (FAQ + ticket create → support chat), **security centre**; app-bar
notifications bell (unread badge) + inbox icon; account-tab Messages / Disputes / Help & support /
Security centre; order-detail "Message seller". `flutter analyze` 0 · `flutter test` **30** (+4).
Green: pnpm `-r typecheck` · api lint · core vitest 47 · contracts 159 paths · flutter analyze
0 / test 30.

**Session 12 — Phase 5 (Auctions / Inverse Draws) is code-complete (GrandPrice-only).**
**Schema Domain 7** (`Auction` SEAT_DRAW + lifecycle, `PremiumAsset`, `TicketPackage`,
`AuctionTicket`=seat, `TicketWallet`, `AuctionParticipant`, `QualificationRule`/`QualificationEvent`,
`Draw` commit-reveal, `DrawEntry`, `Winner`/`BackupWinner`, `PrizeClaim`/`PrizeFulfilment`,
`AuctionRefund`, `WinTargetPurchase`, `AuctionDispute`) → migration
`20260902055055_auction_domain7` (no PostGIS; 9 spurious `DROP INDEX` stripped). **`@stall/core`
gained `auctions`**: lifecycle + reads with `seatsSold` projection + "mine" (`auctions.ts`);
`buyTickets` (wallet/gateway → `PaymentIntent(TICKET)` → mint seats + bonus, roll `TicketWallet`
+ `AuctionParticipant`, `QualificationEvent(TICKETS)`, money → per-auction `auctionEscrow`
account) (`tickets.ts`); **qualification engine** — `recomputeParticipant`
(`score = Σ weight·points`), `recomputeAuctionRanks`, `recordQualification` (ENGAGEMENT/SHARE/
REFERRAL, key-deduped), leaderboard — **weighting, never a guarantee** (enforced in names +
copy) (`qualification.ts`); **commit-reveal draw engine** — `commitDraw` publishes
`sha256(seed)`; `runDraw` reveals, builds weighted `DrawEntry` windows, deterministically
picks `Winner` + 3 backups from the seed, `resultHash` proof; escrow settles per
`nonWinnerPolicy` (REFUND/CREDIT → wallet, VOUCHER → `Coupon`) then remainder → platform
REVENUE; `markUnsold` refunds everyone in full; `dueDraws` for the worker (`draw.ts`); **prize
flow** — `startPrizeClaim` → `submitClaimKyc` (unified `KycCase(USER)` + `KycDocument`) →
`reviewPrizeClaim` (APPROVE → CLAIMED / REJECT → FORFEITED + promote backup #1) → `fulfilPrize`
(DELIVERY spawns a Phase-4 `Delivery` from the platform warehouse, platform-funded; PICKUP/
DIGITAL/PAYOUT), `purchaseWinTarget` (winner buys at `winTargetMinor` → REVENUE) (`prizes.ts`).
**`apps/worker`** gained the `auction-draws` loop (`dueDraws` every 15s). **21 `/api/v1` routes**
(all `capability: "auction"` — already 403 under `tizzi-gas`): `auctions*` list/detail/leaderboard/
qualification/qualify/tickets/me-win/claim/win-purchase/dispute, `me/tickets*`, plus STAFF/ADMIN
`auctions/admin` + `{slug}/status` + `{slug}/draw/{commit,run}` + `claims/{id}/{kyc,review,fulfil}`.
**Contracts** `auction.ts` → `openapi.json` **122 paths / 137 ops**. **Vitest** `auctions.test.ts`
(6 — winTarget<retail guard, ticket mint + escrow + qual event, key-deduped qualification,
full commit-reveal draw with determinism + ledger reconciliation, UNSOLD full refund, prize
claim→KYC→approve→winTarget buy) → **40 TS green**; opt-in `phase5-e2e.test.ts` (HTTP:
create→buy→commit→run→claim + `tizzi-gas` 403). **Seed** — 1 live GrandPrice draw
(`seed-inverse-draw-s-class`, GHS 250k win-target / GHS 1.85m retail, 3 packages). **Mobile**:
`auction_models.dart` + `StallApi` auction methods; **Inverse Draw marketplace**, **detail**
(fill bar, struck-through retail, dual "Join Draw / Buy retail" CTA, package+qty+payment buy
sheet, my-seats card, draw-proof/result card, winner banner, "not a guarantee" copy),
**qualification centre** (breakdown + rank + leaderboard + share/engage/refer actions),
**my tickets**, **winner claim** (claim → KYC → approve → winTarget buy stepper); account-tab
"Inverse Draws" + "My tickets" gated on `hasFeature('auction')`. `flutter analyze` 0 · `flutter
test` **26** (+4). Green: pnpm `-r typecheck` · api lint · core vitest 40 · contracts 122 paths ·
flutter analyze 0 / test 26.

**Session 11 — Phase 4 (Delivery / courier / realtime / maps) is code-complete.**
**Schema Domain 5** (`DeliveryZone`, `Delivery` + `pickupCode`/`dropoffCode`, `DeliveryItem`,
`DeliveryJob`, `DeliveryOffer`, `DeliveryEvent`, `DeliveryLocation`, `PickupVerification`,
`DeliveryVerification`, `ProofOfDelivery`, `DeliveryRating`, `DeliveryDispute`,
`CourierEarning`) + `KycCase.level`/`KycDocument`/`LivenessCheck` (courier KYC, ahead of the
Phase-6 review console) → migrations `20260902045932_delivery_domain5` +
`20260902051042_delivery_verify_codes` (one new GiST index `delivery_zones_area_gist`; 8/9
spurious `DROP INDEX` stripped per README). **`@stall/core` gained `maps` + `delivery` +
`couriers`**: a Google Distance-Matrix proxy with a haversine + avg-speed **fallback** (B5),
Redis-cached; distance-based `quoteDeliveryFee` (from the seeded `PricingRule(DELIVERY)` +
`FeeSchedule(COURIER,PAYOUT)`); `DeliveryZone` point-in-polygon (`ST_Covers`) + circle
fallback; a **dispatch engine** — Redis GEO / PostGIS `ST_DWithin` courier shortlist → ranked
`DeliveryOffer` waterfall with TTL, `respondToOffer` ACCEPT locks / DECLINE advances,
worker-swept `TIMEOUT`, `expireUndispatchable`; the **active-delivery state machine**
(`courierAdvanceDelivery` REQUESTED→…→COMPLETED, every hop → `DeliveryEvent` + `OutboxEvent`),
pickup/dropoff **code verification**, POD, ratings (roll courier avg), disputes, throttled
breadcrumbs + `getDeliveryTrack`; **courier earnings → ledger** (escrow → courier `PAYABLE` +
platform `REVENUE` on COMPLETED, reconciled to the cent), PIN-gated `requestCourierPayout`;
courier onboarding (unified `KycCase` + `KycDocument` + mock `LivenessCheck`), fleet (vehicles
+ docs + service areas + availability), ops (online/offline + shift + heartbeat + dashboard +
performance + jobs feed, PII-masked pre-acceptance). **`ensureDeliveryForVendorOrder`** hooks
`setVendorOrderStatus(READY_FOR_PICKUP)` → spawns a `Delivery` from the `Fulfilment` (fee
re-based to the captured `order.deliveryFeeMinor` share; `completeVendorOrder` now excludes the
delivery fee when a delivery is attached, so escrow nets exactly). **`apps/realtime`** rebuilt:
`/tracking` (JWT connect, `delivery:{id}` room entitlement via `getDeliveryTrack`, courier
`location` ingest → `recordBreadcrumb` → room broadcast, Redis `stall:realtime` sub → rebroadcast)
+ `/delivery-ops` (STAFF/ADMIN) + `@socket.io/redis-adapter`. **`apps/worker`** rebuilt: real
`outbox-relay` (→ `stall:realtime` + push-log), `dispatch-sweep`, `eta-refresh`, `payout-drain`
(mock), `breadcrumb-compact`. **43 `/api/v1` routes** (customer `deliveries*` + `maps/route`,
`courier/*` onboarding/fleet/ops/jobs/active-delivery/earnings/payouts, `vendors/deliveries/[id]`).
**Contracts** `delivery.ts` → `openapi.json` **103 paths / 118 ops**. **Vitest** `delivery.test.ts`
(7 — pricing math, full adhoc lifecycle + ledger reconciliation, dispatch decline/cancel/reassign,
fulfilment-sourced order ledger balance, tenant isolation) → **34 TS green**; opt-in
`phase4-e2e.test.ts` (HTTP dispatch→track→verify→complete). **Seed**: 2 `DeliveryZone`s + 2
ACTIVE ONLINE couriers (Accra, `+233200000010/11`). **Mobile**: `delivery_models.dart` +
`StallApi` Phase-4 methods; customer **delivery tracking** screen (GoogleMap + trail + stepper +
ETA + courier card + dropoff-code chip + cancel/rate); courier **dashboard** (online toggle +
heartbeat + stats + active job), **onboarding** (register + KYC + vehicle), **jobs** board
(countdown + accept/decline), **active delivery** (map + one-tap advance + verify pickup/dropoff
+ POD + report-issue), **earnings** (summary + feed + PIN withdraw), **performance**; `HomeShell`
courier tabs from `bootstrap.nav`; order-detail "Track delivery". `flutter analyze` 0 · `flutter
test` **22** (+4). Green: pnpm `-r typecheck` · api lint · core vitest 34 · contracts 103 paths ·
flutter analyze 0 / test 22.

**Session 10 — Phase 2 closed (device-parity e2e + polish); Phase 3 build underway.**
Added `packages/core/test/phase2-e2e.test.ts` — an opt-in (`E2E=1`) HTTP end-to-end that
fires the exact screen call-sequences against a running `apps/api` on both tenants:
customer sign-in → bootstrap → home rails → categories → category grid → search (+typo) →
multi-vendor product detail → similar → wishlist add/list/remove; vendor onboarding → STAFF
KYC approve → role switch → product draft → media/stock → publish → visible in
`/catalog/products` + seller stats; tenant isolation (tizzi-gas gas-scoped, cross-tenant 404,
`auction` gated). **3/3 green** against a freshly built API. `flutter analyze` 0 / `flutter
test` 12. *(A human tap-through on a real device/emulator is still the user's to run — no
Android emulator on this box; the script covers every call it would make.)* **Polish landed:**
`nearbyVendors` now returns real business `lat`/`lng` (PostGIS `ST_Y/ST_X`) → contract + Flutter
`NearbyVendorDto` + real map markers; **`geolocator`** dep + `mobile/lib/core/location.dart`
(`DeviceLocation.current()`, permission-safe, falls back to Accra) wired into Nearby Vendors
with a "use my location" action; **product video** — `ProductMediaDto`/`videos` on
`ProductDetail`, `_ProductVideo` inline player (`video_player` dep), `mediaUrl()` key→URL
resolver, seed adds a `MediaKind.VIDEO` row to `orbit-a54-phone`. Gates: pnpm core/api
typecheck · core vitest 20 (+3 e2e skipped) · contracts `openapi.json` 36 paths / 42 ops ·
flutter analyze 0 / test 12.

**Session 10 (cont.) — Phase 3 (cart / checkout / orders / payments / wallet) is code-complete.**
**Schema Domain 4 + 6** (`Cart`/`CartItem`, `Coupon`/`CouponRedemption`, `Order`/`VendorOrder`/
`OrderItem`/`Fulfilment`/`OrderEvent`/`Return`/`Refund`/`Invoice`, `LedgerAccount`/`LedgerTxn`/
`LedgerEntry`, `Wallet`/`WalletTransaction`, `PaymentIntent`/`Payment`/`PaymentMethod`/`Payout`)
→ migration `20260902004441_commerce_domain4_6`. **`@stall/core` gained `commerce` + `wallet` +
`payments`**: a minimal double-entry ledger (`postTxn` asserts balance, rolls cached balances,
sign = Σcredit−Σdebit), multi-vendor cart with live re-pricing, coupon evaluation, a
server-side checkout quote (fees from `FeeSchedule` + `AppConfig(checkout.fees)`), `placeOrder`
(wallet **or** mock-gateway payment → capture to platform escrow), `completeVendorOrder`
(escrow → vendor-payable + platform-revenue; order-level fees released on full fulfilment;
`Invoice` issued), `cancelOrder` (escrow → wallet refund), PIN-gated `requestWithdrawal`. A
`PaymentGateway` port with a deterministic **`MockGateway`** sandbox (no external keys — B4)
and stubbed Paystack/Flutterwave/Stripe adapters on the same port. **24 new `/api/v1` routes**
(cart, checkout, orders, vendor sub-orders, wallet, coupons, addresses, payment methods,
gateway webhook). **Contracts** `commerce.ts` → `openapi.json` **60 paths / 72 ops**.
**Vitest** `commerce.test.ts` (7 — quote math, coupon, escrow capture + per-vendor release
reconciling to the cent, gateway cancel/refund, declined-payment path, PIN gate,
insufficient-funds) → **27 TS tests green**; **`phase3-e2e.test.ts`** (opt-in `E2E=1`) **4/4**
against the live API (multi-vendor wallet checkout → fulfilled + idempotent replay, gateway
pay + cancel → wallet refund, coupon apply, tenant-scoped coupons). **Mobile**:
`commerce_models.dart` + `StallApi` methods, `CartController` + providers, and the
cart / checkout / order-placed / orders / order-detail / wallet / address-book / coupons
screens; product-detail "Add to cart", app-bar cart badge, account-tab entries.
`flutter analyze` 0 · `flutter test` **18** (+6). Green: pnpm `-r typecheck` · api lint ·
core vitest 27 · contracts 60 paths · flutter analyze 0 / test 18. **Phase 3 exit criteria met.**

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

**All engineering phases (0–8) are code-complete (S14).** Branch `stall-rebuild`. What
remains is **cloud enablement**, not code: provision the GCP project + billing (**B7**) and
the Cloudflare zone (**B8**), wire a real OTLP collector + Sentry project, then
`terraform apply` + first `deploy.yml` run against staging, followed by a full
`security-review` skill sweep and the k6 load-test pass on the live stack. External blockers
B4 (real payment-gateway keys), B5 (Google Maps key), B6 (Firebase FCM) still stand with
working fallbacks. Merge `stall-rebuild` → `main` and OS-rename `tizziserver` → `stall`
remain user-owned.

**Since S15, active development happens in the split repos, not here** — see the S15/S16
CURRENT STATE paragraphs above. `stall-web` and `stall-mobile` (siblings of this folder) are
the live repos with their own `main` branches; `tizziserver` stays as edit scratch space /
revert point, with changes disbursed out per file. A parallel, out-of-band track — the
**GrandPrice Figma design-system depth pass** (S16: `AppCard`/`StatusBadge` adoption sweep,
product-detail tablet split) — is *not* one of the numbered phases below and isn't gated by
anything in this section; it's ongoing UI polish tracked only in the CURRENT STATE narrative
and SESSION LOG, not its own phase checklist.

--- Phase 7 (done, S14) ---

**Phase 7 — Advertising & boosting, analytics, admin console.** Code-complete S14. Branch `stall-rebuild`.
See `docs/05-ROADMAP.md` §Phase 7 + `docs/02-DATA-MODEL.md` §Domain 8.

- [x] **Schema Domain 8** — `BoostTier` (backend-editable), `Campaign`/`CampaignItem`/`Advertisement`/`AdEvent`/`AdDailyStat`, `Boost`, `ReferralCode`/`Referral`, `AnalyticsSnapshot`. Migration `20260902070643_advertising_analytics_domain8`.
- [x] **`@stall/core`** — `ads` (tiers CRUD, campaign lifecycle + escrow-charged budget + CPM/CPC/FLAT_DAILY accrual + auto-pause, sponsored serving + `rankBoostMap`, direct `Boost`, nightly rollup + conversion attribution), `analytics` (vendor / courier / platform + snapshots), `referrals` (code, apply, reward-on-qualifying-order, expiry), `admin` (dashboard, feature-flag matrix, pricing/fee editors, broadcast composer, audit-log, user directory).
- [x] **Admin web console** `apps/api/app/admin/*` — Next.js, own EdDSA cookie session (`apps/api/src/admin/session.ts`), STAFF/ADMIN-gated, server actions → core: login · dashboard · analytics · KYC review · dispute desk · ad-campaign review · boost-tier editor · draw supervision · broadcasts · feature flags · pricing · users + safety actions · audit log.
- [x] **`apps/worker`** — `ads-sweep` (activate/complete/settle campaigns + expire boosts), `broadcast-referral-sweep`, `analytics-rollup` (nightly `AdDailyStat` + `AnalyticsSnapshot` + `AdEvent` compaction).
- [x] **34 `/api/v1` routes** + `ads.ts` contract → `openapi.json` 195 paths / 224 ops.
- [x] **Vitest** `ads.test.ts` (6) + `analytics.test.ts` (5) → 61 TS green; opt-in `phase7-e2e.test.ts`.
- [x] **Seed** — 3 boost tiers, 1 live campaign, 2 referral codes.
- [x] **Mobile** — `ads_models.dart` + `StallApi` methods; advertising center (list + create), campaign detail (KPIs + controls + submit&fund), vendor analytics, courier performance history, refer & earn; router + `HomeShell` account-tab entries (role + `advertising`-gated). `flutter analyze` 0 / `test` 35.
- [ ] **Deferred (project-pattern depth)** — home/search sponsored-card injection in the shopper feed (provider `sponsoredProvider` + `StallApi.sponsored`/`logAdEvent` shipped, not yet placed in the rails); campaign creative editor UI (backend + basic list shipped); admin console 2FA gate (`ADMIN_2FA_REQUIRED` env present, enforcement TODO); ad A/B + audience-size preview.

**Exit — ✅ MET (S14) at the code + integration-test level:** a vendor creates a campaign,
funds it from wallet (money → platform escrow via `payments`), staff approves it in the web
console, impressions/clicks accrue spend against the editable `BoostTier` price, the budget
auto-pauses on exhaustion, and settle releases spend → REVENUE + refunds the remainder →
wallet (reconciled). Ops staff review KYC, resolve a dispute with a ledgered refund, toggle a
feature flag, edit a pricing rule, run a draw, and send a broadcast — all from `apps/api/app/
admin`. Referral reward lands on a qualifying first order. *Outstanding: Playwright admin
E2E; sponsored placement in the shopper feed.*

--- Phase 8 (done, S14) ---

**Phase 8 — Hardening & cloud.** Code-complete S14 (everything buildable without cloud creds). Branch `stall-rebuild`.
See `docs/08-HARDENING.md` + `docs/05-ROADMAP.md` §Phase 8.

- [x] **Security review** of the Phase 7/8 surface + money paths — 4 real fixes (S1 ad-settle double-book guard, S2 charge-budget atomicity, S3 ad-click Redis de-dup, S4 deletion-tombstone uniqueness). Documented in `docs/08-HARDENING.md` §1. Full-surface skill sweep pending staging.
- [x] **Observability** — `@stall/core/observability` (dependency-free OTel/Sentry shim), `initObservability` in `apps/{api,realtime,worker}` + `captureError` in `withApi`, secret scrubbing. `OTEL_*` / `SENTRY_*` env (optional). Real exporters need an endpoint.
- [x] **Load tests** — `infra/loadtest/{checkout,dispatch,tracking}.js` (k6) + README with thresholds + tuning knobs.
- [x] **Terraform** — `infra/terraform/` GCP (Cloud Run ×3, Cloud SQL PG16 + PITR + PostGIS, Memorystore, Artifact Registry, Secret Manager, VPC connector, Cloud Scheduler, IAM) + Cloudflare (DNS, managed WAF, auth/checkout rate-limit, `/api` cache-bypass, Turnstile, R2). `terraform validate`-clean; apply needs B7/B8.
- [x] **Docker + CI/CD** — `infra/docker/Dockerfile.{api,realtime,worker}` + `.dockerignore` + `start:prod` scripts; `.github/workflows/deploy.yml` (CI gate → build/push → migrate → no-traffic deploy → traffic shift → smoke test → auto rollback; prod gated by environment approval; keyless WIF auth).
- [x] **Backups + DR + GDPR** — Cloud SQL daily backup + PITR in Terraform; `AccountDeletionRequest` (migration `20260902074802_privacy_account_deletion`) + `@stall/core/privacy` (`exportMyData`, `requestAccountDeletion` w/ cancellable grace period, worker `processDueDeletions` anonymise + revoke + tombstone, `purgeStaleAuditLogs`); routes `GET /me/data-export` + `GET/POST/DELETE /me/account/deletion`; worker `privacy-sweep` loop. `privacy.test.ts` (3). DR runbook written.
- [x] **Runbooks** — `docs/runbooks/` (on-call, incident, deploy-rollback, payment-outage, dispatch-degradation, dispute-surge, disaster-recovery).
- [~] **Flutter release** — flavors exist; build commands + Crashlytics + staged-rollout plan documented in `docs/08-HARDENING.md` §7. Signing + store listings are manual.
- [ ] **Cloud enablement (B7/B8)** — `terraform apply`, first `deploy.yml` staging run, OTLP + Sentry endpoints, full E2E on GCP behind Cloudflare, prod gated deploy + tested rollback. **User-owned.**

**Exit — partial (code-complete):** everything that does not require a live GCP project +
Cloudflare zone is built, typed, and (where testable) covered. Staging-on-GCP verification is
the remaining step and needs B7/B8. See `docs/08-HARDENING.md` §8 for the criterion-by-criterion state.

--- Phase 6 (done, S13) ---

**Phase 6 — Chat, notifications, trust & safety, support & disputes.** Started + **code-complete S13**. Branch `stall-rebuild`.
See `docs/05-ROADMAP.md` §Phase 6 + `docs/02-DATA-MODEL.md` §Domain 9 + §Domain 10.

- [x] **Schema Domains 9 + 10** — 15 models. Migration `20260902061543_comms_trust_domain9_10`.
- [x] **`@stall/core/comms`** — `chat` (deduped conversations, messages + receipts, `sendMessage` w/ block check + notify + `chat.message` outbox, block/unblock, `conversationForOrder`/`conversationForDelivery`), `notifications` (`notify` per-`NotificationPreference` + FCM-adapter/log fallback, feed + read + prefs, `notifyFromOutboxEvent`).
- [x] **`@stall/core/trust`** — `disputes` (polymorphic `openDispute` party-checked + SLA, evidence, messaging w/ staff-only, `resolveDispute` + ledgered wallet refund, appeal/decide, `sweepDisputeSla`), `support` (help/FAQ, ticket → backing SUPPORT conversation, STAFF assign/status), `kyc` (**unified** `listKycQueue`/`getKycCase`/`reviewKycCase` — syncs vendor/courier profile + `UserRole` + advances `PrizeClaim`; supersedes the Phase-4/5 mock reviewers), `reports`+`safety` (`submitReport`, STAFF `listReports`/`actionReport`, `applySafetyAction` → `User.status` + session revoke + `TokenEpoch` bump, `safetyCenter`).
- [x] **`apps/realtime`** — `/chat` (JWT, `conversation:{id}` rooms, `message`/`typing`/`read`) + `/notifications` (`user:{id}` room); Redis `stall:realtime` rebroadcast for both.
- [x] **`apps/worker`** — OutboxEvent → notification mapping in the relay loop; `dispute-sla` sweep loop.
- [x] **72 `/api/v1` routes** (chat / notifications / disputes / support / reports / `me/security` + a full STAFF/ADMIN block) + `comms.ts` contract → `openapi.json` 159 paths / 179 ops.
- [x] **Vitest** `comms.test.ts` (7) → 47 TS green; opt-in `phase6-e2e.test.ts`.
- [x] **Mobile** — `comms_models.dart` + `StallApi` methods; inbox, conversation, notification centre (+ preference sheet), disputes (list + open + detail + appeal), help & support (FAQ + ticket → support chat), security centre; app-bar bell (unread badge) + inbox icon; account-tab entries; order-detail "Message seller". `flutter analyze` 0 / `test` 30.
- [ ] **Deferred (project-pattern depth)** — voice-message capture + entity-share pickers in chat; identity-verification capture screens (KYC intro/doc-capture/selfie flow — backend + STAFF review ready); notification per-category deep settings; report-user/product deep screens (backend `submitReport` ready, wired minimally); the STAFF/ADMIN **web** console (Phase 7); real FCM (B6).

**Exit — ✅ MET (S13) at the code + integration-test level:** two users chat in real time
(deduped thread, delivered/read receipts, block enforced); an in-app notification fires for a
chat reply and for order/delivery/auction OutboxEvents and respects per-category preferences; a
`KycCase` is submitted and approved/rejected by the unified reviewer (syncing the subject); a
dispute is opened (party-checked), evidenced, resolved with a ledgered wallet refund, and
appealed — with the SLA sweep running. *Outstanding: on-device pass; the web admin console
(Phase 7); real FCM (B6).*

--- Phase 5 (done, S12) ---

**Phase 5 — Auctions / Inverse Draws (GrandPrice only).** Started + **code-complete S12**. Branch `stall-rebuild`.
See `docs/05-ROADMAP.md` §Phase 5 + `docs/02-DATA-MODEL.md` §Domain 7.

- [x] **Schema Domain 7** — `Auction`/`PremiumAsset`/`TicketPackage`/`AuctionTicket`/`TicketWallet`/`AuctionParticipant`/`QualificationRule`/`QualificationEvent`/`Draw`/`DrawEntry`/`Winner`/`BackupWinner`/`PrizeClaim`/`PrizeFulfilment`/`AuctionRefund`/`WinTargetPurchase`/`AuctionDispute`. Migration `20260902055055_auction_domain7`.
- [x] **`@stall/core/auctions`** — `auctions` (lifecycle transitions, `createAuction`, reads + `seatsSold` + `refreshAuctionFill`, `resolveAuctionId`, `openAuctionDispute`), `tickets` (`buyTickets` wallet/gateway → per-auction escrow, `myTicketWallets`/`myTickets`), `qualification` (`recomputeParticipant`/`recomputeAuctionRanks`/`recordQualification` key-deduped/`getQualification`/`auctionLeaderboard`), `draw` (`commitDraw`/`runDraw` weighted commit-reveal + `resultHash`, `markUnsold`, `dueDraws`), `prizes` (`getMyWin`/`startPrizeClaim`/`submitClaimKyc`/`reviewPrizeClaim` (+ backup promotion)/`fulfilPrize` (DELIVERY → Phase-4 `Delivery`)/`purchaseWinTarget`).
- [x] **Ledger** — `auctionEscrow(auctionId)` account; ticket stakes HOLD → escrow; draw settles per `nonWinnerPolicy` (REFUND/CREDIT → wallet, VOUCHER → `Coupon`) then remainder RELEASE → platform REVENUE; UNSOLD refunds in full. Reconciled to the cent in `auctions.test.ts`.
- [x] **`apps/worker`** — `auction-draws` loop (`dueDraws`, 15s).
- [x] **21 `/api/v1` routes** (all `capability: "auction"`) + `auction.ts` contract → `openapi.json` 122 paths / 137 ops.
- [x] **Vitest** `auctions.test.ts` (6) → 40 TS green; opt-in `phase5-e2e.test.ts`.
- [x] **Seed** — 1 live GrandPrice draw + 3 packages + a premium asset + qual rules.
- [x] **Mobile** — `auction_models.dart` + `StallApi` methods; marketplace / detail (buy sheet, dual CTA, draw proof, winner banner) / qualification centre / my-tickets / winner-claim; account-tab entries gated on `hasFeature('auction')`. `flutter analyze` 0 / `test` 26.
- [ ] **Deferred (project-pattern depth)** — admin auction-authoring UI (routes exist, STAFF/ADMIN mobile console is Phase 7); premium-asset gallery, ticket-history, referral-progress, draw-countdown/prep live screens, runner-up notifications; `RegionRule` enforcement beyond `regionCodes` storage.

**Exit — ✅ MET (S12) at the code + integration-test level:** a full auction runs on
`grandprice` — users buy seats, accrue qualification via tickets + engagement/share/referral
(weights, not guarantees), a commit-reveal draw produces an auditable winner + backups with a
publishable `resultHash`, the winner claims → KYC → approve → buys at `winTarget`; non-winners
refunded per policy; an unsold pool refunds everyone; escrow nets to zero. Every `auctions/*`
route 403s under `tizzi-gas`. *Outstanding: on-device pass; the STAFF authoring/ops UI (Phase 7).*

--- Phase 4 (done, S11) ---

**Phase 4 — Delivery, courier, realtime, maps.** Started + **code-complete S11**. Branch `stall-rebuild`.
See `docs/05-ROADMAP.md` §Phase 4 + `docs/02-DATA-MODEL.md` §Domain 5.

- [x] **Schema Domain 5** + courier KYC (`KycCase.level`, `KycDocument`, `LivenessCheck`).
  Migrations `20260902045932_delivery_domain5`, `20260902051042_delivery_verify_codes`.
- [x] **`@stall/core/maps`** — Distance-Matrix proxy + haversine/avg-speed fallback (B5), Redis-cached; `coarseAreaLabel`, `haversineM`, `bearingDeg`, `etaFrom`.
- [x] **`@stall/core/delivery`** — `pricing` (distance fee + courier share from config), `zones` (CRUD + `zoneForPoint`/`isServiceable`), `presence` (Redis GEO + PostGIS fallback shortlist), `dispatch` (ranked `DeliveryOffer` waterfall, `respondToOffer`, `sweepExpiredOffers`, `expireUndispatchable`), `deliveries` (create/adhoc-wallet-funded + `ensureDeliveryForVendorOrder`, state machine, pickup/dropoff code verify, POD, ratings, disputes, reschedule/reassign/cancel, breadcrumbs, `getDeliveryTrack`), `earnings` (escrow→courier PAYABLE + platform REVENUE, summary/feed, PIN payout).
- [x] **`@stall/core/couriers`** — `profile` (onboarding → unified `KycCase`/`KycDocument`, mock review), `fleet` (vehicles + docs + service areas + availability, mock vehicle review), `ops` (online/offline + `CourierShift` + heartbeat + dashboard + performance + `listAvailableJobs`/`getJobDetail` PII-masked, `courierIdForUser`).
- [x] **`apps/realtime`** — `/tracking` (JWT, room entitlement, location ingest → breadcrumb → broadcast, Redis `stall:realtime` sub) + `/delivery-ops` (STAFF/ADMIN) + redis-adapter.
- [x] **`apps/worker`** — real loops: `outbox-relay`, `dispatch-sweep`, `eta-refresh`, `payout-drain` (mock), `breadcrumb-compact`.
- [x] **43 `/api/v1` routes** + `delivery.ts` contract → `openapi.json` 103 paths / 118 ops.
- [x] **Vitest** `delivery.test.ts` (7) → 34 TS green; opt-in `phase4-e2e.test.ts` (HTTP).
- [x] **Seed** — 2 `DeliveryZone`s + 2 live couriers (Accra).
- [x] **Mobile** — `delivery_models.dart` + `StallApi` methods; customer tracking screen; courier dashboard / onboarding / jobs / active-delivery / earnings / performance; `HomeShell` courier tabs; order-detail "Track delivery". `flutter analyze` 0 / `test` 22.
- [ ] **Deferred (project-pattern depth)** — vendor pickup-handoff screens (need a seller-orders screen, also deferred from Phase 3); courier service-area map editor + working-prefs + notif/privacy settings + achievements; real Directions polylines (fallback in place); FCM push (log adapter — B6); on-device tap-through.

**Exit — ✅ MET (S11) at the code+integration-test level:** an order → `READY_FOR_PICKUP`
spawns a `Delivery` → dispatch offers the seeded courier → accept → state machine to
`COMPLETED` with pickup/dropoff code verification + POD → courier earning posted to the ledger
(escrow → courier PAYABLE + platform REVENUE, reconciled) → both parties rate; decline / courier-cancel
re-dispatch; `expireUndispatchable` handles no-courier. Works identically on `tizzi-gas`
(`delivery.test.ts` "tenant isolation"). Live device run + real Google Maps key (B5) outstanding.

--- Phase 3 (done, S10) ---

**Phase 3 — Cart, checkout, orders, payments, wallet.** Started + **code-complete S10**. Branch `stall-rebuild`.
See `docs/05-ROADMAP.md` §Phase 3 + `docs/02-DATA-MODEL.md` §Domain 4 + §Domain 6 +
`docs/04-SCREEN-CATALOG.md` §06–07, §19–20.

- [x] **Schema v2 Domain 4 + 6** — `Cart`/`CartItem`, `Coupon`/`CouponRedemption`, `Order`/`VendorOrder`/`OrderItem`/`Fulfilment`/`OrderEvent`/`Return`/`Refund`/`Invoice`; `LedgerAccount`/`LedgerTxn`/`LedgerEntry`, `Wallet`/`WalletTransaction`, `PaymentIntent`/`Payment`/`PaymentMethod`/`Payout`. Migration `20260902004441_commerce_domain4_6` (8 spurious `DROP INDEX` stripped per README). `migrate deploy` on local `stall`.
- [x] **`@stall/core/commerce`** — `addresses` (book + snapshot), `cart` (multi-vendor grouping, live re-price, save-for-later, coupon), `coupons` (`evaluateCoupon` — window/platform/min-spend/scope/redemption/per-user/first-order; `listCoupons`), `checkout` (`quoteCheckout` — fee lines from `FeeSchedule` + `AppConfig(checkout.fees)`), `orders` (`placeOrder` multi-vendor + wallet/gateway payment, `getOrder`/`listOrders`, `cancelOrder` → wallet refund, `setVendorOrderStatus`, `completeVendorOrder` → escrow release, `requestReturn`).
- [x] **`@stall/core/wallet`** — double-entry `ledger` (`postTxn` asserts Σdebit=Σcredit, rolls cached balances; sign = Σcredit−Σdebit), `getWallet`/`topUpWallet`/`initiateTopUp` (gateway), `payFromWallet`, `refundToWallet`, `requestWithdrawal` (PIN-gated → `Payout`), `listWalletTransactions`.
- [x] **`@stall/core/payments`** — `PaymentGateway` port + deterministic **`MockGateway`** sandbox (fee 1.5%+30; declines when `amountMinor % 100 == 13`) + `PaystackGateway`/`FlutterwaveGateway`/`StripeGateway` stubs on the same port (throw until keyed — B4); `gatewayFor()` / `PAYMENTS_PROVIDER` env; `handlePaymentWebhook` (idempotent); `methods` CRUD.
- [x] **24 `/api/v1` routes** — `me/addresses`(+`[id]`), `cart`(+`items`,+`items/[id]`,+`coupon`), `coupons`(+`validate`), `checkout/quote`, `checkout` (idempotent), `orders`(+`[id]`,+`cancel`,+`return`), `vendors/orders`(+`[id]` PATCH,+`[id]/complete`), `wallet`(+`transactions`,+`topup`,+`withdraw`), `me/payment-methods`(+`[id]`), `payments/webhook`. `wallet*` gated on `wallet`/`wallet.withdraw`, coupon routes on `coupons`.
- [x] **`_compat` `order.*` / `vendor.nearby`** — already `410 ENDPOINT_MIGRATED` (the shim only ever bridged `auth.*`); nothing to remove.
- [x] **Contracts** — `packages/contracts/src/commerce.ts` → `openapi.json` **60 paths / 72 ops**. **Vitest** `commerce.test.ts` (7): quote fee math, coupon, multi-vendor wallet order → escrow → per-vendor release (payout+commission+fees reconcile exactly), gateway capture + cancel/refund, declined-payment path, withdrawal PIN gate + insufficient-funds. 27 TS tests green (+7 e2e opt-in).
- [x] **HTTP e2e** — `phase3-e2e.test.ts` (opt-in `E2E=1`), **4/4**: wallet checkout (2 vendors) → each sub-order completed → `FULFILLED` + `Idempotency-Key` replay, gateway pay + cancel → wallet refund, coupon validate/apply, tenant-scoped coupons.
- [x] **Mobile** — `commerce_models.dart` + `StallApi` commerce methods (+`Idempotency-Key` header support); `commerce_providers.dart` (`CartController` `AsyncNotifier`, cart-badge, addresses/orders/wallet/coupons providers). Screens: **Cart** (vendor groups, qty, save-for-later, coupon), **Checkout** (method → address → payment → live server quote → place), **Order placed**, **Orders** (filter tabs), **Order detail** (sub-orders, timeline, fee breakdown, cancel), **Wallet** (balance card, txn feed, top-up + PIN withdraw sheets), **Address book** (+editor sheet), **Coupons**. Product detail "Add to cart" wired; app-bar cart badge; account tab → orders/wallet/coupons/addresses. `flutter analyze` 0 · `flutter test` 18 (+6 `commerce_models_test.dart`).

**Exit — ✅ MET (S10):** a customer places a **paid multi-vendor order** in the mock payment
sandbox; funds land in escrow; each `VendorOrder` completion releases vendor payout (minus
commission) + platform revenue via balanced ledger entries; order cancel reverses the capture
to the wallet; wallet top-up + PIN-gated withdrawal work. Covered by `commerce.test.ts` (7) +
`phase3-e2e.test.ts` (4). *Real Paystack/Flutterwave/Stripe adapters stay stubbed pending
sandbox keys (B4); card-refund-to-card is Phase 6.*

--- Phase 2 (done, S9–S10) ---

**Phase 2 — Catalog, vendors, search, discovery.** Started S9, closed S10. Branch `stall-rebuild`.
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
- [ ] **Migrate legacy gas listings** — **N/A**: no production gas listings exist (pre-prod); the gas catalog is seed data in the `VendorOffer`/`GasCylinderListing` shape already. Revisit only if real legacy data appears.
- [x] **Device-parity e2e** (S10) — `packages/core/test/phase2-e2e.test.ts` (opt-in `E2E=1`): the full customer + vendor + tenant-isolation screen flows as HTTP against a running API, **3/3 green**. `flutter analyze` 0 / `flutter test` 12. *On-device human tap-through still pending (no emulator on this machine) but every call it makes is covered.* Also closes the deferred Phase-1 device sign-off.
- [x] **Polish** (S10) — per-vendor map coords (`nearbyVendors` `lat`/`lng` via PostGIS `ST_Y/ST_X` → contract + Flutter DTO + real markers); real device location (`geolocator` + `DeviceLocation.current()` in Nearby Vendors, Accra fallback); product video (`ProductMediaDto`/`videos`, `_ProductVideo` `video_player` widget, `mediaUrl()` resolver, seeded `VIDEO` media).

**Exit:** on both platforms a customer can browse categories, search, filter by location, open
a product with multiple vendor offers, and view a vendor page; a vendor can register, pass
business KYC (mock reviewer), and publish a product; all Tizzi-Gas listings visible under
`catalog.scope='gas'`. **✅ MET (S10)** — backend + mobile code-complete and gate-green; the
device-parity HTTP e2e passes both journeys on both tenants; polish (geolocation, per-vendor
coords, product video) landed. Only residual: a human on-device tap-through (no emulator
available here). Sponsored/advertising write-side stays Phase 7.

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

**Out-of-band UI polish (S15–S16, not a phase) — GrandPrice Figma design-system depth is
complete for now.** `StatTile` extraction done (S16, `stall-mobile` `6962f52`); `stall-web`
`packages/tokens/build.mjs` cross-repo write fixed (S16, `stall-web` `f15e385` — Dart output now
goes to `dist/tokens.g.dart`, gitignored, with a copy-by-hand note into `stall-mobile` when
`tokens.json` changes; `tizziserver`'s own copy of this script is intentionally left as-is since
`mobile/` is still a real sibling there). Remember the S15 workflow: edit in `tizziserver`,
disburse to `stall-web`/`stall-mobile` per file, commit there — except a fix specific to
post-split repo structure (like this one), which belongs only in the split repo it's fixing.

**Phases 0–8 are code-complete (S14).** Remaining work is cloud enablement + polish:

1. **Cloud enablement (B7 GCP + B8 Cloudflare).** Create the GCP project + billing and the
   Cloudflare zone. `cd infra/terraform && cp terraform.tfvars.example terraform.tfvars`
   (fill in), `terraform init -backend-config="bucket=<state>"`, `plan`, `apply`. Add the
   `deploy.yml` secrets (WIF provider, service account, `STAGING_/PROD_DATABASE_URL`). First
   push to `main` runs the pipeline → staging. Then wire a real OTLP collector endpoint
   (`OTEL_EXPORTER_OTLP_ENDPOINT`) + a Sentry project (`SENTRY_DSN`).
2. **Full-surface code-level security review — DONE (S17)**, 13 findings fixed (see S17
   CURRENT STATE / SESSION LOG). Still outstanding: the same sweep re-run against the *live
   staging stack* once B7/B8 land, plus an external pen-test checklist — S17 was static code
   review only, not a runtime/network-level pass. (The S14 review covered Phase 7/8 + money
   paths only — `docs/08-HARDENING.md` §1 — S17 covers the rest of the surface.)
3. **k6 load-test pass** on staging: `infra/loadtest/{checkout,dispatch,tracking}.js`;
   tune pools / indexes / Cloud Run min-instances per `docs/runbooks/dispatch-degradation.md`.
4. **Playwright admin E2E — DONE (S18, broadened S22)**: `apps/api/e2e/` now covers 16 admin
   flows (the original 6 named happy paths + login/2FA + KYC reject + fee schedule + boost
   tiers + campaign review + safety actions + audit log + analytics + logout), run via
   `pnpm --filter @stall/api test:e2e`. Found and fixed a real app bug along the way — admin
   login was completely broken (S18) — plus 3 real bugs in the tests themselves (S22, see
   CURRENT STATE). Wired into CI as a new `admin-e2e` job (Postgres service, migrate+seed,
   install Chromium, upload HTML report on failure) — nothing left open here.
5. **Phase 7 depth — ALL DONE (S19/S20/S21).** Sponsored-card injection (S20), campaign
   creative editor (S21), `ADMIN_2FA_REQUIRED` enforcement (S19). Nothing left in this item.
6. **On-device tap-through** (still deferred — no emulator on this box; as of S21 the user is
   working over remote access and plans a full real-device pass once back at the machine that
   has one). Opt-in `phaseN-e2e` HTTP suites (`E2E=1`, API running) cover every call the
   screens make.
7. **Wire real payment adapters** when B4 lands (Paystack/Flutterwave keys) against the
   existing `PaymentGateway` port; set `PAYMENTS_PROVIDER`. `payments/webhook` is idempotent.
8. **Flutter release.** Android flavors + signing plumbing — **DONE (S28)**; still open: iOS
   flavors (manual Xcode step), per-tenant app icons (Tizzi Gas artwork doesn't exist yet),
   `firebase_crashlytics` (blocked on B6 — a real Firebase project, not a config gap), store
   listings + staged rollout (`docs/08-HARDENING.md` §7).
9. ~~Housekeeping: re-seed the dev DB~~ — **DONE (S28)**, with user consent. Also fixed while at
   it: the auto-seed step of `prisma migrate reset --force` silently didn't run (had to reseed
   by hand), and stale Redis dispatch-geo data from before the reset caused an unrelated
   `delivery.test.ts` failure (Redis isn't touched by a Postgres reset) — see S28 for both.

--- older, still relevant ---

<!-- kept for reference: the Phase 6 plan (now done, S13). `@stall/core`: `chat`
   (typed conversations customer↔vendor/courier/support, attachments, entity sharing, receipts,
   block/report — `apps/realtime` `/chat`), `notifications` (categories + prefs + templates +
   FCM adapter (B6 → log/in-app fallback) + `/notifications`), `kyc` (unified review workflow +
   provider hooks, reusable across user/courier/vendor — wire in Phase-4/5 `KycCase`/`KycDocument`),
   `security` (login activity, sessions, 2FA/PIN mgmt, report), `disputes` (polymorphic on
   order/payment/delivery/vendor/courier/auction, evidence, messaging, resolution, appeal, SLA
   timers in `apps/worker`), `support` (help centre, categories, tickets + support chat).
   Contracts + Dart client + the inbox/conversation/notification-centre/identity-verification/
   security-centre/help-centre/dispute mobile screens. See `docs/05-ROADMAP.md` §Phase 6. -->
3. **On-device tap-through** (deferred, needs a real device/emulator — none on this box). The
   scripted `phase2-e2e` + `phase3-e2e` (opt-in `E2E=1`, API must be running) cover every call
   the screens make on both tenants; a human pass on `flutter run` is the only outstanding
   confirmation for Phases 1–3.
3. **Wire real payment adapters** once B4 lands (Paystack/Flutterwave sandbox keys): implement
   `PaystackGateway`/`FlutterwaveGateway` in `packages/core/src/payments/providers.ts` against
   the existing port; set `PAYMENTS_PROVIDER`. `payments/webhook` is already idempotent.
4. **Phase 3 depth (non-blocking) — DONE.** Returns/exchange + refund-to-original-payment-method
   (S24). Stale-reservation sweep for abandoned/crashed checkouts (S25). Vendor payout
   withdrawal + a latent courier-payout TOCTOU race fixed along the way (S26). Invoice PDF
   generation — the repo's first object-storage integration (S27). Coupon "first-order" scoping
   was already implemented — no work needed there. "`Settlement` reconciliation" as originally
   scoped doesn't apply — there's no separate `Settlement` model or process; the ledger +
   `Payout` drain worker loop already reconcile vendor/courier money end-to-end. Nothing left in
   this item.

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
4. ~~Wire `@stall/config` into `apps/api`~~ — **DONE (S35).** `lib/email.ts` now uses the validated `env` (it was the only live consumer of any legacy `lib/*` file; `lib/constants.ts` never read env, and `lib/utils.ts`/`lib/email-templates.ts` have no live importers — only the excluded `_legacy_services/`).
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
| B3 | ~~GCP project + billing, Cloudflare account~~ | superseded by B7/B8 | see B7/B8 |
| B7 | GCP project + billing + a Terraform state bucket + Workload Identity Federation for CI | `terraform apply` + `deploy.yml` staging/prod runs | **OPEN — Phase 8 IaC + CI/CD authored (S14), needs the project to apply.** |
| B8 | Cloudflare account + zone + an API token (DNS/WAF/R2/Turnstile edit) | `infra/terraform/cloudflare.tf` apply | **OPEN — authored (S14).** |
| B9 | OTLP collector endpoint + a Sentry project (DSN) | real traces/errors (shim logs until then) | OPEN — `@stall/core/observability` no-ops without them. |
| B4 | Payment provider accounts (Paystack/Flutterwave sandbox) | ~~Phase 3~~ real card/MoMo payments | **OPEN — worked around (S10).** Phase 3 ships on a deterministic `MockGateway`; real adapters are stubbed on the same `PaymentGateway` port. Provide sandbox keys → implement `providers.ts` + set `PAYMENTS_PROVIDER`. |
| B5 | Google Maps Platform API key(s) | Phase 4 | OPEN (not yet needed) |
| B6 | Firebase project (FCM) | Phase 4/6 | OPEN (not yet needed) |

## DECISION LOG (append-only, newest first)

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-09-03 (S15) | **Split the `tizziserver` monorepo into two independent, fresh-history private GitHub repos — `stall-web` (everything but `mobile/`) and `stall-mobile` (the Flutter app) — both under account `PPHTutorial`. `tizziserver` itself is kept, untouched, as a pending revert point** (HEAD `33f2f93`; the uncommitted Phase 3–8 work was copied out, never committed here). Editing workflow going forward: make changes in `tizziserver` (it has the fullest, most current tree), then disburse — copy the changed files to the matching path in whichever split repo owns them (`mobile/*` → `stall-mobile`, everything else → `stall-web`) and commit there. `tizziserver` is not pushed from directly. | The user wants `stall-web`/`stall-mobile` to be the real, independently-versioned deliverables (each installable/buildable standalone, e.g. for separate CI or separate contributors), while preserving `tizziserver`'s working tree exactly as it was in case the Phase 3–8 buildout needs to be reverted later — splitting first and reverting `tizziserver` after would have lost that work permanently. |
| 2026-09-02 (S14) | **`BoostTier` is the only source of ad/boost pricing + rank multipliers — nothing is hardcoded in the app, the ranker, or the API.** The admin console is the sole writer (`ads.upsertBoostTier`, `/admin/boost-tiers`); mobile reads the active set via `GET /ads/tiers`; `serving.rankBoostMap` reads `rankBoostBps` per campaign/boost. `env.ADS_DEFAULT_CPM/CPC_MINOR` are fallbacks only (a campaign with no tier). | The roadmap is explicit: "backend-configurable `BoostTier` (no hardcoded tiers)". Keeps pricing an ops lever, not a deploy. |
| 2026-09-02 (S14) | **A campaign's full budget is charged to platform escrow on submit; `AdEvent`s accrue `spentMinor`; settle (COMPLETED/CANCELLED) releases the spent portion → platform REVENUE and refunds the remainder → vendor wallet.** CPM bills `round(priceMinor/1000)` per impression, CPC bills `priceMinor` per click, FLAT_DAILY bills a day rate in the nightly rollup. Budget-exhaustion auto-pauses the campaign. `settleCampaign` flips to its terminal status **first** (guarded `updateMany`) so a retry after a partial failure can't double-release into REVENUE. | Mirrors the S10/S12 escrow model (order + auction) — ad spend is another prepaid escrow that nets to zero. The status-first guard is the S14 security fix S1. |
| 2026-09-02 (S14) | **The admin/ops console is a server-rendered Next.js area at `apps/api/app/admin`, not a separate app**, with its own `stall_admin` EdDSA cookie session (audience `stall-admin`, TTL `ADMIN_SESSION_TTL_HOURS`) minted after an OTP login, and `requireAdmin()` (STAFF/ADMIN) on every page + server action. Mutations are server actions calling `@stall/core` directly (no HTTP round-trip) with `revalidatePath`. `jose` added to `apps/api` deps. | It lives beside the API it drives (shared `@stall/core`, one deploy), and the mobile bearer-token flow stays untouched. `ADMIN_2FA_REQUIRED` env is present; enforcement is deferred. |
| 2026-09-02 (S14) | **Referral reward fires from `placeOrder`'s post-commit hook**, not a separate endpoint: `qualifyReferralForOrder` rewards the referrer's wallet (via `refundToWallet` from platform escrow) when a referred customer's order clears `REFERRAL_QUALIFY_MIN_ORDER_MINOR`; the same hook runs `ads.attributeConversion` for promoted products. A code can only be applied within 7 days of signup. | One place to attribute an order's downstream effects; keeps the reward tied to a real, paid order rather than a claimable action. |
| 2026-09-02 (S14) | **Observability is a dependency-free shim (`@stall/core/observability`), not the OTel SDK.** `initObservability(service)` at the top of all 3 services + `captureError` in `withApi`'s catch; span logs when `OTEL_EXPORTER_OTLP_ENDPOINT` is set, a minimal Sentry `store` POST when `SENTRY_DSN` is set, secret-key scrubbing always. Marked swap points for `@opentelemetry/sdk-node` + `@sentry/node`. | Delivers "wired in all 3 services" at code level with zero new deps and no behaviour change until an endpoint exists (B9). The real exporters are a config/credential step, not a code step. |
| 2026-09-02 (S14) | **GDPR deletion is a cancellable grace period + worker anonymisation, not a hard delete.** `requestAccountDeletion` → `GRACE_PERIOD` (`ACCOUNT_DELETION_GRACE_DAYS`, default 14), blocked while orders are open; worker `processDueDeletions` scrubs PII (phone tombstoned `deleted:<id>`, email/name/avatar nulled, credentials/devices/social/OTP/login-activity deleted, addresses scrubbed **in place** since orders FK them, reviews redacted), revokes every session + bumps `TokenEpoch`, tombstones vendor/courier profiles, sets `status=BANNED`+`deletedAt`. Orders / ledger / invoices / payouts are **retained** (accounting) stripped of PII. `AUDIT_LOG_RETENTION_DAYS` prunes daily. | Financial records must survive an account deletion; a grace period prevents accidental/coerced loss; session revoke + epoch bump makes the logout immediate. |
| 2026-09-02 (S13) | **`notify()` is preference-gated per category; the worker's outbox-relay is the single place that maps domain events → notifications** (`comms.notifyFromOutboxEvent`, called per-event before the relay marks it dispatched — not a separate polling loop, which would race the `dispatchedAt` marker). PUSH goes through an FCM adapter that logs when `FCM_*` is unset (B6), mirroring the S10/S12 mock-provider pattern. | One fan-out point keeps notification logic out of every core module; gating on `NotificationPreference` (default push+email+inApp, PROMO email off) is the contract the settings screen edits. |
| 2026-09-02 (S13) | **Disputes are one polymorphic `Dispute(kind, refId)` table; the Phase-4 `DeliveryDispute` and Phase-5 `AuctionDispute` stay as separate lightweight rows.** `openDispute` party-checks against the ref (order customer/vendor, delivery party, payment owner, auction participant); `resolveDispute` can issue a ledgered wallet refund (DEBIT platform REVENUE → CREDIT wallet, ADJUSTMENT txn); appeal has a config window; `sweepDisputeSla` escalates OPEN/EVIDENCE past `slaDueAt` → UNDER_REVIEW. | The data model calls for both — the domain-specific rows are quick "flag a problem" surfaces; the formal `Dispute` is the SLA-tracked, evidenced, appealable case §27 needs. Refund-from-revenue avoids reopening a settled order's escrow. |
| 2026-09-02 (S13) | **`trust.kyc.reviewKycCase` is the unified reviewer and supersedes the Phase-4/5 mock reviewers.** One `reviewKycCase(staffId, id, APPROVE\|REJECT\|RESUBMIT)` flips the `KycCase` + its `KycDocument`s and syncs the subject: VENDOR → `VendorProfile.status`+`UserRole`; COURIER → `CourierProfile.status`+`UserRole`; USER → advances a `VERIFYING` `PrizeClaim`. Writes an `AuditLog` + notifies the subject. The old `reviewVendorKyc`/`reviewCourierKyc`/`reviewPrizeClaim` still work (same tables) for their narrow flows. | §24 wants one KYC console over vendor + courier + prize-winner cases; the `KycCase`/`KycDocument`/`LivenessCheck` tables were already shared (S11/S12 decisions), so this is the review layer on top. |
| 2026-09-02 (S13) | **A `SupportTicket` always opens a backing `Conversation(kind: SUPPORT)`** with the ticket body as the first message; a STAFF agent is added as a participant on assign. The chat and the ticket share one thread. | The user experiences support as a chat; the ticket is the queue/SLA wrapper. No separate "support messages" table. |
| 2026-09-02 (S13) | **`applySafetyAction(SUSPEND\|BAN)` revokes every live `Session` and bumps `TokenEpoch`** in addition to setting `User.status` + `UserRole.status`, so an actioned account is logged out everywhere immediately (the Phase-1 epoch check rejects its access tokens). CLEAR restores ACTIVE. | A safety action that leaves the user's tokens valid is useless; the epoch mechanism already exists for "log out everywhere". |
| 2026-09-02 (S12) | **The draw is commit-reveal with a stored-at-commit seed.** `commitDraw` generates a 256-bit seed, publishes `sha256(seed)`, and stores the seed in `Draw.seedReveal` immediately; the read/API layer hides `seedReveal` + `resultHash` until `Draw.completedAt` is set. `runDraw` reveals it, builds cumulative weighted windows (`weight = max(qualificationScore, 0.0001)`, or `ticketCount` if every score is 0), and picks the winner + 3 backups deterministically via `parseInt(sha256(seed+":"+salt)[0:13],16) / 2^52`. `resultHash = sha256(seed | entries | winnerId)`. | A full VRF needs an oracle; commit-reveal is auditable now (`sha256(seedReveal) === seedCommitHash` + anyone can recompute the winner) and swappable later. Storing the seed at commit avoids a lost-seed failure mode; hiding it until completion preserves the commitment's integrity. Verified deterministic in `auctions.test.ts`. |
| 2026-09-02 (S12) | **Ticket money sits in a per-auction escrow account `ESCROW/auction:{id}`, released only when the draw resolves.** `buyTickets` HOLD → `auctionEscrow`. `runDraw`: non-winners settled per `nonWinnerPolicy` (REFUND/CREDIT → wallet via REFUND txn; VOUCHER → a `Coupon`, stake stays), then `auctionEscrow` remainder RELEASE → platform REVENUE (= the winner's + voucher stakes). `markUnsold` refunds every stake in full. `auctionEscrow` nets to zero either way. | Keeps auction float isolated from order escrow for reconciliation; the "Wallet Refund (Unsold Draw)" line in the wallet feed (from the Figma export) falls out naturally. Reconciled to the cent in tests. |
| 2026-09-02 (S12) | **Physical prize fulfilment reuses the Phase-4 `Delivery` pipeline** (`sourceType: "AUCTION"`, `sourceId: claimId`), dispatched from a config warehouse point and **platform-funded** — `fulfilPrize` sets `Delivery.feeMinor` from `AUCTION_PRIZE_DELIVERY_FEE_MINOR` and pre-funds `platformEscrow` (DEBIT REVENUE, CREDIT ESCROW) so `completeDelivery` settles the courier normally. `PAYOUT` credits the winner's wallet `winTargetMinor` from REVENUE; `PICKUP`/`DIGITAL` are records only. | No second delivery stack; the prize just becomes another `Delivery` the winner tracks on the same screen. Pre-funding keeps the ledger balanced without special-casing `completeDelivery`. |
| 2026-09-02 (S12) | **`KycSubject` gained `USER`; prize-claim KYC opens a `KycCase(subjectType: USER, subjectId: userId)`** reusing the Phase-4 `KycCase`/`KycDocument`/`LivenessCheck` tables. `reviewPrizeClaim(REJECT)` forfeits the winner and promotes `BackupWinner` #1 to a new `PENDING_CLAIM` `Winner`. | One KYC-case shape now serves vendor, courier, and prize-winner verification — exactly what the Phase-6 unified review console will consume. Backup promotion keeps the draw honest without a re-run. |
| 2026-09-02 (S11) | **Dispatch shortlisting is Redis GEO first, PostGIS `ST_DWithin` (over `CourierProfile.lastLocation`, `onlineStatus='ONLINE'`, `lastLocationAt` < 5 min) as the no-Redis fallback.** `upsertCourierPresence` always writes both. The offer waterfall is one ranked `DeliveryOffer` at a time with a TTL; the worker `dispatch-sweep` times out stale offers + advances; `expireUndispatchable` (15 min, no live offer) → `CANCELLED_BY_SYSTEM` and drops a FULFILMENT delivery back to a PENDING `Fulfilment`. | Keeps dev working with no Redis; the DB projection is needed for analytics anyway. One-at-a-time offers avoid double-assignment races and match how Bolt/Uber acceptance works. |
| 2026-09-02 (S11) | **A FULFILMENT-sourced `Delivery` settles the delivery fee itself; the order flow no longer releases it.** `ensureDeliveryForVendorOrder` re-bases `Delivery.feeMinor` to `round(order.deliveryFeeMinor / #delivery-fulfilments)` (distance pricing still drives ETA + the courier *share ratio*). On `COMPLETED`: escrow → courier `PAYABLE` (`courierPayoutMinor`) + platform `REVENUE` (remainder). `completeVendorOrder` excludes `deliveryFeeMinor` from its FEE release when any fulfilment has a `deliveryId`. Escrow nets to zero for a fully-completed order (≤ n−1 minor-unit split drift, reconciled in Phase 8). | The customer already paid the flat Phase-3 checkout delivery fee into escrow; double-releasing it (once by the order, once by the delivery) would unbalance the ledger. Verified to the cent in `delivery.test.ts`. |
| 2026-09-02 (S11) | **Pickup/drop-off verification uses plaintext 4-digit codes on `Delivery` (`pickupCode`/`dropoffCode`), mirroring `Fulfilment.pickupCode`** — not hashed OTPs. The pickup code is shown only to the vendor (+ops), the drop-off code only to the customer (+ops); the courier obtains each from the counterparty in person and keys it in. `PickupVerification`/`DeliveryVerification` still record method + `verifiedAt` + photos + signature. | 4-digit in-app codes shown to an authed counterparty are low-value + short-lived; argon per verify is overkill and the Phase-3 precedent already stores `pickupCode` plaintext. The security property (courier must physically meet the counterparty) is preserved by *who can see* the code. |
| 2026-09-02 (S11) | **Courier KYC (`KycCase.level` + `KycDocument` + mock `LivenessCheck`) landed in Phase 4, ahead of the Phase-6 unified review console.** `KycSubject` gained `USER`. Courier onboarding opens a `FULL` `KycCase`; a STAFF/ADMIN mock `reviewCourierKyc` flips it → `CourierProfile.status=ACTIVE` + `UserRole`. | Courier onboarding can't ship without doc capture; the tables are the same ones §24/Phase 6 needs, so building them now avoids a rework. The real reviewer workflow + provider (OCR/liveness) hooks stay Phase 6. |
| 2026-09-02 (S11) | **Maps: a `GOOGLE_MAPS_API_KEY`-gated Distance-Matrix proxy with a haversine × 1.32 road-factor + `MAPS_AVG_SPEED_KMH` fallback, Redis-cached (`MAPS_CACHE_TTL_SECONDS`).** Same call sites either way; polyline is null on the fallback. B5 (no Maps key yet) doesn't block the phase — mirrors the S10 payments `MockGateway` decision and the S9 geolocation fallback. | Distance/ETA math is needed for pricing, dispatch ranking, and the tracking screen now; a real key is a one-line swap. |
| 2026-09-02 (S10) | **Payments ship with a deterministic in-process `MockGateway` sandbox; real providers are stubbed on the same `PaymentGateway` port.** `PAYMENTS_PROVIDER=mock` (default) captures synchronously (fee 1.5%+30; declines when `amountMinor % 100 == 13` as a stable failure hook). `PaystackGateway`/`FlutterwaveGateway`/`StripeGateway` implement the port but throw a clear "set `<KEY>`" error until wired. `payments/webhook` is real and idempotent for when a provider is added. | Blocker B4 (no Paystack/Flutterwave sandbox accounts) can't gate the whole phase. The port + a faithful mock let checkout, escrow, refunds, and the ledger be built and fully tested now; swapping in a real adapter is a localized change. |
| 2026-09-02 (S10) | **One ledger, uniform sign: every `LedgerAccount.balanceMinor` is `Σ credits − Σ debits`; `postTxn` rejects an unbalanced txn.** Order paid → DEBIT wallet/gateway-clearing, CREDIT platform escrow. `VendorOrder` COMPLETED → DEBIT escrow, CREDIT vendor-payable (payout) + platform-revenue (commission). All sub-orders done → DEBIT escrow, CREDIT platform-revenue (delivery+service+tax). Cancel → DEBIT escrow, CREDIT customer wallet. Withdrawal → DEBIT wallet, CREDIT gateway-clearing + a PENDING `Payout`. | Avoids per-account-kind sign rules; the invariant that matters (each txn balances, wallet balance = spendable) holds, and escrow nets to zero for a fully-completed order. Verified to the cent in `commerce.test.ts`. |
| 2026-09-02 (S10) | **Commerce tables snapshot catalog data (title / price / image / vendorId as plain strings, no FK into `Product`/`VendorOffer`).** The cart re-validates against live offers on every read (`priceChanged`, `available`); orders keep the price the customer agreed to. Only structural FKs (`VendorOrder→Order`, `VendorOrder→VendorProfile`, `OrderItem→VendorOrder`, …) exist. | An order must survive a product being edited, delisted, or deleted. Snapshots also keep the orders schema decoupled from catalog churn. |
| 2026-09-02 (S10) | **Checkout is a single server-computed quote; the client never sums fees.** `POST /checkout/quote` returns ordered `lines` (subtotal / discount / delivery / service / tax / total) from `FeeSchedule(VENDOR,COMMISSION)` + `AppConfig(checkout.fees)` (service 2%, flat delivery GHS 15, free ≥ GHS 200, tax 0). `placeOrder` re-quotes server-side and ignores any client total. Delivery is a flat fee until Phase 4 wires distance pricing. | Fee logic stays in one place, tunable via config without a client release; the client can't under-pay. |
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
| 2026-09-10 | 35 | **Closed the last non-blocked NEXT-ACTIONS code item — `@stall/config` wiring in `apps/api`.** The "older, still relevant" backlog line about `lib/constants.ts` / `lib/email.ts` reading `process.env` directly was mostly stale: `lib/constants.ts` has no env reads at all (just zod schemas + enums), and `lib/utils.ts` / `lib/constants.ts` / `lib/email-templates.ts` have **zero live importers** — only the tsconfig-`exclude`d `_legacy_services/` still references them (dead code, archived S6, left as-is deliberately). The one real case: `lib/email.ts`'s `sendEmail` — the sole live consumer of any legacy `lib/*` file (via `auth/otp/route.ts`) — read `SMTP_*` / `EMAIL_FROM` off raw `process.env` with `||` fallbacks, bypassing the validated `@stall/config` `env` schema that every other `apps/api` module (`src/http/context.ts`, `admin/session.ts`, `app/api/[...api]/route.ts`, …) already uses. Swapped to `env.*` (same defaults; `SMTP_PORT` is `z.coerce.number()` so the `parseInt` went too). Also removed a real inefficiency found while in there: `sendEmail` called `transporter.verify()` before **every** send — a full extra SMTP handshake per email, so each OTP email opened two connections; `sendMail` reports a broken transport on its own. `pnpm -r typecheck` clean, `apps/api` lint 0, `apps/api` Vitest 3/3, re-verified standalone in `stall-web`. Committed to `stall-web` (`122cc13`). With this, every concrete NEXT-ACTIONS item that doesn't need a user-owned account (GCP/Cloudflare/Paystack/Firebase/a real device) is done. |
| 2026-09-10 | 34 | **Live chat + live notifications on mobile — the other half of the unused realtime gateway.** Same story as S33's `/tracking`: `apps/realtime`'s `/chat` and `/notifications` namespaces have been complete since Phase 6 (rooms, subscribe/message/typing/read, outbox-relay fan-out of `chat:message`/`chat:inbox`/`notification`), but every mobile comms screen was pure pull-to-refresh — an incoming message or notification never appeared until the user backed out and returned or dragged to refresh. New `CommsRealtime` (`mobile/lib/features/comms/comms_realtime.dart`) holds one app-lifetime pair of connections, rebuilt on login/logout via a `ref.watch(authControllerProvider)` so it reconnects with a fresh token and tears the sockets down when the session ends. The socket payloads are intentionally thin (`chat:message` is only `{messageId, senderId, recipientIds, preview}` — the outbox event's `payload`, not a full message), so every listener is treated as a *signal to refetch* the authoritative REST view rather than a source of record — the same call the `delivery:event` handler makes in S33. `messagesProvider` became a `StreamProvider.autoDispose.family`: seeds from `api.messages()`, joins the conversation room, does a 250ms-debounced refetch on `chat:message`, and flips a new `ChatThread.peerTyping` on `chat:typing` (auto-resets after 4s server-side-quiet); a 20s REST re-poll stays as a safety net for when the socket is down. `conversation_screen.dart` renders a "typing…" line and emits `typing` pings (throttled to 1/2s) as the user types. `commsLiveSyncProvider` — mounted by `HomeShell` for the whole authed session — invalidates `conversationsProvider` on `chat:inbox` and `notificationFeedProvider` (and so, transitively, the app-bar bell's `unreadNotificationsProvider`) on a `notification` push. `conversationsProvider`/`notificationFeedProvider` stayed `FutureProvider`s (screens call `.future` on them), so the change is contained to `messagesProvider` + two new providers. No server changes. `flutter analyze` 0/0, `flutter test` 39/39, real `flutter build apk` clean for both flavors. Committed to `stall-mobile` (`d7f127f`). |
| 2026-09-09 | 33 | **Wired the realtime `/tracking` socket into the mobile app — and found the courier side was never actually sending location at all.** `apps/realtime`'s `/tracking` namespace (subscribe/location/`delivery:event`) has existed since Phase 4, but no mobile code ever connected to it: the customer tracking screen polled `GET /deliveries/{id}/track` every 8s (its own code comment said as much — "the realtime socket layer can replace this later"), and — a real, previously-unnoticed gap — the courier app never called `courierBreadcrumb()` either, despite that REST method and the socket's `location` handler both existing and working; the customer-side map's courier marker/trail had no real data to show in practice regardless of which transport was used. `deliveryTrackProvider` (`mobile/lib/features/delivery/delivery_providers.dart`) now connects via a new `core/realtime.dart` helper, subscribes to the delivery's room, merges pushed `delivery:location` updates (courier lat/lng/heading + trail, capped at 60 points) and refetches on any `delivery:event` (status changes) — same `DeliveryTrackDto` shape either way, so the UI needed zero changes. The original 8s REST-poll loop is kept, not deleted: it now only kicks in as a fallback on `connect_error`/`disconnect`, so a flaky socket degrades to the pre-existing behavior instead of the screen going stale. `active_delivery_screen.dart`'s courier `_Body` now actually reports position every 6s over the same socket (REST breadcrumb as fallback when disconnected), starting on mount and stopping once the delivery reaches a final status. New dep `socket_io_client: ^3.1.6`; new `STALL_REALTIME_URL` dart-define (defaults to `localhost:3001`, `apps/realtime`'s own port) alongside the existing `STALL_API_URL`. No server-side changes needed — `apps/realtime` already implements the full contract; this was purely a mobile-side gap. `flutter analyze` 0/0, `flutter test` 39/39, and a real `flutter build apk` for both flavors succeeded (the new native Kotlin dep integrates cleanly; some noisy-but-harmless Kotlin-incremental-cache warnings about cross-drive paths are a pre-existing Windows environment quirk, unrelated to this change — the build completes either way). Also caught and fixed a `noUncheckedIndexedAccess` typecheck error in S32's new regression test that a scoped `tsc` run had missed (only ran against `orders.ts` before the test file existed) — found by a full `pnpm -r typecheck` this time. Committed to `stall-mobile` (`b4f5756`) and the typecheck fix to `stall-web` (`1c450d1`). |
| 2026-09-09 | 32 | **Targeted security review of this session's work (S27–S31: returns/refunds, vendor payouts, invoice PDFs, storage, observability, self-host infra, FCM) — one real finding, fixed.** Scoped the review to the actual new surface rather than the whole multi-week branch diff: financial/ledger code (`orders.ts`, `payouts.ts`, `earnings.ts`, `ledger.ts`, `wallet.ts`), invoice/storage (`invoice.ts`, `storage/{provider,mock,s3}.ts`, the non-`withApi` invoice download route), observability/push (`observability.ts`, `fcm.ts`, `notifications.ts`), the new vendor returns/payouts routes, and the self-host Docker/Terraform secrets handling. Ran the `security-review` skill's own methodology: one identification pass, then an independent false-positive-filtering pass per candidate finding, keeping only confidence ≥8. Cleared: vendor/courier payout ownership scoping, invoice-route IDOR, PIN-gating ordering, `guardNonNegative`'s atomicity, `storage/mock.ts`'s path-traversal guard (`path.join` can't be escaped by an absolute-looking `key`), Sentry's context-scrubbing before `captureException`, the WIF `attribute_condition`'s repo scoping, and FCM's key/payload handling — all confirmed correct on direct inspection. One confirmed at 8/10: `requestReturn` (`orders.ts`) read-checked-created a `Return` row with no transaction, lock, or unique constraint, so two concurrent `POST /orders/{id}/return` calls for the same item could both pass validation and each create a `REQUESTED` row indistinguishable in the vendor's queue; approving both issued two real refunds for one returned item. Fixed at the root: `requestReturn`'s read-check-create now runs inside a `Serializable`-isolation `$transaction` (Postgres aborts the loser with a write-conflict error, surfaced as a friendly `CONFLICT`); `reviewReturn` also gained a defense-in-depth aggregate check — before approving, it re-sums quantities across every *other* non-rejected return on the same sub-order and rejects the approval if it would exceed what's left, closing the gap even if an overlapping row got created some other way. New regression test fires two concurrent identical return requests (confirms only one wins) and directly inserts a "phantom" overlapping return row to prove `reviewReturn` refuses to approve it. `pnpm -r typecheck` clean, core Vitest 77/77 (1 new), verified standalone in `stall-web` against the same native Postgres cluster before committing (`8bacd98`). |
| 2026-09-09 | 31 | **Real Firebase Cloud Messaging push, closing another "log stub, not real" gap.** `pushToDevices()`'s own comment said "Real FCM HTTP v1 send would go here once B6 lands" — and even with `FCM_PROJECT_ID`/`FCM_PRIVATE_KEY` set, it still only logged. Since B6 is a credentials gap (a real Firebase project) rather than something blocking the SDK integration itself, gave it the same treatment as S27's S3 storage adapter and S29's OTel/Sentry SDKs: a real implementation, sandboxed by default. New `packages/core/src/comms/fcm.ts` lazily inits one `firebase-admin` app the first time a push is actually sent (no-op until all three `FCM_*` vars are set). `pushToDevices()` now calls `messaging.sendEachForMulticast()` for real — converts the notification `data` payload to all-string values (FCM's hard requirement) and, using per-token response error codes, nulls out any `Device.pushToken` FCM reports permanently dead so a stale install stops being retried forever. New `notifications.test.ts` mocks `./fcm.ts` directly (no real Firebase project needed) and verifies actual behavior: both tokens get sent, the dead one's `pushToken` gets cleared while the live one is untouched, non-string data values get stringified, and the no-devices case never calls FCM — 3/3 green. `pnpm -r typecheck` 8/8, api lint 0, core Vitest 76/76 (3 new). Manually booted `apps/worker` to confirm FCM's lazy init doesn't crash unconfigured. Committed to `stall-web` (`e932941`). |
| 2026-09-09 | 30 | **Locked: production = self-hosted, not GCP; OSM maps replace Google Maps; self-host + Cloudflare infra authored.** User decision after a cost discussion (self-host quoted ~$50-150/mo vs. GCP-managed ~$200-400+/mo at ~100k-user scale): production deploys to a VPS + docker-compose + Cloudflare instead of GCP Cloud Run/Cloud SQL/Memorystore — the GCP path (`infra/terraform/`) stays in the repo as an alternative, not deleted. FCM/APNs stay on Firebase, SMS on Nalo, email via Nodemailer + real SMTP — all already implemented, just need real credentials (user-owned). **Maps**: `google_maps_flutter` needs a native API key wired into `AndroidManifest.xml`/the iOS `AppDelegate` to render at all — confirmed neither was ever added (a real, previously-unnoticed gap: the 3 map screens were very likely rendering blank/gray maps). Replaced entirely with `flutter_map` + `latlong2` behind a new `AppMap`/`AppMapMarker`/`AppMapPolyline` abstraction (`mobile/lib/design/app_map.dart`), migrating `nearby_vendors_screen.dart`, `delivery_tracking_screen.dart`, and `active_delivery_screen.dart`. No API key, no per-load billing — tile source is a `MAP_TILE_URL_TEMPLATE` dart-define defaulting to CartoDB's free Voyager basemap (deliberately not `tile.openstreetmap.org`, whose usage policy disallows heavy/commercial use without self-hosting); swappable to a self-hosted tile server later with no call-site changes. `flutter analyze` 0/0, `flutter test` 39/39, and — unlike most of this session's mobile work — a real `flutter build apk` for both flavors succeeded (Docker/disk were healthy again by this point). **Self-host infra**: new `infra/docker/docker-compose.prod.yml` — the full stack (Postgres+PostGIS, Redis, MinIO, Meilisearch) plus `api`/`realtime`/`worker` built from the *same* `Dockerfile.{api,realtime,worker}` the GCP path already had, fronted by Caddy for automatic HTTPS; validated with the real `docker compose config` (not just read-through) using a placeholder `.env.prod`, confirming `DATABASE_URL`/`REDIS_URL`/`S3_ENDPOINT` correctly resolve to in-network service names rather than leaking `localhost`. New `infra/terraform/selfhost/` — a separate, GCP-independent Terraform module (local state, no `google` provider) that only provisions the Cloudflare side: DNS A/AAAA records at a VPS IP instead of a Cloud Run hostname, plus the same WAF/rate-limit/cache/Turnstile rules as the GCP path's `cloudflare.tf` (adapted, not reinvented). `terraform validate`/`fmt -check` clean. Fixed a real `.gitignore` gap surfaced by adding this module: the Terraform ignore rules only covered `infra/terraform/` itself, not subdirectories — any `terraform init` inside `selfhost/` would have left its `.terraform/` cache and real `.tfvars` untracked-but-not-ignored (the same accidental-huge-commit risk fixed for the root module back in S23); switched to `**`-prefixed patterns and verified with `git check-ignore` that both the root and `selfhost/` are now covered correctly. Not live-deployed anywhere this session (no VPS or Cloudflare zone available) — the Caddyfile itself also wasn't live-validated (Docker daemon wasn't running for that specific check, though `docker compose config` worked as a client-side check without it). Committed to `stall-web` (`7a3166b`, `922bd11`) and `stall-mobile` (`8402a39`). |
| 2026-09-09 | 29 | **Real OTel/Sentry SDKs; fixed a broken CI/CD test gate; added the missing WIF terraform.** Continuing the pattern of auditing "done" hardening claims: two more turned out overstated. (1) **Observability** — `packages/core/src/observability.ts` was a self-documented no-op shim (its own docstring said so) with zero test coverage, despite `08-HARDENING.md` calling it "wired". Replaced with real `@opentelemetry/api` spans and `@sentry/node` error capture. Design note: Sentry v8+ is built on OTel internally and owns the global tracer-provider registration, so rather than running a second independent `NodeTracerProvider` (two SDKs racing for the same global registration — only one wins), a generic OTLP/HTTP `BatchSpanProcessor` is plugged into *Sentry's* provider via `openTelemetrySpanProcessors` when `OTEL_EXPORTER_OTLP_ENDPOINT` is set; `SENTRY_DSN` stays independently controllable since `Sentry.init()` no-ops its own ingest with an empty DSN. New `observability.test.ts` registers a real `InMemorySpanExporter` and asserts on captured spans (name, scrubbed attributes, OK/ERROR status, recorded exceptions) plus `Sentry.captureException` call args (via `vi.mock`, since ESM namespace exports can't be `vi.spyOn`'d) — 4/4 green, not just "didn't throw". Manually booted `apps/worker` + `apps/realtime` both unconfigured and with fake OTEL/Sentry env values to confirm neither path crashes. (2) **CI/CD** — `deploy.yml`'s `gate: uses: ./.github/workflows/ci.yml` was a reusable-workflow call, but `ci.yml` had no `workflow_call:` trigger — GitHub Actions can't resolve that on the very first push to main, a parse/run-time failure unrelated to secrets. Fixed. Also found the WIF pool/provider `deploy.yml` expects (`GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_SERVICE_ACCOUNT`) never existed in terraform — new `infra/terraform/wif.tf` (GitHub OIDC provider scoped to one repo via `attribute_condition`, a dedicated deploy-time service account separate from the Cloud Run runtime SA) + two new outputs feeding those exact secrets. `terraform validate`/`fmt` clean in both repos; both workflow YAML files parsed with PyYAML (not just read-through) and the gate job now resolves to a real `workflow_call` target. Green throughout: `pnpm -r typecheck` 8/8, api lint 0, core Vitest 73/73 (4 new). Committed to `stall-web` (`4859dcd` CI/CD+WIF, `24f926e` observability, docs commit pending). |
| 2026-09-09 | 28 | **Android product flavors + release-signing plumbing; dev-environment fixes.** `docs/08-HARDENING.md` §7 claimed "Flavors already exist" — false: the app only had a `--dart-define=STALL_PLATFORM=…` Dart constant, no native flavor config, which can't produce two separately-listable Play Store apps. `mobile/android/app/build.gradle.kts` now defines real `grandprice` (`com.stall.grandprice`) / `tizzigas` (`com.stall.tizzigas`) product flavors with per-flavor `app_name` resources, plus a `key.properties`-driven release signing config (falls back to the debug keystore when absent, so unsigned release builds keep working). Both flavors verified with a real `flutter build apk` in both `tizziserver` and `stall-mobile` — succeeded, produced installable (unsigned) APKs. Also picked up a free NDK-version-mismatch fix along the way (several plugins wanted a newer NDK than configured). iOS flavors and per-tenant app icons are explicitly NOT done (manual Xcode work / missing Tizzi Gas artwork — see the doc for why). **Dev-environment housekeeping**, both surfaced by this session's own verification work: (1) `prisma migrate reset --force`'s auto-seed silently didn't run — `pnpm exec tsx prisma/seed.ts` had to be run by hand afterward; worth watching for next time a reset is needed. (2) `prisma migrate reset` only resets Postgres, not Redis — the dispatch geo-index kept stale courier ids from before the reset, causing a real (but environment-only, not product-bug) `delivery.test.ts` failure via an FK violation on `DeliveryOffer.courierId`; fixed by deleting the specific stale `stall:courier(s):*` Redis keys. Both fixes got the full suite to a clean 69/69 core + 3/3 api. Also: host disk ran to **0 bytes free on E:** and ~2GB on C: mid-session (unrelated to any code here) — reclaimed ~6GB on C: via cache cleanup (Playwright browsers, pnpm/npm/pip caches, Temp) and the user freed more on both drives; noting it here in case a future session hits the same `ENOSPC` wall on a write or build. |
| 2026-09-08 | 27 | **Invoice PDF generation — closes the Phase 3 depth backlog entirely.** The `Invoice` row was created on fulfilment but `pdfKey` was never populated; no PDF was ever rendered, and no S3 client or PDF library existed anywhere in the repo (confirmed by an S25 investigation pass before starting). New `packages/core/src/storage/` — a `PaymentGateway`-style port (`StorageProvider`) with two adapters selected by a new `STORAGE_PROVIDER` env var, mirroring `PAYMENTS_PROVIDER`'s mock/real split exactly: `mock` (default) writes to local disk under `STORAGE_MOCK_DIR` (gitignored, no external accounts, fully testable now — matches the `MockGateway` sandbox philosophy); `s3` is a real `@aws-sdk/client-s3` adapter against the already-declared `S3_*` MinIO/R2 env vars, written but not live-tested against MinIO this session (Docker wasn't running) — unlike Paystack/Flutterwave this is a config/infra gap, not a real external-account blocker, so it got a working implementation rather than a stub. New `packages/core/src/commerce/invoice.ts` renders the PDF with `pdfkit` (order + per-vendor line items + fee breakdown) and stores it via the configured provider; wired into `completeVendorOrder` right after the existing `invoice.upsert`, awaited inside a try/catch so a storage failure doesn't undo the completion. New `GET /api/v1/orders/{id}/invoice` — deliberately not built on `withApi` (every other route returns the `{ok,data,error}` JSON envelope; this one streams a raw PDF), reusing the same `getContext`/`requireAuth` `withApi` calls internally for auth; lazily regenerates the PDF on download if the best-effort generation at completion time failed. Mobile: a "Download invoice" button on order detail that fetches the bytes and hands them to the OS share sheet (new deps `path_provider`+`share_plus`, both pinned below their latest majors since they now require a newer Dart SDK than this project's floor). New Vitest coverage (2 tests) actually opened the generated PDF (`file` command + a manual page read) to confirm it's a real, correctly-rendered document, not just bytes with a `%PDF-` header. Green: `pnpm -r typecheck` 8/8, api lint 0, `flutter analyze` 0/0, `flutter test` 39/39 in both mobile repos. Not verified: the `s3` adapter against live MinIO (Docker down), and the mobile share-sheet hand-off on a real device (no emulator, consistent with every other on-device item this project has deferred). Committed to `stall-web` (`e5b24b4`) and `stall-mobile` (`974bdc6`). |
| 2026-09-08 | 26 | **Vendor payout withdrawal — closes the Phase 3 depth backlog (bar invoice PDFs).** Vendors accrued a `PAYABLE` balance on every completed sub-order but had no way to cash it out. Copied the existing courier pattern (`requestCourierPayout` in `delivery/earnings.ts`) into a new `packages/core/src/commerce/payouts.ts` (`requestVendorPayout`/`vendorBalanceMinor`/`listVendorPayouts`) rather than inventing a new shape. Along the way found the courier version has a real TOCTOU bug: its balance check runs before the transaction as a plain read, and the actual debit inside is unconditional — PAYABLE-kind ledger accounts aren't guarded against going negative the way `WALLET` is in `postTxn`. Two concurrent payout requests could both pass the pre-check and both debit, driving the balance negative. Fixed at the root: `TxnLine` gained an opt-in `guardNonNegative` flag reusing the exact atomic `updateMany`-with-a-`where`-guard already used for WALLET debits, without touching the default (still-unguarded) behavior every other PAYABLE debit relies on — a return charge-back against a vendor's PAYABLE must still be allowed to go negative. Both `requestVendorPayout` and `requestCourierPayout` now set the flag on their withdrawal line. `vendorAnalytics` gained a live `payouts.balanceMinor`. New routes `GET/POST /api/v1/vendors/payouts`; contracts + `openapi.json` regenerated (198 paths, +1). Mobile: an "Available to withdraw" card + PIN-gated withdraw dialog on the vendor analytics screen's Payouts section, mirroring the courier earnings screen. New Vitest coverage: normal withdrawal + PIN check, above-balance rejection, and a concurrency test proving only one of two simultaneous full-balance withdrawals can win (13/13 commerce tests green). `pnpm -r typecheck` 8/8, api lint 0, `flutter analyze` 0/0, `flutter test` 39/39 (+2) in both mobile repos. Committed to `stall-web` (`c8d4841`) and `stall-mobile` (`e5f024c`). |
| 2026-09-08 | 25 | **Stale-checkout reservation sweep — closes another Phase 3 depth gap found while scoping the remaining backlog.** `placeOrder` only compensates a failed payment synchronously within its own request (the catch block releases stock reservations + deletes the order); if the process crashed between creating the order graph and that payment step resolving, the order was stuck in `PENDING_PAYMENT` forever holding its reservation, with no way back — `cancelOrder` doesn't even accept `PENDING_PAYMENT` orders. New `releaseStaleReservations()` (default 1h cutoff): drops orders with no captured payment on file (same compensation as the synchronous path), but *refunds* orders where a `PaymentIntent` actually reached `SUCCEEDED` (the intent-status update and the escrow ledger post commit atomically together in `placeOrder`, so `SUCCEEDED` on file means money genuinely landed in escrow before the crash) — routed through the same `refundOrderPayment` from S24, so a gateway-paid abandoned checkout gets refunded to the card, not force-credited to the wallet. New `apps/worker` loop `stale-reservation-sweep` (15 min, same `Loop`-array pattern as `payout-drain`). `Order` gained `@@index([status, createdAt])` for the sweep's query (migration `20260908052202`, hand-stripped the usual spurious GiST/GIN `DropIndex` lines per the documented geo-DDL workflow). 2 new Vitest cases (11/11 commerce green). Also scoped invoice-PDF generation (the other open item) via a dedicated investigation pass: **no S3 client and no PDF library exist anywhere in this repo** — it would be the first object-storage integration, a real scope jump vs. this session's work, so left open rather than rushed; NEXT ACTIONS updated with what a future session needs to know before starting it. Committed to `stall-web` (`362ac05`). |
| 2026-09-08 | 24 | **Returns/exchange workflow + refund-to-original-payment-method — closes that Phase 3 depth item.** `requestReturn` previously trusted an arbitrary `items` blob with no vendor-side review at all; now it validates each `orderItemId`/qty against the real order lines (netting out qty already covered by non-rejected returns) and computes the refund amount server-side. New `reviewReturn` (vendor-scoped, same atomic-CAS pattern as `completeVendorOrder`): approve charges the refund back to the vendor's `PAYABLE` account and refunds the customer; reject is a no-op that doesn't consume the returnable quantity. New `refundOrderPayment` helper routes a refund through the original `PaymentGateway.refund()` when the order was paid by card (falls back to a wallet credit otherwise) — `cancelOrder` no longer force-refunds gateway orders to the wallet, which was a real, previously-unnoticed bug (a `refundToWallet(sourceAccount)` param lets both the pre-fulfilment escrow-sourced cancel and the post-fulfilment vendor-payable-sourced return share the same wallet-credit path). New `listVendorReturns` queue + 2 routes (`GET /vendors/returns`, `POST /vendors/returns/{id}/review`); contracts + `openapi.json` regenerated (197 paths, +2). Mobile: order-detail gained a "Return" action (item/qty picker capped by what's left, reason field) and inline return-status badges; vendor order-detail gained approve/reject cards. Also confirmed coupon `firstOrderOnly` scoping was already fully implemented — no work needed, NEXT ACTIONS updated to stop listing it as open. Green: `pnpm -r typecheck` 8/8, api lint 0, core Vitest 74 (9 commerce, incl. 3 new: gateway-refund-not-wallet, return-approve, return-reject) — 1 unrelated pre-existing failure (`gas-refill-deal` promo naturally expired, `endsInHours: 24` in seed data, nothing to do with this change); `flutter analyze` 0/0 and `flutter test` 38/38 (+3) in both mobile repos. Committed to `stall-web` (`50549eb`) and `stall-mobile` (`aaa5d81`). |
| 2026-09-06 | 23 | **Terraform syntax bug found + fixed; `.gitignore` hardened.** User asked what else could be verified without them configuring cloud credentials — actually ran `terraform init`/`validate`/`fmt -check` against `infra/terraform/` for the first time (prior "validate-clean" claims from S14 were never checked with a real binary). `gcp.tf`'s `google_secret_manager_secret` had `replication { auto {} }` — an invalid single-line nested block — which made `terraform init` fail outright; reformatted to a proper multi-line block. `init`/`validate`/`fmt -check -recursive` all pass now. Also found `.terraform/` (289MB local provider cache) was untracked and un-ignored, and `.terraform.lock.hcl` wasn't committed — added Terraform-specific `.gitignore` entries (ignore `.terraform/`, `*.tfstate*`, `*.tfvars`; keep `*.tfvars.example` and the lock file tracked) and deleted the local cache dir. Also spot-checked `.github/workflows/deploy.yml` (valid YAML, 5 jobs) and `docker compose ... config` (clean) — both still sound. Re-verified standalone in `stall-web` (`init`/`validate` green there too) before committing. Committed to `stall-web` (`99138ad`). This is local syntax/config validation only, not a real `plan`/`apply` — that still needs the user's actual GCP/Cloudflare credentials. |
| 2026-09-05 | 22 | **Broadened admin E2E coverage (16 tests, up from 8).** Added KYC reject, fee-schedule save, boost-tier create+disable, campaign review approve, a safety-action (SUSPEND), an audit-log check, an analytics smoke check, and logout. Fixed 3 real test bugs found chasing a cascade failure: KycCase's `@@unique([subjectType, subjectId])` needs a fresh subject per case; boost-tier locators needed scoping to the create form (existing rows' hidden inputs collided); safety-action assertion needed an exact match (Roles column text collided with the Status badge). Also fixed a `getByPlaceholder("premium")`/`("Premium")` case-insensitive collision of my own. Added a `SKIP_E2E_CLEANUP=1` debug escape hatch. All 16 green, verified standalone in `stall-web`. Committed to `stall-web` (`095e3cf`). |
| 2026-09-05 | 21 | **Campaign creative editor screen — Phase 7 depth fully closed.** Backend CRUD existed (S14) but the mobile app only showed creatives read-only. Added `updateCampaignCreative`/`removeCampaignCreative` to `StallApi` (`addCampaignCreative` extended with missing fields), extended `getCampaign`'s shaped response to echo `subtext`/`destinationRoute`/`weight`, and added a shared `_CreativeFormSheet` (add + edit, placement/kind/product pickers, weight slider, active toggle + remove) in `campaign_detail_screen.dart`. `flutter analyze` 0/0 and `flutter test` 35/35 in both mobile repos; `pnpm -r typecheck` 8/8 and Vitest 64/64 after the backend change. No emulator available to verify on-device. Committed to `stall-web` (`26a1acf`) and `stall-mobile` (`a682452`). |
| 2026-09-05 | 20 | **Sponsored-card injection — closes out Phase 7 depth.** New `SponsoredRail` widget (`mobile/lib/features/ads/widgets/`) renders a horizontal ad strip that no-ops on loading/empty/error, logs IMPRESSION-per-card once per ad set and CLICK on tap (best-effort), routes to the product or the ad's `destinationRoute`. Wired into `catalog_home_body.dart` (`HOME_RAIL`) and `search_screen.dart` (`SEARCH_TOP`) — the exact two placements named in NEXT ACTIONS. Backed by real seed data (`seed-campaign-orbit`). No emulator on this box to visually confirm — relied on `flutter analyze` (0/0 both repos), `flutter test` (35/35 both repos), and manual field-name/seed-data verification instead. Committed to `stall-mobile` (`99925b6`). |
| 2026-09-05 | 19 | **Enforce `ADMIN_2FA_REQUIRED`.** The env flag (default true, present since S14) was never actually checked anywhere. `verifyLoginOtp` now requires a confirmed TOTP enrollment before minting an admin session — refuses login outright if none exists, otherwise routes to a new third `verifyLoginTotp` step requiring a valid code; falls back to single-factor if the flag is off. Login page gained the third step UI. Extended the Playwright fixture to enroll+confirm real TOTP (via `@stall/core`, codes generated with `otpauth`) and added a test for the no-2FA-refused path. 8/8 Playwright tests green, verified standalone in `stall-web` itself before committing there; `pnpm -r typecheck` 8/8 and Vitest (64 tests) still green. Committed to `stall-web` (`51ba683`). |
| 2026-09-05 | 18 | **Playwright admin E2E suite; fixed broken admin login; wired into CI.** Found and fixed: `requestLoginOtp` never passed `userId` to `issueOtp` (every admin OTP row had `userId: null`, so login could never succeed) and never called `sendSms` (code was never delivered) — now looks up the account by phone and sends the code. Added `apps/api/e2e/` (fixtures.ts + admin.spec.ts) + `playwright.config.ts`: 7 tests covering login, KYC approve, dispute resolve, feature-flag round-trip, pricing-rule save, draw commit+run, broadcast compose+send — fixtures created directly via Prisma, OTP completed via a test-controlled DB overwrite (no real SMS). Wired a new `admin-e2e` CI job (Postgres service, migrate+seed, Chromium install, HTML report on failure). All 7 green; `pnpm -r typecheck` 8/8 and the full Vitest suite (64 tests) still green after the login fix. Committed to `stall-web` (`2d05e49` suite, `fb76f84` CI). |
| 2026-09-05 | 17 | **Full-surface security review + 13 fixes.** 7 parallel domain-scoped review passes (auth, payments/wallet/ledger, admin console, delivery/realtime, auctions, chat/trust, catalog/ads/privacy) found 19 candidates; an independent verification pass confirmed 13 at high confidence, all fixed. Financial: payment webhook now HMAC-signature-gated + can't resurrect a FAILED intent to SUCCEEDED; `completeVendorOrder`/`cancelOrder` atomically status-guarded (no more double-release/double-refund); `postTxn` atomically guards WALLET debits against balance (TOCTOU overdraft fix, scoped to WALLET only after an initial over-broad version broke `topUpWallet`'s CLEARING-account flow); ad-event dedup anchored on server IP not client sessionId. Auth: new `requireSuperAdmin()` gate on pricing/fees/boost-tiers/feature-flags/broadcasts/draws/dispute-refunds/safety-actions (console + REST); legacy `_compat` 2FA bypass closed; admin sessions now DB-revocable every request; delivery reschedule IDOR fixed; dispute VENDOR/COURIER party-check added (+ `againstId` correctness fix); chat `typing` entitlement fixed. Auctions: draw seed no longer leaks pre-`completedAt`; qualification score capped + dedupe-required + status-gated. Verified: `pnpm -r typecheck` 8/8 green; full Vitest suite (64 tests) green against a freshly reset+migrated+seeded local dev DB (user-consented reset per Prisma's AI-action guardrail). Committed to `stall-web` (`5e9d91f`, 29 files). |
| 2026-09-05 | 16 | **Split-repo build verification + GrandPrice Figma design-system depth pass.** Verified `stall-web` (`pnpm install` → `pnpm db:generate` → `pnpm typecheck` 8/8 → `pnpm lint`, all green) and `stall-mobile` (`flutter pub get` → `flutter analyze` 0) build clean standalone. Flagged (not fixed): `stall-web/packages/tokens/build.mjs` still writes a dead cross-repo `mobile/lib/design/tokens.g.dart` path post-split. Design work (edited in `tizziserver/mobile`, disbursed to `stall-mobile`): product-detail screen gained a tablet-width (≥840dp) side-by-side gallery|info layout (`_Gallery`/`_InfoSection` extracted, shared with the phone `CustomScrollView`); 18 screens across auctions/auth/catalog/commerce/courier/delivery/trust/ads/selling swept onto shared `AppCard`/`StatusBadge` in place of ad-hoc containers/pills (tinted semantic-color cards correctly left bespoke); committed to `stall-mobile` (`7de7971`, 19 files). Then extracted the shared `StatTile` widget for the repeated sunken-box KPI-number-tile pattern (6 screens: campaign detail, courier performance history, vendor analytics, courier dashboard, referrals, courier earnings — each had its own drifted `_kpi`/`_Stat`/`_stat`/`_mini` copy), leaving two genuinely-different bare-number-column patterns alone; committed to `stall-mobile` separately (`6962f52`, 7 files). Fixed `stall-web/packages/tokens/build.mjs`'s dead cross-repo write (Dart output now to `dist/tokens.g.dart`, gitignored, with a manual-copy note; `pnpm typecheck` 8/8 green) — `f15e385`; `tizziserver`'s own copy left as-is since `mobile/` is still a real sibling there. `flutter analyze` 0 throughout. `docs/PROGRESS.md` synced to `stall-web` (`b3f25fc`, `4e16ffb`). GrandPrice Figma design-system depth pass complete for now. |
| 2026-09-03 | 15 | **Split `tizziserver` into `stall-web` + `stall-mobile`.** Copied the git-trackable file set (tracked + untracked-not-ignored) into fresh sibling repos `e:\Projects\NextJs\stall-web` (everything but `mobile/`) and `stall-mobile` (`mobile/` at repo root); 8 thematic commits + `git init` in each, both private under `PPHTutorial`, branch `main`. `tizziserver` deliberately left untouched (HEAD `33f2f93`, ~158 uncommitted Phase 3–8 paths only copied out, never committed) as a pending revert point — do not `git checkout -- .`/`clean -fd`/`reset --hard` it without the user's explicit go-ahead. New workflow: edit in `tizziserver`, disburse changed files to whichever split repo owns them, commit there. |
| 2026-09-02 | 14 | **Phases 7 + 8 — code-complete.** **P7:** schema Domain 8 (`BoostTier` backend-editable, `Campaign`/`CampaignItem`/`Advertisement`/`AdEvent`/`AdDailyStat`, `Boost`, `ReferralCode`/`Referral`, `AnalyticsSnapshot`; migration `20260902070643`). `@stall/core` `ads` (tiers CRUD, campaign lifecycle w/ escrow-charged budget + CPM/CPC/FLAT_DAILY accrual + budget-exhaustion auto-pause + status-first settle guard, sponsored serving + `rankBoostMap`, direct `Boost` pro-rata, nightly `rollupAdStats`/`compactAdEvents`/`attributeConversion`), `analytics` (vendor/courier/platform + `AnalyticsSnapshot`), `referrals` (code/apply/reward-on-qualifying-order/expiry — fired from `placeOrder` post-commit), `admin` (dashboard, feature-flag matrix, pricing/fee editors, broadcast composer + send, audit-log, user directory). **Admin web console** `apps/api/app/admin/*` (Next.js, `stall_admin` EdDSA cookie session, STAFF/ADMIN-gated, server actions → core): login/dashboard/analytics/KYC/disputes/campaign-review/boost-tiers/draws/broadcasts/feature-flags/pricing/users/audit-log. `apps/worker` +`ads-sweep`/`broadcast-referral-sweep`/`analytics-rollup`. 34 `/api/v1` routes; `ads.ts` → `openapi.json` **195 paths/224 ops**. Vitest `ads.test.ts` (6) + `analytics.test.ts` (5) → 61 TS green; opt-in `phase7-e2e.test.ts`. Seed +3 boost tiers +1 campaign +2 referral codes. Mobile: `ads_models.dart` + `StallApi` methods, advertising center / campaign detail / vendor analytics / courier performance history / refer & earn; router + `HomeShell` account-tab entries. **P8:** `@stall/core/observability` (dependency-free OTel/Sentry shim, `initObservability` ×3 + `captureError` in `withApi`); **GDPR** — `AccountDeletionRequest` (migration `20260902074802`), `@stall/core/privacy` (export / request+grace / worker anonymise+revoke+tombstone / audit prune), routes `GET /me/data-export` + `GET/POST/DELETE /me/account/deletion`, worker `privacy-sweep`, `privacy.test.ts` (3); `infra/terraform/` (GCP Cloud Run ×3 + Cloud SQL PG16 + PITR + PostGIS + Memorystore + Secret Manager + Cloudflare WAF/rate-limit/Turnstile/R2, validate-clean); `infra/docker/Dockerfile.{api,realtime,worker}` + `.dockerignore` + `start:prod`; `.github/workflows/deploy.yml` (gate → build/push → migrate → no-traffic deploy → traffic shift → smoke → auto rollback; prod gated); `docs/runbooks/` (7 playbooks); security review — 4 real fixes in `docs/08-HARDENING.md`. Green: pnpm `-r typecheck` (8) · api lint · core vitest 61 · contracts 195 paths · flutter analyze 0 / test 35 (+5) · `next build` (admin + all routes). **All engineering phases 0–8 code-complete; remaining = cloud enablement (B7/B8/B9).** |
| 2026-09-02 | 13 | **Phase 6 — Chat / notifications / trust & safety / disputes / support — code-complete.** Schema Domains 9+10 (15 models); migration `20260902061543_comms_trust_domain9_10`. `@stall/core/comms` (`chat` deduped conversations + receipts + block + convenience openers + `chat.message` outbox; `notifications` per-`NotificationPreference` + FCM log fallback + feed/prefs + `notifyFromOutboxEvent`). `@stall/core/trust` (`disputes` polymorphic party-checked + SLA + evidence/messaging + `resolveDispute` ledgered wallet refund + appeal; `support` help/FAQ + ticket→SUPPORT conversation; `kyc` **unified** `reviewKycCase` syncing vendor/courier/`UserRole`/`PrizeClaim`; `reports`+`safety` + `applySafetyAction` → `User.status`+session revoke+`TokenEpoch` bump + `safetyCenter`). `apps/realtime` `/chat` + `/notifications` namespaces (JWT, rooms, redis rebroadcast). `apps/worker` OutboxEvent→notification in the relay + `dispute-sla` loop. 72 `/api/v1` routes (incl. a full STAFF/ADMIN block) + `comms.ts` contract → `openapi.json` 159 paths/179 ops. Vitest `comms.test.ts` (7 — chat dedupe/unread/block, prefs + outbox mapping, dispute open→evidence→resolve+refund+appeal, non-party rejected, support ticket→chat, unified KYC flips a courier) → 47 TS green; opt-in `phase6-e2e.test.ts`. Mobile: `comms_models.dart` + `StallApi` methods, inbox / conversation / notification centre (+prefs) / disputes (list+open+detail+appeal) / help & support / security centre; app-bar bell + inbox icon; account-tab entries; order-detail "Message seller". Green: pnpm `-r typecheck` · api lint · core vitest 47 · flutter analyze 0 / test 30 (+4). ACTIVE PHASE → Phase 7. |
| 2026-09-02 | 12 | **Phase 5 — Auctions / Inverse Draws — code-complete (GrandPrice-only).** Schema Domain 7 (17 models); migration `20260902055055_auction_domain7`. `@stall/core/auctions`: lifecycle + reads, `buyTickets` (wallet/gateway → per-auction escrow, seat mint + bonus, `TicketWallet`/`AuctionParticipant`/`QualificationEvent`), qualification engine (`score = Σ weight·points`, key-deduped signals, ranks, leaderboard — **weighting, never a guarantee**), **commit-reveal draw engine** (`commitDraw` seed commit → `runDraw` weighted `DrawEntry` windows + deterministic `Winner`+3 backups + `resultHash`; escrow settles per `nonWinnerPolicy` then remainder → REVENUE; `markUnsold` full refund; `dueDraws` worker loop), prize flow (`startPrizeClaim`→`submitClaimKyc` unified `KycCase(USER)`→`reviewPrizeClaim` +backup promotion→`fulfilPrize` DELIVERY spawns a Phase-4 `Delivery`; `purchaseWinTarget`). Ledger `auctionEscrow(auctionId)`. `apps/worker` `auction-draws` loop. 21 `/api/v1` routes (all `capability: "auction"`) + `auction.ts` contract → `openapi.json` 122 paths/137 ops. Vitest `auctions.test.ts` (6 — guard, mint+escrow+qual, key-dedupe, full commit-reveal draw + determinism + ledger reconcile, UNSOLD refund, claim→KYC→approve→winTarget) → 40 TS green; opt-in `phase5-e2e.test.ts`. Seed +1 live draw +3 packages +asset. Mobile: `auction_models.dart` + `StallApi` methods, marketplace/detail (dual CTA, buy sheet, draw proof, winner banner)/qualification centre/my-tickets/winner-claim; account-tab entries gated on `hasFeature('auction')`. Green: pnpm `-r typecheck` · api lint · core vitest 40 · flutter analyze 0 / test 26 (+4). ACTIVE PHASE → Phase 6. |
| 2026-09-02 | 11 | **Phase 4 — Delivery / courier / realtime / maps — code-complete.** Schema Domain 5 + courier KYC (`KycDocument`/`LivenessCheck`); migrations `20260902045932`, `20260902051042`. `@stall/core` `maps` (Distance-Matrix proxy + haversine fallback, Redis-cached) + `delivery` (pricing, zones, Redis-GEO/PostGIS dispatch shortlist, ranked-offer waterfall, active-delivery state machine → `DeliveryEvent`+`OutboxEvent`, pickup/dropoff code verify, POD, ratings, disputes, breadcrumbs+track, earnings→ledger, PIN payout) + `couriers` (onboarding→unified KYC, fleet, ops/online/jobs). `ensureDeliveryForVendorOrder` spawns a `Delivery` on `READY_FOR_PICKUP` (fee re-based to captured share; `completeVendorOrder` excludes delivery fee when a delivery exists). `apps/realtime` `/tracking`+`/delivery-ops` (JWT, rooms, location ingest, redis-adapter, `stall:realtime` channel). `apps/worker` real loops (outbox-relay, dispatch-sweep, eta-refresh, payout-drain, breadcrumb-compact). 43 `/api/v1` routes; `delivery.ts` → `openapi.json` 103 paths/118 ops. Vitest `delivery.test.ts` (7 — pricing, full lifecycle + ledger reconcile, dispatch decline/cancel, fulfilment-sourced balance, tenant iso) → 34 TS green; opt-in `phase4-e2e.test.ts`. Seed +2 zones +2 live couriers. Mobile: `delivery_models.dart` + `StallApi` methods, customer tracking screen, courier dashboard/onboarding/jobs/active-delivery/earnings/performance, shell courier tabs, order-detail "Track delivery". Green: pnpm `-r typecheck` · api lint · core vitest 34 · flutter analyze 0 / test 22 (+4). ACTIVE PHASE → Phase 5. |
| 2026-09-02 | 10 | **Phase 2 closed + Phase 3 built.** (1) Device-parity: `phase2-e2e.test.ts` (opt-in `E2E=1`) — customer + vendor + tenant-isolation flows as HTTP, 3/3 green; `flutter analyze` 0 / `test` 12. (2) Polish: `nearbyVendors` lat/lng (PostGIS `ST_Y/ST_X`) → contract + Flutter markers; `geolocator` + `DeviceLocation` in Nearby Vendors; product video (`ProductMediaDto`/`videos`, `_ProductVideo` `video_player` widget, `mediaUrl()`, seeded `VIDEO` media). (3) **Phase 3** — schema Domain 4+6 (migration `20260902004441_commerce_domain4_6`); `@stall/core` `commerce`+`wallet`+`payments` (double-entry ledger, multi-vendor cart, coupon eval, server checkout quote, `placeOrder` wallet/gateway → escrow, `completeVendorOrder` → payout/commission release, `cancelOrder` → wallet refund, PIN withdrawal); `MockGateway` sandbox + stubbed real adapters; 24 `/api/v1` routes; `commerce.ts` contract → `openapi.json` 60 paths/72 ops; `commerce.test.ts` (7) → 27 TS green; `phase3-e2e.test.ts` (4) green vs live API. Mobile: commerce models + `CartController` + cart/checkout/orders/order-detail/wallet/address-book/coupons screens + add-to-cart + cart badge; `flutter analyze` 0 / `test` 18. Seed +`checkout.fees` +4 coupons; seeded catalog-vendor roles hardened. Green: pnpm `-r typecheck` · api lint · core vitest 27 · flutter analyze 0 / test 18. |
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
