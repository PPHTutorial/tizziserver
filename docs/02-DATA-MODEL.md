# GRANDPRICE — DATA MODEL (Prisma v7, schema v2)

Redesign of `prisma/schema.prisma` (currently 452 lines, gas-only) into a domain-partitioned
schema for the full ecosystem. This is the **entity outline** — field lists are the intended
shape, not final DDL. Aligns with MD §33 "Data-Model Awareness" and the per-section screen needs.

Conventions: `id` = cuid2 · `createdAt`/`updatedAt` everywhere · soft-delete `deletedAt` on
user-owned aggregates only · money = integer minor units + `currency` (never `Float`) · geo =
PostGIS `geography` via `Unsupported(...)` + raw helpers · enums SCREAMING_SNAKE ·
append-only tables have no `updatedAt`.

Prisma v7 setup:
```prisma
generator client {
  provider = "prisma-client"          // new generator, no rust engine
  output   = "../generated/client"
  runtime  = "nodejs"
  moduleFormat = "esm"
}
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
  extensions = [postgis]
}
```

---

## Domain 0 — Platform & configuration

| Model | Key fields | Notes |
|---|---|---|
| `Platform` | slug, name, defaultCurrency, supportedRegions[], theme(Json), status | `grandprice`, `tizzi-gas`, future. |
| `FeatureFlag` | key @unique, description, valueType(BOOL/NUMBER/JSON) | Registry of capability keys. |
| `PlatformFeature` | platformId, flagKey, value(Json) | `@@unique([platformId, flagKey])` |
| `RoleFeature` | role, flagKey, value(Json) | `@@unique([role, flagKey])` |
| `UserFeatureOverride` | userId, flagKey, value(Json), reason, expiresAt | A/B, comps, targeted disable. |
| `RegionRule` | regionCode, flagKey, value(Json) | Legal gating (auctions per region). |
| `AppConfig` | key @unique, value(Json), scope(GLOBAL/PLATFORM), platformId? | Replaces the string-only `AppConfig`. |
| `PricingRule` | scope(DELIVERY/SERVICE_FEE/BOOST/…), platformId?, regionCode?, vehicleType?, params(Json), activeFrom/To | Distance/time/surge/vehicle tables; no hardcoded fees. |
| `FeeSchedule` | party(VENDOR/COURIER), kind(COMMISSION/PAYOUT/…), params(Json), platformId? | Platform take-rates. |
| `IdempotencyKey` | key @unique, principalId, route, requestHash, responseSnapshot(Json), expiresAt | Replay-safe writes. |
| `OutboxEvent` | type, aggregateType, aggregateId, payload(Json), createdAt, dispatchedAt? | Transactional outbox; append-only. |
| `Webhook` / `WebhookDelivery` | url, secret, events[], … / status, attempts, responseCode | Outbound integrations. |
| `AuditLog` | actorId?, actorType(USER/SYSTEM/ADMIN), action, targetType, targetId, before(Json), after(Json), ip, ua, at | Append-only. |
| `Region` / `Currency` / `ExchangeRate` | standard | Multi-currency (MD §23 items 411–412). |

---

## Domain 1 — Identity & access

| Model | Key fields | Notes |
|---|---|---|
| `User` | phone @unique, email? @unique, firstName?, lastName?, avatar?, status, locale, timezone, lastLoginAt | **No `role` column** — roles are relational now. Keep `phone` primary. |
| `UserRole` | userId, role(CUSTOMER/VENDOR/COURIER/STAFF/ADMIN), status(PENDING/ACTIVE/SUSPENDED/DISABLED), kycStatus, activatedAt | `@@unique([userId, role])`. One person, many roles (MD §02 items 15–16). |
| `Credential` | userId, kind(PASSWORD/PIN/TOTP/RECOVERY), secretHash, params(Json) | argon2id; `@@unique([userId, kind])` except RECOVERY (many). |
| `Session` | userId, deviceId, refreshHash, userAgent, ip, lastUsedAt, expiresAt, rotatedFromId?, revokedAt?, revokeReason? | Rotating refresh, reuse-detection family revoke. |
| `Device` | userId, deviceId @unique, platform(IOS/ANDROID/WEB), model, pushToken?, appVersion, trusted, lastSeenAt | Per-device push + trust. |
| `SocialIdentity` | userId, provider(GOOGLE/APPLE/FACEBOOK), providerUserId, email? | `@@unique([provider, providerUserId])` |
| `Otp` | target(phone/email), channel, codeHash, purpose(LOGIN/VERIFY/RESET/PIN_RESET), attempts, consumedAt, expiresAt | Replaces `OTP` + `EmailVerification`. |
| `LoginActivity` | userId, deviceId?, ip, ua, geo?, result(SUCCESS/FAILED/BLOCKED), at | Security center (MD §24 items 425). |
| `TokenEpoch` | userId, ver | Bump ⇒ invalidate all access tokens. |

