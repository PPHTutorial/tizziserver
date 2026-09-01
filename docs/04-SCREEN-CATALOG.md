# GRANDPRICE — SCREEN CATALOG & BUILD TRACKER

Maps the 522 numbered screens (34 sections) of `GrandPrice — Mobile Figma Screen Expansion
Specification` to backend module, roles, feature gate, realtime/map involvement, and build
status. **This is the checklist we tick as screens get specced and built.**

Status legend: `⬜ not started` · `📝 spec written` · `🎨 design done` · `🔨 building` ·
`✅ shipped`. Update the section rows as work proceeds (see `RESUME.md`).

Gate column: `all` = every platform · `gp` = GrandPrice only · `gas` = Tizzi Gas relevant ·
capability key in `()`.

---

## Section index

| # | MD Section | Screens | Primary module(s) | Roles | Gate | Realtime | Maps | Phase | Status |
|---|---|---|---|---|---|---|---|---|---|
| 01 | Design System | components | `packages/tokens` + `packages/design` | — | all | — | — | 0 | ⬜ |
| 02 | Authentication & Account Access | 1–20 | `auth`, identity | all | all | — | — | 1 | ⬜ |
| 03 | Customer Home & Marketplace | 21–40 | `catalog`, `promotions` | Customer | all (`catalog.scope`) | notif | nearby | 2 | ⬜ |
| 04 | Search & Discovery | 41–59 | `catalog/search` | Customer | all | — | location filter | 2 | ⬜ |
| 05 | Product Experience | 60–80 | `catalog`, `reviews` | Customer | all | — | — | 2 | ⬜ |
| 06 | Cart & Checkout | 81–103 | `cart`, `checkout`, `payments`, `coupons` | Customer | all | — | address picker | 3 | ⬜ |
| 07 | Orders & Fulfilment | 104–123 | `orders`, `returns`, `refunds` | Customer | all | order events | — | 3 | ⬜ |
| 08 | Delivery & Courier — Customer | 124–151 | `delivery` | Customer | all (`delivery.live_tracking`) | **tracking** | **live map** | 4 | ⬜ |
| 09 | Courier Registration & Onboarding | 152–170 | `couriers`, `kyc` | Courier | all | — | — | 4 | ⬜ |
| 10 | Courier Vehicle Management | 171–185 | `couriers/vehicles` | Courier | all | — | — | 4 | ⬜ |
| 11 | Courier Service Area & Availability | 186–197 | `couriers/service-areas` | Courier | all | presence | **area editor, courier map** | 4 | ⬜ |
| 12 | Courier Job Marketplace | 198–212 | `delivery/jobs`, dispatch | Courier | all | **jobs feed** | **jobs map** | 4 | ⬜ |
| 13 | Courier Active Delivery | 213–242 | `delivery/active`, verification | Courier | all | **tracking** | **navigation** | 4 | ⬜ |
| 14 | Courier Earnings & Wallet | 243–262 | `wallet`, `payouts`, `couriers/earnings` | Courier | all (`wallet.withdraw`) | balance push | — | 4 | ⬜ |
| 15 | Courier Performance | 263–274 | `couriers/performance`, analytics | Courier | all | — | — | 4/7 | ⬜ |
| 16 | Courier Profile & Settings | 275–290 | `couriers`, identity, `security` | Courier | all | — | — | 4 | ⬜ |
| 17 | GrandPrice Auction System | 291–321 | `auctions` | Customer | **gp** (`auction`) | draw live | prize delivery map | 5 | ⬜ |
| 18 | Tickets, Qualification & Ranking | 322–338 | `auctions/tickets`, `qualification` | Customer | **gp** (`auction`) | qualification push | — | 5 | ⬜ |
| 19 | Wallet & Financial System | 339–356 | `wallet`, `payments`, `security` | Customer | all (`wallet`) | balance push | — | 3 | ⬜ |
| 20 | Coupons & Promotions | 357–368 | `coupons`, `promotions`, `referrals` | Customer | all (`coupons`) | — | — | 3 | ⬜ |
| 21 | Chat & Communication | 369–382 | `chat` | Customer/Vendor/Courier | all (`chat`) | **chat** | share location | 6 | ⬜ |
| 22 | Notifications | 383–394 | `notifications` | all | all | **notifications** | — | 6 | ⬜ |
| 23 | Customer Profile | 395–415 | identity, `users`, addresses | Customer | all | — | saved locations | 2/6 | ⬜ |
| 24 | KYC, Trust & Safety | 416–434 | `kyc`, `reports`, `security` | all | all | — | — | 6 | ⬜ |
| 25 | Vendor Mobile System | 435–469 | `vendors`, `orders`, `catalog`, `wallet` | Vendor | all | order/pickup push | — | 2/3/4 | ⬜ |
| 26 | Vendor Boosting & Advertising | 470–486 | `campaigns`, `boosts`, `ads` | Vendor | **gp** (`advertising`) | — | — | 7 | ⬜ |
| 27 | Support & Disputes | 487–502 | `support`, `disputes` | all | all | dispute push | — | 6 | ⬜ |
| 28 | Global System States | 503–522 | `packages/design` | — | all | offline detect | permission primers | 0/ongoing | ⬜ |
| 29 | Global Overlays & Component Screens | components | `packages/design` | — | all | — | map sheet, QR | 0/ongoing | ⬜ |
| 30 | Responsive & Tablet | variants | `packages/design` + every screen | — | all | — | two-pane maps | ongoing | ⬜ |
| 31 | Font & Icon Requirements | rule | `packages/tokens` | — | all | — | FA markers | 0 | ⬜ |
| 32 | Core Mobile Navigation | 3 nav sets | `platform` bootstrap + `GpBottomNav` | all | all | — | — | 1 | ⬜ |
| 33 | Data-Model Awareness | rule | `packages/db` | — | — | — | — | see `02-DATA-MODEL.md` | ✅ (outlined) |
| 34 | Final Figma Requirement | org rule | design file structure | — | — | — | — | ongoing | ⬜ |

