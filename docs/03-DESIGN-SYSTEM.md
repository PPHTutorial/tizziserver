# GRANDPRICE — MOBILE DESIGN SYSTEM

Derived from `GrandPrice — Mobile Figma Screen Expansion Specification` §01/§29–§32 **and
reconciled against the 64-frame Figma export** (`docs/design/Untitled/`, 2026-09-01). This
document is the design system of record; it compiles to code via `packages/tokens` (Style
Dictionary → `tokens.dart` ThemeExtension, `tokens.ts`, `tokens.css`).

> **B1 resolved** by the Figma export. Brand = **orange `#FF6200`** on a **warm cream `#FAF9F6`**
> canvas with **warm-black `#111111`** ink; fonts **Outfit + Inter**. All values below are
> measured, not seeds. Remaining B1 note: no *dark theme* exists in the Figma file — the dark
> columns here are our derivation and need a review pass.

---

## 1. Design language (non-negotiable, from MD + confirmed by export)

- **Flat Design 2.0.** Subtle depth via soft shadows and layering, *not* gradients or skeuomorphism. No decorative borders — separation comes from surface color + spacing. (Export uses only ~8 gradient nodes, all on hero/wallet/CTA surfaces.)
- **Premium two-tone.** Dominant **orange `#FF6200`** + **warm-black `#111111`** on **cream `#FAF9F6`**. Orange is reserved for primary CTAs, active nav, selection state, prices/tickets, progress, and links. Everything else is warm neutral. No secondary accent hue (gold `#FFB800` appears only for star ratings).
- **Generous whitespace, rounded cards, strong product imagery, clear hierarchy.**
- **Font Awesome icons only** (`font_awesome_flutter`). No Material, Cupertino, custom SVG packs, or emoji icons — anywhere.
- **Responsive typography** with dynamic scaling. No fixed, device-dependent font sizes or hardcoded dimensions. Everything proportional / constraint-based.
- **Light + dark** for every applicable component.
- **Adapts** to small phone → large phone → foldable → small tablet → large tablet (MD §30).

> **Source of truth:** extracted from the 64-frame Figma export (2026-09-01) via
> `scripts/figma-extract-tokens.mjs` → `docs/design/Untitled/extracted-tokens.json`, cross-read
> against `docs/design/Untitled/renders/*.png`. Values below are the *real* system, not seeds.
> The file has **no published Styles/Variables** — everything was inline; `packages/tokens`
> becomes the first formal token definition. Design device = **390×844** (iPhone 13/14).
> Dark theme is **not in the Figma file** — the dark column is our derivation, to be reviewed.

## 2. Color tokens

### 2.1 Primitives (measured — usage counts in `extracted-tokens.json`)

| Ramp | Values (light) | Notes |
|---|---|---|
| **brand** (orange) | `50 #FFF4EC` · `100 #FFF0E6` · `200 #FFE1C7` · `400 #FF8A3D` · `500 #FF6200` · `600 #E5560A` · `700 #C61F00` | `#FF6200` is THE brand color (219 uses). `#FFF0E6`/`#FFEFE6` = brand tint containers. |
| **brand.gradient** | `#FF5C00 → #C61F00` (linear, ~135°); alt `#FF6200 → #FFA100` | Hero draw banner, wallet card, some primary CTAs. Used sparingly (≤8 nodes) — respects "no excessive gradients". |
| **ink** (warm near-black) | `hi #111111` · `900 #121212` | Headings, primary text, some icons/strokes (656 uses). |
| **neutral** (warm gray) | `bg #FAF9F6` · `100 #F2F0EC` · `200 #EFECE8` · `300 #E9E7E2` · `text.low #8E8E93` · `text.med #555555` | **Warm**, not cool. `#EFECE8` = default border (364 uses). `#8E8E93` = placeholder/muted, `#555555` = secondary text. |
| **success** | `500 #00B050` · `container #E6F7ED` | Prices, "Win for" target, VERIFIED, positive deltas. |
| **gold** | `500 #FFB800` · `600 #B38600` · `container #FFF9E6` | Star ratings, some auction accents/borders. |
| **error** | `500 #FF3B30` · `container #FFECEB` | Destructive, failed states. |
| **overlay.on-brand** | `#FFFFFF` @ 20% / 82% (`#FFFFFF30` / `#FFFFFFD0`) | Text/progress-track on orange surfaces. |