Drop NextAuth's `Account` / `VerificationToken` (custom auth now). `Session` is repurposed.

---

## Domain 2 — Profiles

| Model | Key fields | Notes |
|---|---|---|
| `CustomerProfile` | userId @unique, defaultAddressId?, marketingOptIn | Thin. |
| `Address` | userId, label, recipientName, phone, line1, line2?, city, region, country, postalCode?, location(geography Point), isDefault, kind(HOME/WORK/OTHER) | MD §23 items 397–400; used by checkout + delivery. |
| `SavedLocation` | userId, name, location, address? | Map favourites. |
| `VendorProfile` | userId @unique, businessId, displayName, bio?, logo?, banner?, status, verifiedAt?, ratingAvg, ratingCount, platformIds[] | |
| `Business` | vendorId @unique, legalName, regNumber?, taxId?, category, phones[], email?, website?, address, location(geography Point) | MD §25 items 437. |
| `BusinessDocument` | businessId, type, fileKey, status, reviewedById?, note? | Business KYC (MD §25 item 439). |
| `PayoutAccount` | ownerType(VENDOR/COURIER), ownerId, method(BANK/MOMO), details(Json, tokenized), verified, isDefault | Withdrawals. |
| `CourierProfile` | userId @unique, status, onlineStatus(OFFLINE/ONLINE/ON_JOB), lastLocation(geography Point), lastLocationAt, ratingAvg, ratingCount, completedDeliveries, acceptanceRate, cancellationRate, level(Json), activeVehicleId? | MD §09–§16. |
| `CourierAvailability` | courierId, dayOfWeek, startTime, endTime, enabled | Schedule (MD §11 item 188). |
| `CourierShift` | courierId, startedAt, endedAt?, onlineSeconds, deliveries, earningsMinor | Working sessions. |
| `CourierVehicle` | courierId, type(BICYCLE/MOTORBIKE/CAR/VAN/TRUCK/OTHER), make?, model?, color?, plate?, year?, photos[], status(PENDING/APPROVED/REJECTED), capacity(Json) | MD §10; configurable types. |
| `CourierVehicleDocument` | vehicleId, type(REGISTRATION/INSURANCE/…), fileKey, status, expiresAt? | |
| `CourierServiceArea` | courierId, name, area(geography Polygon), radiusM?, enabled | MD §11 items 189–192. |

---

## Domain 3 — Catalog

| Model | Key fields | Notes |
|---|---|---|
| `Category` | parentId?, slug, name, icon, path(ltree/materialized), platformIds[], sortOrder | Tree (MD §03 items 23–24). |
| `Product` | vendorId(owner), title, slug, description, brand?, condition(NEW/USED/REFURB), categoryId, attributes(Json), status(DRAFT/PUBLISHED/…), platformIds[], premiumAssetId? | Base product owned by the creating vendor. |
| `ProductMedia` | productId, kind(IMAGE/VIDEO), fileKey, alt?, sortOrder | MD §05 items 61–63. |
| `ProductVariant` | productId, sku @unique, name, options(Json), priceMinor, compareAtMinor?, barcode? | MD §05 item 68. |
| `Inventory` | variantId, vendorId, quantity, reserved, restockAt?, lowStockThreshold | Reserved on checkout hold. |
| `VendorOffer` | productId, vendorId, priceMinor, currency, condition, fulfilment(Json), status | Multi-vendor: same product, several sellers. (`@@unique([productId, vendorId])`) |
| `PriceHistory` | offerId, priceMinor, at | Analytics + "price drop". |
| `ProductQuestion` / `ProductAnswer` | productId, userId, body / answeredById | MD §05 item 67. |
| `Wishlist` / `WishlistItem` | userId / productId | MD §05 item 76. |
| `SavedItem` | userId, offerId, source(CART_SAVE_LATER) | MD §06 item 87. |
| `RecentlyViewed` | userId, productId, at | MD §03 item 35. |
| `GasCylinderListing` | offerId @unique, cylinderType, weightKg, capacityL, requiresExchange, deposit Minor | **Tizzi Gas specifics live here**, not on `Order`. |

