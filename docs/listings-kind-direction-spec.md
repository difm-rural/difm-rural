# Listings (Services + Resources) — V1 Design & Changes

**Goal:** offer resources (grazing, hire, lease, for-sale, storage) in v1 by generalising the existing **Services** feature into **Listings**, via two new fields: `kind` and `direction`. Reuses the current `services` table, create flow, pricing model, and cards — no new marketplace.

Companion: **Service Pricing Model — Spec** (resource pricing maps onto it). Grounded in `services` / `bookings` schema, `CreateServiceScreen` (5-step), `ServiceDetailScreen`, `ServiceListCard` / `JobServiceCard`.

---

## 1. Core idea

A resource offering ("8ha grazing available", "trailer for hire", "120 bales for sale") is a **standing listing with pricing + location that others browse and enquire on** — i.e. it's *service-shaped, not job-shaped*. So we don't build a third process; we add a discriminator to Services.

- **User-facing name is "Listings"** (renamed from Services). **Keep the DB table named `services`** — renaming the table touches every query for no functional gain; a full internal rename is optional pre-launch cleanup only.
- **`kind`** = what's being listed. **`direction`** = offering it vs wanting it.

## 2. The `kind` set

| kind | Covers | Transaction | Typical pricing |
|---|---|---|---|
| `service` | Labour offered (existing) | Booking (unchanged) | hourly / fixed / day_rate / per_unit / quote |
| `grazing` | Grazing & agistment | **Enquiry → connect** | per_unit ($/head/week or $/ha/season) |
| `hire` | Dry gear hire (trailer, yards, crush, post-driver) | Booking (+ bond) | day_rate |
| `lease` | Paddock / land / shed / **storage** space | **Enquiry → connect** | per_unit ($/wk, /month) or fixed (season) |
| `for_sale` | Surplus hay, feed, sundries | **Enquiry → "I'll take it"** | per_unit ($/bale) |

Notes:
- **Storage folds into `lease`** (space for a duration); distinguished by category, not a separate kind.
- Five kinds keeps it granular enough to drive category, pricing defaults, and lifecycle without proliferating.

## 3. The `direction` field

`offering` (default) vs `wanted`.

- **offering** — "I have X" (grazing available, trailer for hire, hay for sale).
- **wanted** — "I need X" (grazing wanted, storage wanted). The classifieds pattern rural users already know.
- Available on all kinds, default `offering`. Most relevant for `grazing` and `lease`.
- **Wrinkle:** a `wanted` listing has no rate to advertise. So `wanted` **skips the price step**; offer an optional free-text budget ("willing to pay ~$X / open to offers"), mirroring the job "open to offers" model.

## 4. Lifecycle per kind

Reuse what exists; add light close states rather than a new engine.

- **`service`, `hire`** → existing **bookings** lifecycle (`pending → confirmed → … → completed`). `hire` adds a bond as a pricing add-on and uses `scheduled_date` for the hire period. Listing stays active (re-hireable).
- **`for_sale`, `grazing`, `lease`** → **enquiry-only**, no booking state machine. Enquire → connect → arrange privately. Owner marks the listing closed.
- **Close states:** add nullable `close_reason` (`sold` / `taken` / `filled` / `expired`) + `closed_at`. Closed listings show a badge (SOLD / TAKEN) and drop out of active browse. `is_active` stays for pause/unpublish.

## 5. Enquiry vs booking

The enquiry-only kinds need a lightweight "connect" that is **not** a full booking (avoid polluting `bookings` with `total_amount` / completion semantics for a hay sale).

- **Decision needed:** reuse the existing chat/connections layer (an enquiry = start a conversation/connection referencing the listing) **vs** a minimal new `enquiries` table (`listing_id, from_id, to_id, message, status, created_at`).
- **Recommendation:** reuse the existing messaging/connection layer for v1 (lighter build; you already have `service_booking_quote_and_chat`), with the listing id attached to the thread. Add the `enquiries` table only if you need separate tracking/metrics.

## 6. Categories

Resource kinds need their own category set (the existing 12 are labour-oriented). Make category options **kind-dependent** (`LISTING_CATEGORIES[kind]`):

- `grazing` → Grazing, Agistment, Winter grazing, Dairy support
- `hire` → Machinery, Trailers, Yards & handling, Implements
- `lease` → Paddock/land, Shed/building, Storage
- `for_sale` → Hay & baleage, Feed & supplement, Livestock sundries, General