### 2.2 Semantic tokens (what components reference)

| Token | Light | Dark (derived — review) |
|---|---|---|
| `color.bg` | `#FAF9F6` | `#141210` |
| `color.surface` | `#FFFFFF` | `#1E1B18` |
| `color.surface.sunken` | `#F2F0EC` | `#141210` |
| `color.surface.brand` | brand gradient (`#FF5C00→#C61F00`) | same |
| `color.border` | `#EFECE8` | `#332F2B` |
| `color.border.strong` | `#8E8E93` | `#5A554F` |
| `color.overlay` | `rgba(17,17,17,.45)` | `rgba(0,0,0,.6)` |
| `color.text.hi` | `#111111` | `#F7F5F2` |
| `color.text.med` | `#555555` | `#B7B2AC` |
| `color.text.low` | `#8E8E93` | `#7C776F` |
| `color.primary` | `#FF6200` | `#FF7A26` |
| `color.on.primary` | `#FFFFFF` | `#FFFFFF` |
| `color.primary.container` | `#FFF0E6` | `#3A2113` |
| `color.on.primary.container` | `#C61F00` | `#FFB894` |
| `color.success` / `.container` | `#00B050` / `#E6F7ED` | `#33C06F` / `#12301F` |
| `color.rating` (gold) | `#FFB800` | `#FFC633` |
| `color.error` / `.container` | `#FF3B30` / `#FFECEB` | `#FF6B62` / `#3A1512` |
| `color.price` | `#00B050` (retail) · `#111111` (neutral) · `#C61F00` (draw/ticket) | analogous |
| `color.skeleton` | `#EFECE8`→`#E9E7E2` shimmer | `#26221F`→`#302B27` |

Status color mapping:
- **Delivery**: `searching` gold · `assigned/en-route` brand · `arrived` brand.700 · `delivered/completed` success · `failed/cancelled` error.
- **Inverse Draw**: `open/live` brand · `filling` brand + progress · `closing-soon` gold · `drawing` brand pulse · `won` success · `unsold/refunded` text.low · `runner-up` gold.

## 3. Typography

Two families (both must be bundled + declared in `pubspec.yaml`; no runtime fetch):
- **Outfit** — display, headings, screen titles, section headers, prices, big numbers, badges. Weights **600 / 700 / 800**.
- **Inter** — body, labels, buttons, chips, tabs, captions, metadata, form text. Weights **400 / 600 / 700**.
- Icons: **Font Awesome 6** (`font_awesome_flutter`) — solid + regular + brands. Nothing else.

Line-height ≈ **1.25×** size throughout the file. **No letter-spacing, no uppercase** anywhere
(all `textCase: ORIGINAL`) — do not add tracking/caps.

Responsive rule: role sizes are logical units, scaled by `clamp(0.9, MediaQuery.textScaler, 1.3)`
and a device-class multiplier (`compact 0.96 · medium 1.0 · expanded 1.05 · large 1.1`).
**No hardcoded `fontSize`/`FontWeight` in widgets** — only `context.type.<role>` (CI-enforced).

| Role | Family / Weight | Size (measured) | Line | Use |
|---|---|---|---|---|
| `display` | Outfit 800 | 34 | 1.2 | Wallet balance, countdowns, winner amount |
| `headline` | Outfit 800 | 24 | 1.25 | Screen titles ("Welcome Back", "Checkout") |
| `title.lg` | Outfit 800 | 20 | 1.25 | Section headers ("Featured Premium Items") |
| `title.md` | Outfit 700 | 16 | 1.25 | Card titles, product/asset names |
| `title.sm` | Outfit 600 | 15 | 1.27 | List item titles, dialog titles |
| `price` | Outfit 800 | 20 / 24 | 1.2 | Prices, ticket price, win target (tabular) |
| `label.lg` | Inter 700 | 14 | 1.2 | Primary buttons, active tabs |
| `label` | Inter 700 | 13 | 1.23 | Buttons, chips, badges (92 uses — most common style) |
| `label.sm` | Inter 600–700 | 11–12 | 1.2 | Badge text, nav labels, eyebrow ("LIVE INVERSE DRAW") |
| `body.lg` | Inter 400 | 14 | 1.25–1.4 | Primary body, descriptions |
| `body.md` | Inter 400 | 13 | 1.25 | Secondary body, addresses |
| `caption` | Inter 400 | 11–12 | 1.2 | Timestamps, helper text, "(82)" counts |
| `caption.xs` | Inter 400 | 10 | 1.2 | Dense metadata |