Search: Postgres `tsvector` GIN on `Product(title, description, brand)` + trigram; nearby via
`VendorProfile.location` / `Business.location` PostGIS.

---

## Domain 4 — Cart, orders, fulfilment

`Order` becomes generic; gas fields removed. **Order and Delivery are separate** (MD §07 note).

| Model | Key fields | Notes |
|---|---|---|
| `Cart` | userId, platformId, currency, couponId?, updatedAt | One active cart per (user, platform). |
| `CartItem` | cartId, offerId, variantId, qty, unitPriceMinor(snapshot), vendorId | Grouped by vendor in UI (MD §06 items 84–85). |
| `Coupon` | code @unique, type(PERCENT/FIXED/FREE_DELIVERY), value, scope(Json: vendor/category/platform), minSpendMinor, maxRedemptions, perUserLimit, startsAt, endsAt, status | MD §20; backend-configured. |
| `CouponRedemption` | couponId, userId, orderId, amountMinor, at | Enforces limits. |
| `Order` | number @unique, customerId, platformId, status(PLACED/CONFIRMED/PARTIALLY_FULFILLED/FULFILLED/CANCELLED/REFUNDED), currency, itemsSubtotalMinor, discountMinor, couponMinor, deliveryFeeMinor, serviceFeeMinor, taxMinor, totalMinor, addressId, placedAt | Aggregate across vendors. Fee breakdown mirrors MD §06. |
| `VendorOrder` | orderId, vendorId, number, status(NEW/ACCEPTED/PREPARING/READY_FOR_PICKUP/HANDED_OVER/COMPLETED/CANCELLED), subtotalMinor, commissionMinor, payoutMinor | Per-vendor sub-order (MD §07 item 110, §25 items 442–447). |
| `OrderItem` | vendorOrderId, offerId, variantId, qty, unitPriceMinor, totalMinor, fulfilmentId? | |
| `Fulfilment` | vendorOrderId, method(DELIVERY/PICKUP/VENDOR_LOGISTICS), status, deliveryId?, pickupCode?, readyAt?, completedAt? | Bridge to Domain 5. |
| `OrderEvent` | orderId, type, actorType, actorId?, data(Json), at | Timeline (MD §07 item 112); append-only. |
| `Return` / `Exchange` | vendorOrderId, items(Json), reason, status, resolution | MD §07 items 114–115. |
| `Refund` | orderId, vendorOrderId?, amountMinor, reason, status(REQUESTED/APPROVED/PROCESSING/DONE/REJECTED), paymentRef?, walletTxnId? | MD §07 items 116–117, §19 items 347–348. |
| `Invoice` | orderId @unique, number, pdfKey?, issuedAt, lines(Json) | MD §07 items 121–122. |
| `OrderIssue` | orderId, category, body, status | MD §07 items 118–119 (distinct from formal `Dispute`). |

---

## Domain 5 — Delivery & courier operations

Independent of `Order`. A `Delivery` can be spawned by a `Fulfilment`, an auction `PrizeClaim`,
or an ad-hoc request.