## Feature-gate summary (what Tizzi Gas does NOT get)

| Capability key | GrandPrice | Tizzi Gas | Effect |
|---|---|---|---|
| `auction` | ✅ | ❌ | Sections 17, 18; auction product-card variant; auction notifications; auction disputes hidden. |
| `advertising` | ✅ | ❌ (or read-only) | Section 26; sponsored/boosted card variants suppressed. |
| `catalog.scope` | `all` | `gas` | Section 03/04/05 restricted to the Gas category tree + gas vendors. |
| `catalog.multi_vendor_cart` | ✅ | ✅ (simplified) | Gas cart typically single-vendor; grouping UI still present. |
| `premium_assets` | ✅ | ❌ | Screen 32, 113 (Premium Assets) hidden. |
| `delivery.live_tracking` | ✅ | ✅ | Both keep the Bolt-style tracking (it's core to gas too). |
| `wallet` / `wallet.withdraw` | ✅ | ✅ | Shared. |

Resolution: `apps/api/src/platform/resolver` → `ctx.features`; `GET /config/bootstrap` returns
`features` + `nav`; mobile hides routes/cards whose capability is off; API returns
`403 FEATURE_DISABLED` as defense in depth.

---

## Worked example — Section 08 (Delivery & Courier — Customer), screens 124–151

Template for how every section gets expanded. Columns: screen · state(s) · API · entity · realtime · notes.

| # | Screen | Key states | API (`/api/v1`) | Entities | RT event | Notes |
|---|---|---|---|---|---|---|
| 124 | Delivery Options | loading/empty | `POST delivery/quote` | `PricingRule`,`DeliveryZone` | — | Methods: platform delivery / pickup / vendor logistics. |
| 125 | Delivery Fee Estimate | — | `POST delivery/quote` | `PricingRule` | — | Distance×vehicle×surge breakdown via `GpAmountBreakdown`. |
| 126 | Delivery Time Estimate | — | `POST delivery/quote` | Distance Matrix cache | — | Server-proxied Google ETA. |
| 127 | Delivery Method Selection | selected | `PATCH checkout/{id}/fulfilment` | `Fulfilment` | — | Feeds checkout fee lines. |
| 128 | Courier Assigned | — | `GET delivery/{id}` | `Delivery`,`CourierProfile` | `delivery.assigned` | Reveal `GpCourierMiniCard` (masked). |
| 129 | Courier Profile | — | `GET delivery/{id}/courier` | `CourierProfile` (public DTO) | — | Name, photo, rating, vehicle, trips. No PII. |
| 130 | Courier Rating | submitted | `POST delivery/{id}/rating` | `DeliveryRating` | — | Post-completion only. |
| 131 | Courier Vehicle Info | — | in courier DTO | `CourierVehicle` | — | Type, model, color, plate (partial). |
| 132 | Delivery Tracking | live/offline/ended | `GET delivery/{id}` + WS `/tracking` room `delivery:{id}` | `Delivery`,`DeliveryEvent`,`DeliveryLocation` | `courier.location`,`delivery.status` | Status stepper + map. |
| 133 | Live Delivery Map | permission/loading/live | WS `/tracking` | `DeliveryLocation` | `courier.location` | `GpMapView` follow camera; polyline. Tablet: map∥details. |
| 134 | Courier Location | stale/live | WS | `DeliveryLocation` | `courier.location` | Marker rotates to `heading`; "updated Ns ago". |
| 135 | Courier ETA | — | WS + `GET delivery/{id}` | Distance Matrix cache | `courier.eta` | `GpEtaPill`; recompute on significant deviation. |
| 136 | Contact Courier | — | `POST chat/conversations` (kind=CUSTOMER_COURIER) | `Conversation` | `chat` | Opens conversation scoped to delivery. |
| 137 | Call Courier | — | `POST delivery/{id}/call` | proxy-call provider | — | Masked-number bridge; no raw phone. |
| 138 | Message Courier | — | `POST chat/{id}/messages` | `Message` | `chat` | Quick replies. |
| 139 | Courier Arriving | — | — | `DeliveryEvent(ARRIVED_PICKUP?/near dropoff)` | `delivery.status` | Push + in-app banner at geofence. |
| 140 | Courier Arrived | — | — | `DeliveryEvent(ARRIVED_DROPOFF)` | `delivery.status` | Prompt to prepare OTP/QR. |
| 141 | Delivery OTP | error/success | `GET delivery/{id}/otp` | `DeliveryVerification` | — | 6-digit; shown to customer, entered by courier. |
| 142 | Delivery Verification | pending/failed/done | `POST delivery/{id}/verify` | `DeliveryVerification`,`ProofOfDelivery` | `delivery.status` | OTP / QR / signature / photo. |
| 143 | Delivery Completed | — | `GET delivery/{id}` | `Delivery(DELIVERED)` | `delivery.status` | `GpSuccessState` + receipt CTA. |
| 144 | Delivery Receipt | — | `GET delivery/{id}/receipt` | `Delivery`,`Fee*` | — | PDF/share. |
| 145 | Delivery Failed | retry/reschedule | `POST delivery/{id}/report` | `DeliveryEvent(FAILED_*)` | `delivery.status` | Reasons enumerated. |
| 146 | Customer Unavailable | — | — | `DeliveryEvent` | `delivery.status` | Courier-triggered; offer reschedule. |
| 147 | Reschedule Delivery | — | `POST delivery/{id}/reschedule` | `Delivery.scheduledFor` | `delivery.status` | Date/time picker. |
| 148 | Delivery Reassignment | — | `POST delivery/{id}/reassign` (system/ops) | `DeliveryOffer` | `delivery.status` | New courier search; UI shows "finding another courier". |
| 149 | Report Delivery Problem | submitted | `POST delivery/{id}/issue` | `OrderIssue`/`DeliveryDispute` | — | Category + evidence. |
| 150 | Delivery Dispute | open/evidence/resolved/appeal | `POST disputes` (kind=DELIVERY) | `Dispute`,`DisputeEvidence` | `dispute` | Full dispute flow (§27). |
| 151 | Delivery History | empty/loaded | `GET delivery?role=customer&status=...` | `Delivery` | — | List + filters + re-open. |

Overlays used: `GpMapBottomSheet`, `GpCourierMiniCard`, `GpDeliveryStatusIndicator`,
`GpOtpField`/`GpQrDisplay`, `GpBottomSheet` (reschedule), `GpReportSheet`.
Responsive: phone = map full-bleed + draggable sheet; tablet (`expanded`+) = `GpTwoPane`
map ∥ details.

---

## Expansion plan

Sections are expanded to per-screen tables (like §08 above) **at the start of the phase that
owns them** (see the Phase column), not all up front — keeps specs close to implementation and
avoids stale detail. Each expansion lands in this file under a `## Section NN — <name>` heading
and flips the index row to `📝`.

---

## Figma reference frames (64) — `docs/design/Untitled/`

The Figma export (2026-09-01) contains 64 built reference screens at 390×844. They are the
**visual source of truth** for the MD sections listed. Render PNGs: `renders/<id>.png`
(`:`→`-`); node data: `nodes/Page-1.json`; mined tokens: `extracted-tokens.json`. Not a 1:1
map to the 522 — they're the style-defining subset; the rest inherit from them + §01 system.

| Figma frame (id) | MD § / screens it defines the look for |
|---|---|
| `splash-screen` 3:12, `onboarding` 3:30 | §02 / 1–3 |
| `login-sign-up` 3:56, `social-auth` 15:215 | §02 / 4–5, 13 |
| `phone-verification` 15:24, `otp-entry` 15:58, `otp-verification` 104:12 | §02 / 6, 8–9 |
| `forgot-password` 15:97, `reset-password` 15:128, `account-recovery` 15:247 | §02 / 10–14 |
| `select-role` 15:171 | §02 / 15–16 |
| `session-notification` 15:291, `account-suspended` 15:331 | §02 / 17–20 |
| `home-discover` 3:90, `personalized-home` 15:557 | §03 / 21–22 |
| `categories-browse` 3:179 | §03 / 23–25 |
| `trending-products` 15:637, `new-arrivals` 15:721, `flash-deals` 15:815, `grandprice-deals` 15:869 | §03 / 26–31 |
| `nearby-vendors` 15:934 | §03 / 33–34 + Maps (Nearby Vendors) |
| `recently-viewed` 15:992, `wishlist-screen` 104:117 | §03 / 35–36, §05 / 76 |
| `featured-vendors` 15:1069, `seller-store` 3:1117 | §03 / 37, §05 / 70–71 |
| `marketplace-promotions` 15:1119 | §03 / 39–40, §20 |
| `search-results` 3:1044, `product-feed` 104:1571 | §04 / 41–52 |
| `product-detail` 3:249, `reviews-screen` 104:193 | §05 / 60–80 |
| `cart-screen` 3:657, `empty-cart-state` 104:1650 | §06 / 81–87 |
| `checkout-screen` 3:738, `payment-methods` 104:1854 | §06 / 88–103, §19 / 344–345 |
| `orders-screen` 3:809 | §07 / 104–123 |
| `delivery-tracking` 104:278 | §08 / 124–151 (+ Maps: Live Delivery Map) |
| `inverse-auction-hub` 3:300, `auction-detail` 3:363 | §17 / 291–296 |
| `ticket-purchase` 3:407 | §17 / 297–302, §18 / 322–325 |
| `auction-eligibility` 104:1797, `referral-share` 104:520 | §18 / 326–338 |
| `draw-stages` 104:345, `winner-screen` 104:413, `runner-up-screen` 104:1909, `winnings-claim` 104:464 | §17 / 307–318 |
| `terms-auction-rules` 104:1479 | §17 / 295, 320 |
| `wallet-screen` 3:890, `transaction-history` 104:1978 | §19 / 339–356 |
| `coupons-promotions` 104:1094 | §20 / 357–368 |
| `chat-screen` 3:1189 | §21 / 369–382 |
| `notifications-screen` 3:1240 | §22 / 383–394 |
| `profile-screen` 3:961, `settings-screen` 104:1154 | §23 / 395–415 |
| `kyc-identity` 104:53 | §24 / 416–423, §09 / 158–167 |
| `help-disputes` 104:1236 | §27 / 487–502 |
| `create-listing` 104:664, `edit-listing` 104:729 | §25 / 449–461 |
| `seller-inventory` 104:785, `seller-orders` 104:863, `seller-analytics` 104:945 | §25 / 440–469 |
| `product-boosting` 104:1027 | §26 / 470–486 |
| `loading-skeleton` 104:1696, `error-state` 104:1751 | §28 / 503–522 |
| `image` 16:2 | asset frame — ignore |

**Gaps** (in MD, absent from Figma — design fresh from §01 + nearest frame): all of Courier
(§09–§16, `courier-*`), Vendor onboarding (§25 / 435–439), Delivery-customer detail states
(§08 beyond tracking), all **Maps screens** (§ own list in `03-DESIGN-SYSTEM.md`), most §28
states, tablet variants (§30).

**Discrepancies to honour the export on:** brand is orange `#FF6200` (not indigo); bottom nav
shows 4 items not the MD's 5 (nav is dynamic anyway); GrandPrice is an **Inverse Draw**
platform, not classic auction (see `02-DATA-MODEL.md` Domain 7).