Numerics (prices, balances, counts, percentages, countdowns): **Outfit**, tabular figures.

## 4. Spacing, radius, elevation, motion

**Spacing scale** (`space.*`, measured): `2 · 4 · 6 · 8 · 10 · 12 · 14 · 16 · 20 · 24 · 32 · 40`.
2-step increments at the low end (6, 10, 14 are real). Dominant: **8 / 12 / 16 / 24**.
Screen gutter = `16` (phone) / `24` (expanded+). Card inner padding = `16`. Section gap = `24`.
List-row gap = `12`. Chip/inline gap = `8`.

**Radius** (`radius.*`, measured): `xs 4 · sm 6 · md 10 · lg 12 · xl 16 · 2xl 20 · 3xl 26 · pill 999`.
- Buttons / primary CTAs → **pill** (fully rounded).
- Cards, callout boxes → **xl (16)** (workhorse, 201 uses) or **2xl (20)**.
- Inputs, small tiles, chips-as-tab → **md–lg (10–12)**.
- Bottom-sheet top corners → **`20 20 0 0`** (also seen `4 4 0 0` on some headers).
- Active-nav icon button → **xl (16)** rounded square.
- Avatars / status pills → **3xl (26)** or pill.

**Elevation** (`elevation.*`, measured — very soft, Flat 2.0):
| Level | Shadow | Use |
|---|---|---|
| `0` | none | flush elements, chips |
| `1` | `0 4 12 rgba(0,0,0,.04)` | cards, tiles, inputs |
| `2` | `0 8 16 rgba(0,0,0,.03)` + `0 4 8 rgba(0,0,0,.02)` | raised menus, floating circular buttons |
| `nav` | `0 -8 16 rgba(0,0,0,.03)` | bottom navigation bar |
| `brand-glow` | `0 8 16 rgba(255,98,0,.16)` (also `.25`) | primary CTA, active nav badge, live-draw card |
| `sheet` | `0 12 24 rgba(0,0,0,.06)` (upper `0 -8` variant for top-anchored) | bottom sheets, dialogs |

Dark theme: drop alphas ~40%, add a `color.border` hairline; keep `brand-glow` (raise to ~.22).

**Motion** (`motion.*`): durations `fast 120ms · base 200ms · slow 320ms · sheet 280ms`;
easing `standard cubic-bezier(.2,0,0,1)`, accel `cubic-bezier(.3,0,1,1)`.
Progress bars animate `base`; countdowns tick without animation; map camera follow = `slow`.
Reduce-motion respected.

## 5. Component inventory

Each maps to a Flutter widget in `packages/design` (or `mobile/lib/design/`), themed from
tokens, `--test`ed as a widget test. From MD §01 + §29.

**Primitives** — `GpButton` (primary/secondary/tonal/ghost/destructive · sizes sm/md/lg ·
loading/disabled · leading/trailing FA icon), `GpIconButton`, `GpChip` (filter/choice/input),
`GpBadge` (count/status/dot), `GpTag`, `GpAvatar` (user/vendor/courier · fallback initials ·
status ring), `GpRating` (stars + count, read/interactive), `GpDivider`, `GpSkeleton`,
`GpShimmer`.

**Inputs** — `GpTextField` (with prefix/suffix FA, error, counter), `GpSearchBar` (idle/active/
voice/visual triggers), `GpDropdown`, `GpSegmentedControl`, `GpStepper` (quantity selector),
`GpOtpField` (4/6 cells), `GpPinPad`, `GpSlider` (price range), `GpDatePicker`, `GpTimePicker`,
`GpToggle`, `GpCheckbox`, `GpRadioGroup`.

**Navigation** — `GpBottomNav` (role-driven from `config/bootstrap`), `GpTopAppBar`
(large/small/search variants), `GpTabs`, `GpBackBar`, `GpNavRail` (tablet).