| Model | Key fields | Notes |
|---|---|---|
| `DeliveryZone` | platformId?, regionCode, name, area(geography Polygon), status | Serviceable areas (MD §11). |
| `Delivery` | code @unique, sourceType(FULFILMENT/AUCTION/ADHOC), sourceId, status(see state machine), pickupPoint(geography Point), pickupAddress(Json), dropoffPoint, dropoffAddress(Json), distanceM, durationS, feeMinor, currency, courierId?, vehicleType, scheduledFor?, createdAt | Customer-visible tracking (MD §08). |
| `DeliveryItem` | deliveryId, description, qty, photoKey?, valueMinor?, fragile | What's being carried (MD §12 item 203). |
| `DeliveryJob` | deliveryId @unique, state(OPEN/OFFERING/ASSIGNED/EXPIRED/CANCELLED), payoutMinor, pickupAreaLabel, dropoffAreaLabel, distanceM, durationS, requirements(Json), expiresAt | The courier marketplace listing (MD §12). Pre-acceptance: **area labels only, no PII**. |
| `DeliveryOffer` | jobId, courierId, sentAt, respondedAt?, response(ACCEPTED/DECLINED/TIMEOUT), declineReason? | Per-courier dispatch attempt; dispatch engine iterates ranked couriers. |
| `DeliveryEvent` | deliveryId, type, actorType, actorId?, location?(geography Point), data(Json), at | State-machine log; append-only; drives the customer timeline + ops feed. |
| `DeliveryLocation` | deliveryId, courierId, point(geography Point), heading?, speed?, accuracy?, at | Breadcrumb track (throttled writes); replay + disputes. |
| `PickupVerification` | deliveryId @unique, method(OTP/QR/PHOTO/VENDOR_CONFIRM), otpHash?, verifiedAt, packageCount?, conditionNote?, photoKeys[] | MD §13 items 217–225. |
| `DeliveryVerification` | deliveryId @unique, method(OTP/QR/SIGNATURE/PHOTO), otpHash?, signatureKey?, photoKeys[], recipientName?, verifiedAt | MD §08 items 141–144, §13 items 230–236. |
| `ProofOfDelivery` | deliveryId @unique, photoKeys[], notes?, geo(geography Point), at | |
| `DeliveryRating` | deliveryId, byUserId, role(CUSTOMER/COURIER), stars, tags[], comment? | MD §08 item 130. |
| `DeliveryDispute` | deliveryId, openedById, category, body, evidence(Json), status, resolution? | MD §08 items 150, §27 item 495. |
| `CourierEarning` | courierId, deliveryId?, kind(DELIVERY/BONUS/TIP/ADJUSTMENT/FEE), grossMinor, deductionMinor, netMinor, at | MD §14 items 243–252; ties into ledger. |

### Delivery state machine (`Delivery.status`)

```
REQUESTED → SEARCHING_COURIER → COURIER_ASSIGNED → COURIER_EN_ROUTE_PICKUP
→ ARRIVED_PICKUP → PICKED_UP → EN_ROUTE_DROPOFF → ARRIVED_DROPOFF
→ DELIVERED → (COMPLETED)
        | branches: FAILED_RECIPIENT_UNAVAILABLE · REASSIGNING · RESCHEDULED
        ↘ CANCELLED_BY_CUSTOMER · CANCELLED_BY_COURIER · CANCELLED_BY_SYSTEM
```
Every transition writes a `DeliveryEvent` + `OutboxEvent` (⇒ push + `/tracking` broadcast).

---

## Domain 6 — Wallet, payments, settlements (double-entry)

| Model | Key fields | Notes |
|---|---|---|
| `LedgerAccount` | ownerType(USER/VENDOR/COURIER/PLATFORM/GATEWAY/ESCROW), ownerId?, currency, kind(WALLET/PAYABLE/RECEIVABLE/REVENUE/ESCROW), balanceMinor(cached projection) | Chart of accounts. |
| `LedgerEntry` | txnId, accountId, direction(DEBIT/CREDIT), amountMinor, at | Append-only. Sum(debits)=Sum(credits) per `txnId`. |
| `LedgerTxn` | id, type(TOPUP/ORDER_CAPTURE/PAYOUT/REFUND/FEE/TIP/ADJUSTMENT/HOLD/RELEASE), reference(Json), memo, at | Groups entries. |
| `Wallet` | userId, currency, ledgerAccountId @unique, pinRequired | Projection view over its account. |
| `WalletTransaction` | walletId, ledgerTxnId, directionLabel, amountMinor, balanceAfterMinor, description, meta(Json) | Human-readable feed (MD §19 item 341). |
| `PaymentIntent` | userId, purpose(ORDER/WALLET_TOPUP/TICKET/CAMPAIGN), amountMinor, currency, status, gateway, gatewayRef, clientSecret?, idempotencyKey | MD §06 items 98–102. |
| `Payment` | intentId, status, capturedMinor, feeMinor, gatewayResponse(Json), processedAt | |
| `PaymentMethod` | userId, gateway, token, brand, last4, expMonth, expYear, isDefault | Tokenized (MD §06 item 99, §19 items 344–345). |
| `Payout` | ownerType, ownerId, amountMinor, payoutAccountId, status(PENDING/PROCESSING/PAID/FAILED), gatewayRef, ledgerTxnId | Vendor/courier withdrawals (MD §14 items 256–262, §25 item 467). |
| `Withdrawal` | = customer-initiated `Payout` request wrapper, requires `requirePin()` | MD §14, §19 item 343. |
| `Settlement` | party(VENDOR/COURIER), periodStart, periodEnd, grossMinor, commissionMinor, adjustmentsMinor, netMinor, payoutId?, status | Platform ↔ party reconciliation. |
| `TransactionPin` | → `Credential(kind=PIN)` | MD §19 item 355. |