## 7. Create-listing flow changes

Mostly conditional rendering + per-kind defaults over the existing 5-step wizard (`Service · Details · Price · Location · Review`), plus a new front step.

- **New Step 0 — "What are you listing?"** pick `kind` (Offer a service / Grazing / Gear for hire / Space to lease / Something for sale) and, where relevant, `direction` (I have this / I'm looking for this).
- **Step labels adapt** per kind ("Service" → "Listing").
- **Price step** pre-selects sensible defaults per kind (grazing → per_unit "per head/week"; hire → day_rate; for_sale → per_unit "per bale"; lease → per_unit "per week"). `wanted` → skip, optional budget field.
- **Location step** — same field, helper text becomes "where the {grazing/gear/item} is" (the owner's place). The existing two-tier location privacy (coarse public, exact on connect) applies unchanged.
- **Review** adapts copy per kind.
- The AI "draft from photo" path already exists for services — later it could seed for_sale/hire drafts too (not v1-critical).

## 8. Display / browse

- **Cards** (`ServiceListCard` / `JobServiceCard`): add a **kind badge** and a **Wanted** tag when `direction = wanted`; a **SOLD/TAKEN** badge when closed.
- **Browse:** filter by kind; an offering/wanted toggle. Resources live in the Services surface (renamed Listings/Marketplace — copy decision).
- **Headline** pricing reuses the pricing-spec logic ("from $X", "+extras").

## 9. Schema changes (additive)

```sql
alter table public.services
  add column kind text not null default 'service'
    check (kind in ('service','grazing','hire','lease','for_sale')),
  add column direction text not null default 'offering'
    check (direction in ('offering','wanted')),
  add column close_reason text
    check (close_reason in ('sold','taken','filled','expired')),
  add column closed_at timestamptz;

-- wanted / quote listings have no rate: relax NOT NULL
alter table public.services
  alter column rate drop not null;
```

- `pricing_type` enum already covers resources (`per_unit`, `day_rate`, `fixed`, `quote_required`) — **no change**.
- `minimum_units` already present — used for min purchase / min hire (Pricing Tier 1).
- Existing rows default to `kind='service'`, `direction='offering'` — unchanged behaviour.

## 10. Dependency on the pricing work

Resource v1 leans on the pricing spec:
- **Tier 1** (`minimum_units` exposed, `day_rate` in UI) — needed for hire + min-purchase.
- **Tier 2** (add-ons + terms) — bond, delivery/cartage, pickup-vs-delivered, lease terms.
So land **Pricing Tier 1 + 2 with (or just before) the resource kinds.** Variants (Tier 3) are *not* required for resources.

## 11. Build tasks (add to checklist)

- [ ] Schema: add `kind`, `direction`, `close_reason`, `closed_at`; drop `rate` NOT NULL.
- [ ] `LISTING_CATEGORIES` keyed by kind + a kind/category picker.
- [ ] Create-flow Step 0 (kind + direction) and per-kind defaults / conditional price step.
- [ ] Enquiry-only path (reuse chat/connections) for `for_sale` / `grazing` / `lease`.
- [ ] Close states + SOLD/TAKEN badges; drop closed listings from active browse.
- [ ] Card kind badge + Wanted tag; browse filters (kind, offering/wanted).
- [ ] Per-kind copy in create + detail + review.
- [ ] **Rename user-facing "Services" → "Listings"** (nav, screen titles, copy). DB table stays `services`.
- [ ] Confirm Pricing Tier 1 + 2 landed first.

## 12. Decisions (LOCKED)

1. **Kinds in v1:** ✅ **all five** (`service`, `grazing`, `hire`, `lease`, `for_sale`).
2. **Enquiry:** ✅ **reuse the existing chat/connections layer** (no new `enquiries` table for v1).
3. **`wanted`:** ✅ **enabled on all kinds** (default `offering`).
4. **Rename:** ✅ **user-facing "Services" → "Listings" now.** Keep the DB table named `services` (conceptual rename only; a full code/table rename is optional pre-launch cleanup, not required).
5. **Storage:** ✅ **a `lease` category**, not its own kind.
6. **Bookings:** ✅ **`for_sale` / `grazing` / `lease` bypass bookings entirely** (enquiry-only). `service` + `hire` keep the bookings lifecycle.