**Surfaces** — `GpCard`, `GpListTile`, `GpSection` (header + action), `GpBottomSheet`
(drag handle, scrim, snap points), `GpDialog` (confirm/destructive/info), `GpActionSheet`,
`GpSnackbar`, `GpToast`, `GpBanner` (inline info/warning).

**Commerce cards** (MD §05 card types) — `GpProductCard` variants: standard · sponsored ·
boosted · discounted · auction · premium-asset · out-of-stock · verified-vendor ·
delivery-available · free/discounted-delivery. `GpAuctionCard`, `GpVendorCard`, `GpCourierCard`,
`GpDeliveryStatusCard`, `GpOrderStatusCard`, `GpCouponCard`, `GpTicketCard`.

**Delivery/map** — `GpDeliveryStatusIndicator` (stepper: searching→assigned→pickup→transit→
delivered), `GpCourierMiniCard` (masked info pre-arrival), `GpMapView` (wraps
`google_maps_flutter`), `GpMapMarker` (FA glyph pins: vendor/courier/pickup/dropoff/me),
`GpRoutePolyline`, `GpEtaPill`, `GpMapBottomSheet`, `GpLocationPicker`, `GpServiceAreaEditor`
(polygon draw/edit), `GpQrScanner`, `GpQrDisplay`, `GpSignaturePad`.

**Feedback/states** (MD §28) — `GpEmptyState`, `GpErrorState`, `GpOfflineState`,
`GpPermissionPrimer` (location/camera/notifications), `GpMaintenanceState`, `GpLoading`
(spinner/skeleton), `GpConfirmationState`, `GpSuccessState`, `GpFailureState`. Each takes an FA
illustration glyph, title, body, primary/secondary action.

**Money** — `GpMoney` (tabular, currency-aware), `GpAmountBreakdown` (subtotal/discount/coupon/
delivery/service/tax/total — MD §06), `GpEarningsBreakdown` (gross/deductions/adjustments/net/
available/pending — MD §14).

## 6. Layout & responsiveness (MD §30)

Device classes by shortest-side width: `compact <360 · medium 360–599 · expanded 600–839 ·
large ≥840`. Rules:
- Product grid columns: `2 / 2 / 3 / 4`. Grids use `SliverGrid` with proportional aspect.
- `expanded`+: two-pane where MD calls for it — PDP (gallery ∥ info), delivery tracking
  (map ∥ details), courier dashboard (job list ∥ map), vendor dashboard (panels), auction
  (asset gallery ∥ auction info). Implement via a `GpTwoPane` that collapses to stacked below
  `expanded`.
- Safe areas, notches, foldable hinge (`MediaQuery.displayFeatures`) respected.
- Bottom nav → `GpNavRail` on `large`.
- Never scale a phone layout by stretching; switch layout composition.

## 7. Maps screens to design (NOT in MD/Figma — we own these)

| Screen | Contents |
|---|---|
| **Map Discovery / Nearby Vendors** | Full-screen `GpMapView`, clustered vendor pins, "search this area", filter chips, bottom sheet vendor list synced to viewport (MD §03 items 33–34). |
| **Live Delivery Map (customer)** | Courier pin moving in real time, route polyline pickup→me, `GpEtaPill`, `GpCourierMiniCard` (masked), contact/call/message actions, status stepper. Tablet: map ∥ details. (MD §08 items 132–135) |
| **Courier — Navigate to Pickup** | Map with route to vendor, turn hint banner, "Arrived" CTA, job summary sheet, masked customer area only. |
| **Courier — Navigate to Drop-off** | Route to customer, full address revealed on "Start delivery", "Arrived" CTA, delivery-verification entry. |
| **Courier Jobs Map** | Available `DeliveryJob` pins around courier, payout labels, tap → job details sheet, accept/decline. (MD §12) |
| **Service-Area Editor** | Draw/edit polygon(s) on map, radius mode, multiple named areas, enable toggles. (MD §11 items 189–192) |
| **Address Location Picker** | Draggable center pin + reverse-geocoded address, search box (Places), "use current location", label + recipient fields. (MD §06 items 90–92, §23 items 397–399) |
| **Permission primers** | Pre-permission explainer sheets for location (foreground + background for couriers), camera (KYC/QR), notifications. (MD §28 items 511–513) |