Flow example (**multi-vendor order paid by card**): `PaymentIntent` → gateway capture →
`LedgerTxn(ORDER_CAPTURE)`: DEBIT gateway-clearing, CREDIT escrow. On each `VendorOrder`
COMPLETED: `LedgerTxn(RELEASE)` DEBIT escrow, CREDIT vendor-payable (minus commission →
platform-revenue). Courier `netMinor` similarly. Payout drains vendor/courier-payable.

---

## Domain 7 — Inverse Draws, tickets, qualification  *(GrandPrice-only — gated `auction=false` for Tizzi Gas)*

MD §17–§18. Every `auctions/*` handler requires `requireCapability('auction')` **and**
`RegionRule` clearance. The `auctions` module slug is kept for routing; the product concept is
an **Inverse Draw** (confirmed by the Figma export: `inverse-auction-hub`, `auction-detail`,
`ticket-purchase`, `draw-stages`, `winner-screen`, `runner-up-screen`, `winnings-claim`).

**Inverse Draw model:** a premium item is offered with a fixed number of **seats/tickets** at a
`ticketPrice`. Buyers hold seats; when the pool sells out (or the timer ends with enough sold),
an auditable **Draw** picks a winner who may purchase the item at a low **`winTarget`** price
(retail value shown struck-through). Non-winning seat-holders' stake is handled per `rules`
(refund / credit / discount voucher). If the draw **fails to fill**, every seat is refunded to
wallet (`AuctionRefund.reason = UNSOLD_DRAW`). A plain **retail purchase** of the same item
coexists (`VendorOffer`), so the PDP shows dual CTAs "Join Draw • $X" / "Buy Retail".
Qualification (§18) only re-weights the draw — **never guarantees** selection.

| Model | Key fields | Notes |
|---|---|---|
| `Auction` (inverse draw) | slug, title, type(SEAT_DRAW\|PREMIUM_ASSET), status(DRAFT/ANNOUNCED/OPEN/FILLING/CLOSING/DRAW_PENDING/DRAWING/COMPLETED/UNSOLD/CANCELLED), offerId?/productId?, retailValueMinor, ticketPriceMinor, winTargetMinor, seatsTotal, seatsSold(projection), minSeatsToDraw, drawTrigger(SOLD_OUT\|SCHEDULED\|EITHER), opensAt, closesAt, drawAt, nonWinnerPolicy(REFUND\|CREDIT\|VOUCHER), rules(Json), platformId | Money in minor units. `seatsSold` projected from `AuctionTicket`. |
| `PremiumAsset` | auctionId?, productId?, title, media[], specs(Json), retailValueMinor | MD §17 items 293–294, §03 item 32 (`premium-assets`). |
| `TicketPackage` | auctionId?, name, ticketCount, priceMinor, bonusTickets | MD §18 items 323–325 (`ticket-purchase`). |
| `AuctionTicket` (seat) | auctionId, userId, packageId?, serial @unique, seatNo?, source(PURCHASE/BONUS/REFERRAL/ENGAGEMENT), paymentIntentId?, status(ACTIVE/DRAWN/WON/REFUNDED/VOID), acquiredAt | One row per seat held. |
| `TicketWallet` | userId, auctionId, activeCount(projection) | MD §18 item 322. |
| `AuctionParticipant` | auctionId, userId, ticketCount, qualificationScore, rank?, eligible(Bool), joinedAt | `@@unique([auctionId, userId])`. |
| `QualificationRule` | auctionId, factor(TICKETS/ENGAGEMENT/SHARE/REFERRAL), weight, params(Json) | Backend-configured weighting. |
| `QualificationEvent` | participantId, factor, points, ref(Json), at | Append-only; recompute score. |
| `Draw` | auctionId @unique, method(VRF/COMMIT_REVEAL), seedCommitHash, seedReveal?, algorithmVersion, startedAt, completedAt, resultHash | **Auditable RNG**; publishable proof. |
| `DrawEntry` | drawId, participantId, weight, rangeStart, rangeEnd | Weighted selection window (weighting ≠ guarantee — MD §18 note). |
| `Winner` | drawId, participantId, position(PRIMARY), assetId?, status(PENDING_CLAIM/CLAIMED/FORFEITED) | MD §17 items 311–312. |
| `BackupWinner` | drawId, participantId, order | MD §17 item 313. |
| `PrizeClaim` | winnerId @unique, status(OPEN/VERIFYING/APPROVED/FULFILLING/DELIVERED/REJECTED), kycCaseId?, deliveryId? | Reuses Domain 5 for shipping (MD §17 items 314–317). |
| `PrizeFulfilment` | claimId, method(DELIVERY/PICKUP/DIGITAL/PAYOUT), ref(Json), completedAt? | |
| `AuctionRefund` | auctionId, userId, ticketIds[], amountMinor, reason(UNSOLD_DRAW\|NON_WINNER\|CANCELLED\|DISPUTE), status, walletTxnId? | MD §17 item 319; drives "Wallet Refund (Unsold Draw)" in the wallet feed. |
| `WinTargetPurchase` | winnerId @unique, amountMinor(=winTarget), paymentIntentId, status, orderId? | The winner's discounted buy; spawns an `Order` + `Delivery`. |
| `AuctionDispute` | auctionId, userId, body, evidence(Json), status | MD §17 item 321, §27 item 498. |

UI/data must **never** represent qualification or seat-holding as guaranteed winning — enforced
by naming (`qualificationScore`, `weight`, `eligible`, `seatsSold`) and by keeping `Winner`
strictly a `Draw` output. `terms-auction-rules` screen (export) surfaces the legal terms.

---

## Domain 8 — Coupons, promotions, advertising

| Model | Key fields | Notes |
|---|---|---|
| `Promotion` | name, kind(FLASH_DEAL/CAMPAIGN/BANNER), scope(Json), startsAt, endsAt, assets(Json), platformIds[] | MD §03 items 30–31, 39–40. |
| `Campaign` | vendorId, objective, status, budgetMinor, spentMinor, startsAt, endsAt, targeting(Json) | MD §26. |
| `Advertisement` | campaignId, offerId/productId, creative(Json), placement(HOME/SEARCH/CATEGORY/PDP) | Sponsored/boosted cards (MD §05 card types). |
| `BoostTier` | key, name, multiplier, priceModel(Json), perks(Json), platformId?, active | **Backend-configurable** (MD §26 explicit). No hardcoded Premium/Platinum/Featured. |
| `Boost` | offerId/productId, tierKey, campaignId?, startsAt, endsAt, status | |
| `AdEvent` | adId, type(IMPRESSION/CLICK/CONVERSION), userId?, at, context(Json) | Analytics (MD §26 items 484–485); append-only, roll-up in worker. |
| `ReferralProgram` / `Referral` | code, rewardRules(Json) / referrerId, refereeId, status, rewardMinor | MD §20 item 367, §23 item 407. |

---

## Domain 9 — Communication & notifications

| Model | Key fields | Notes |
|---|---|---|
| `Conversation` | kind(CUSTOMER_VENDOR/CUSTOMER_COURIER/SUPPORT), subjectType?, subjectId?, status, lastMessageAt | MD §21. |
| `ConversationParticipant` | conversationId, userId, role, lastReadAt, muted | |
| `Message` | conversationId, senderId, kind(TEXT/IMAGE/DOC/VOICE/PRODUCT/ORDER/DELIVERY/SYSTEM), body?, attachments(Json), meta(Json), at | Shareable entities (MD §21 items 375–380); append-only. |
| `MessageReceipt` | messageId, userId, deliveredAt?, readAt? | |
| `Block` | byUserId, targetUserId, at | MD §21 item 382. |
| `Notification` | userId, category(ORDER/PAYMENT/DELIVERY/COURIER/AUCTION/TICKET/COUPON/VENDOR/PROMO/SECURITY), title, body, data(Json), channel(PUSH/IN_APP/EMAIL/SMS), readAt?, sentAt | MD §22 (categories match items 384–393). |
| `NotificationPreference` | userId, category, push, email, sms, inApp | MD §22 item 394, §23 item 413. |
| `NotificationTemplate` | key, channel, locale, subject?, body, variables(Json) | Worker-rendered. |
| `Broadcast` | audience(Json), templateKey, scheduledFor, status | Promotional pushes. |

---

## Domain 10 — Trust, safety, KYC, support