Marker glyphs use Font Awesome: `store`, `motorcycle`/`car`/`truck`/`bicycle`, `box`
(pickup), `location-dot` (dropoff), `circle` (me). Courier marker rotates to `heading`.

## 8. Token pipeline

```
packages/tokens/
├── tokens/
│   ├── color.json      primitives + semantic (light/dark sets)
│   ├── typography.json  roles, weights, scaling rule
│   ├── space.json  radius.json  elevation.json  motion.json
│   └── $themes.json     light / dark
├── build.mjs            Style Dictionary config
└── dist/
    ├── tokens.dart      → ThemeExtension `GpTokens` + `GpTheme.light/dark`
    ├── tokens.ts        → typed object for admin/marketing
    └── tokens.css       → CSS custom properties
```
Flutter consumes `GpTokens` via `Theme.of(context).extension<GpTokens>()`. A CI check fails the
build if a `mobile/` widget hardcodes a hex color or a raw `fontSize`.

## 9. Patterns observed in the 64-frame export (build to these)

- **Screen chrome.** Cream `#FAF9F6` background, no full-bleed app bar. Title is `headline`
  (Outfit 800) inline at top-left; a circular white back button (`elevation.2`, radius pill,
  FA `chevron-left`) sits to its left. Right side: circular white icon button(s)
  (cart / share). Content scrolls under; no elevation on the header itself.
- **Primary button** (`GpButton.primary`): full-width or dual, **pill** radius, `#FF6200` fill,
  `label.lg` white, height ~56, `brand-glow` shadow. Label often carries the amount:
  `Place Order • $12,550`, `Join Draw • $50`, `Buy Ticket ($50)`.
- **Secondary button** (`GpButton.outline`): white fill, `#EFECE8`→ sometimes `#111111` 1px
  border, pill, `label.lg` ink. Used beside primary as a dual CTA (`Buy Retail`, `Withdraw`).
- **Selection card** (radio/choice): white card, radius `lg`; **selected** = `#FF6200` 1.5px
  border + filled `#FF6200` circle (right side); unselected = `#EFECE8` border + hollow ring.
  Two-option choices render as side-by-side cards (Standard | Express).
- **Callout box** (draw-active, info): tinted `#FFF0E6` fill + `#FF6200` border, radius `xl`,
  orange `label` heading, `body` in ink, optional progress bar.
- **Progress bar**: track `#EFECE8` (or white @20% on orange surfaces), fill `#FF6200` (white on
  orange surfaces), height ~6, radius pill; `%` label in `label` orange to the right.
- **Cards**: white, radius `xl (16)`, `elevation.1`, inner padding `16`. Product/asset image
  radius `md–lg`, aspect ~1:1 (grid) or 16:10 (feature). Rating = FA `star` gold + `4.9`
  ink + `(82)` in `text.low`.
- **Badges/pills**: `label.sm`; status pill uses tinted container + matching text
  (`Auction Entry` green on `#E6F7ED`; `2d 14h Left` orange on `#FFF0E6`; `VERIFIED` green).
- **Bottom nav** (`GpBottomNav`): white bar, `nav` shadow, 4–5 items; inactive = FA line glyph
  `text.low`; **active = `#FF6200` rounded-square (radius `xl`) with white glyph**, no label
  shift. Item set comes from `config/bootstrap` `nav` (MD §32 lists 5 for customer; the export
  shows 4 — treat count as dynamic).
- **Wallet / hero card**: brand gradient fill, radius `2xl`, white text, `display` balance,
  translucent-white inset action buttons; below it a row of white stat cards
  (`GpEarningsBreakdown`-style).
- **Auth screens**: no card — fields sit directly on cream; field label in `label` ink above a
  white pill input (`elevation.1`); full-width primary pill; `— or connect with —` hairline
  divider; white social buttons with FA brand glyphs in ink; T&C `caption` footer.
- **Transaction / list row**: leading tinted square icon (`radius md`, category color),
  title `title.sm` + timestamp `caption`, trailing amount `price` (ink for debit, `#00B050`
  with `+` for credit).