| Model | Key fields | Notes |
|---|---|---|
| `KycCase` | subjectType(USER/COURIER/VENDOR), subjectId, level(BASIC/FULL), status(DRAFT/SUBMITTED/IN_REVIEW/APPROVED/REJECTED/RESUBMIT), provider?, providerRef?, reviewerId?, decisionNote?, decidedAt | Unified across roles (MD §09 items 158–167, §24, §25 item 439). |
| `KycDocument` | kycCaseId, type(ID_FRONT/ID_BACK/SELFIE/PROOF_ADDRESS/BUSINESS_REG/…), fileKey, ocr(Json), status | MD §09 items 159–162, §24 items 418–420. |
| `LivenessCheck` | kycCaseId, provider, score, passed, ref | Selfie verification. |
| `Report` | reporterId, targetType(USER/PRODUCT/VENDOR/COURIER/CONVERSATION/ORDER), targetId, category, body, evidence(Json), status | Polymorphic (MD §24 items 430–433, §05 item 75). |
| `Dispute` | kind(ORDER/PAYMENT/DELIVERY/VENDOR/COURIER/AUCTION), refId, openedById, againstId?, status(OPEN/EVIDENCE/UNDER_REVIEW/RESOLVED/APPEALED/CLOSED), resolution(Json), slaDueAt | Base for MD §27 items 493–498. |
| `DisputeEvidence` | disputeId, byUserId, kind(TEXT/IMAGE/DOC), fileKey?, body?, at | MD §27 item 499; append-only. |
| `DisputeMessage` | disputeId, senderId, body, at | |
| `Appeal` | disputeId @unique, byUserId, body, status, decidedAt | MD §27 item 502. |
| `SupportTicket` | userId, category, subject, body, priority, status, assigneeId?, conversationId? | MD §27 items 490–492. |
| `SafetyAction` | actorId(admin), targetType, targetId, action(WARN/RESTRICT/SUSPEND/BAN/CLEAR), reason, expiresAt? | Feeds `UserRole.status`. |

---

## Migration from the gas schema

The live gas DB is small and pre-production, so **schema v2 is a fresh baseline**, not an
in-place morph.

1. **New baseline migration** creates schema v2 + enables `postgis`.
2. **Seed** (`packages/db/seed`): `Platform('grandprice')`, `Platform('tizzi-gas')`; the
   `FeatureFlag` registry + `PlatformFeature` rows (auction/advertising OFF for gas); a `Gas`
   `Category` subtree; `PricingRule` rows for gas delivery; `FeeSchedule` defaults.
3. **Data-carry script** (only if prod rows exist): old `User` → `User` + `UserRole` +
   `CustomerProfile`/`VendorProfile`/`CourierProfile`; old `Vendor` → `VendorProfile` +
   `Business` + a `VendorOffer` + `GasCylinderListing` per `pricePerKg`; old `Order` → `Order`
   + `VendorOrder` + `OrderItem` + `Fulfilment(method=DELIVERY)` + a `Delivery` reconstructed
   from `customerLat/Lng` + `vendorLat/Lng` + `OrderTimeline` → `OrderEvent`/`DeliveryEvent`;
   old `Review` (already polymorphic) maps directly.
4. **Old-RPC compat shim** (`apps/api/app/api/_compat`) keeps the current Tizzi Gas client
   working: translates `auth.send-otp`, `vendor.nearby`, `order.create`, etc. to v2 use-cases
   until the gas app adopts the generated client. Removed at end of Phase 3.
5. Delete `prisma-erd-generator` output, `next.svg`/`vercel.svg` and other starter cruft during
   Phase 0 cleanup.

## Indexing & integrity highlights

- Geo: GiST on every `geography` column.
- Hot lookups: `Delivery(courierId,status)`, `DeliveryJob(state,expiresAt)`,
  `VendorOrder(vendorId,status)`, `Order(customerId,placedAt)`, `Notification(userId,readAt)`,
  `LedgerEntry(accountId,at)`, `AuctionTicket(auctionId,userId)`.
- Uniqueness: `UserRole(userId,role)`, `VendorOffer(productId,vendorId)`,
  `CouponRedemption` composite for per-user limits, `AuctionParticipant(auctionId,userId)`.
- All money columns `Int`/`BigInt` minor units + `currency`; a CI lint forbids `Float` on
  money-named fields.
- Append-only tables (`*Event`, `LedgerEntry`, `AuditLog`, `AdEvent`, `DisputeEvidence`,
  `QualificationEvent`) have no `updatedAt` and no delete path in `core`.
