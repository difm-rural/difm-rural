# Service Pricing Model — Spec

**App:** Rural Connections · **Scope:** provider-side listing pricing (create flow + schema)
**Status:** draft for review · **Owner:** Paul
**Companion docs:** *Listings — V1 Design & Changes* (kind/direction; resources are in v1), *Build & Launch Checklist*.

---

## 1. The problem in one line

The **jobs + bids** path can already express complex rural pricing (a bid is built from free-form line items). The **listings** path (services + the new resource kinds) can't — one `pricing_type`, one `rate`, one `unit_label`. So the listings that need real pricing (baling, digger hire, water carting, grazing) collapse into "quote required" and lose the at-a-glance rate that makes a directory worth using.

**This spec fixes the listings side only.** It does not touch the requester's job budget, which stays deliberately simple.

## 2. Principles

1. **Depth belongs on the provider side.** A requester posting a job shouldn't need to know rural pricing conventions — `fixed` vs `open to offers` is right for them and stays unchanged.
2. **Reuse the pattern we already built.** A bid is priced with *lines*. A listing should be priced with *lines* too — we're porting a proven pattern to one more screen, not inventing a pricing engine.
3. **A headline rate must survive.** List cards need a scannable "$X/bale" or "from $X". Whatever structure we add underneath, we always derive a headline for the card.
4. **Structure the common 80%, free-text the rest.** Minimums, add-ons and variants are structured. Genuinely odd terms (fuel policy, barter) go in a plain terms field rather than bending the schema.

## 3. What already exists (grounding)

Current `services` table (verified) — pricing-relevant columns:
- `pricing_type` — `hourly` | `fixed` | `per_unit` | `day_rate` | `quote_required` **(note: `day_rate` is already a valid value in the schema check constraint)**
- `rate` — numeric (currently NOT NULL; **being relaxed to nullable** for `wanted`/quote listings — see Listings spec)
- `unit_label` — free text ("load", "bale", "metre")
- `minimum_units` — numeric, default 1, `> 0` — **column exists but the create screen forces it to 1** (not user-editable)
- `travel_range_km` — how far the provider will travel
- `includes_equipment` (bool), `payment_timing` (`upfront`/`on_completion`), plus a materials field (added by migration)

Current bid record (the pattern to reuse):
- `line_items` — array of `{ label, amount }`, add as many as you like; sums to a total

**Correction worth carrying:** `day_rate` is NOT missing from the schema — it's the **create screen** that normalises it into `fixed`. So "supporting day-rate" is a UI change, not a schema change.

## 4. The model

A listing's pricing = **one or more rate lines** + **zero or more add-on lines** + **terms**.

### 4.1 Rate lines (variants)

Each rate line is one way the provider charges. Most listings have one; some (baling, grazing) have several under a single listing.

| Field | Values / notes |
|---|---|
| `label` | Optional if only one line. Required once there are 2+ ("Round baleage", "Small square") |
| `pricing_type` | `fixed` \| `hourly` \| `day_rate` \| `per_unit` \| `quote` |
| `rate` | Number. Omitted when `quote` (or a `wanted` listing) |
| `unit_label` | Free text, only when `per_unit` ("bale", "metre", "10,000L load", "head", "head/week") |
| `min_units` | Optional. Minimum quantity ("250 bales", "4 hours") |
| `min_charge` | Optional. Minimum dollar figure, whichever the provider thinks in |

`day_rate` becomes selectable in the UI (already schema-valid). `min_units` unhardcodes the existing column.

### 4.2 Add-on lines

Optional extra charges layered on top of the rate. Mirrors bid `line_items`, but each carries a **basis** so it can scale.

| Field | Values / notes |
|---|---|
| `label` | "Delivery", "Call-out", "Float / cartage", "Bond", "Chemical" |
| `basis` | `flat` \| `per_unit` \| `per_km` |
| `amount` | Number |
| `optional` | Boolean — can the requester decline it? (pickup instead of delivery ⇒ optional delivery) |

`per_km` lets "distance surcharge beyond travel range" be structured rather than buried in text. A hire **bond** is a `flat` add-on.

### 4.3 Terms

- `pricing_terms` — free text. The catch-all for conditions that shouldn't be schema: **fuel policy** ("returned with full tank, else refuel at cost"), **pickup vs delivered**, deposit rules, **lease term**, weather-dependence, cancellation.

### 4.4 Headline (derived, for list cards)

Never entered by the provider — computed on save so `JobServiceCard` / `ServiceListCard` stay fast:
- 1 rate line → existing style ("$150/hr", "$12/bale")
- 2+ rate lines → **"from $X"** (cheapest line)
- any add-ons → append a **"+extras"** marker
- Keep denormalised `pricing_type` / `rate` / `unit_label` on the record, auto-set from the primary (cheapest, or provider-flagged) line for backwards-compatibility.

## 5. Schema changes

Additive — nothing removed, so existing listings keep working.

```
pricing_variants   jsonb   -- [{ label, pricing_type, rate, unit_label, min_units, min_charge }]
pricing_add_ons    jsonb   -- [{ label, basis, amount, optional }]
pricing_terms      text
-- keep & use: minimum_units (stop hardcoding), travel_range_km
-- keep denormalised headline: pricing_type, rate, unit_label (auto-derived)
-- rate: relaxed to nullable (shared change with Listings spec — wanted/quote listings)
```

Migration for existing rows: wrap the current single rate into a one-element `pricing_variants`; leave add-ons/terms empty. Old listings render identically.

## 6. Create-listing flow (pricing step)

Replaces the single pricing question with a short sequence. Each stage after the first is skippable, so the simple case stays one tap.

1. **Base rate** — pick basis (fixed / hourly / day / per unit / quote). If per unit, enter the unit. Enter the rate.
2. **Minimum?** (optional) — "Is there a minimum?" → min quantity *or* min charge. (Solves min-250-bales, min-4-hours.)
3. **More rate options?** (optional) — add another rate line with a label. (Solves round vs square vs baleage in one listing.)
4. **Extra charges?** (optional) — add-on lines: label + amount + basis + optional-flag. (Solves delivery, float, call-out, bond, chemical.)
5. **Terms** (optional) — free text with smart placeholder prompts ("fuel policy? pickup or delivered? deposit? lease term?").
6. **Review** — render the exact price card the requester will see, breakdown expanded.

Per-kind defaults feed this step (see Listings spec §7): grazing → per_unit "per head/week"; hire → day_rate; for_sale → per_unit "per bale"; lease → per_unit "per week". A `wanted` listing skips the price step entirely (optional budget field instead).

## 7. Worked examples

These now map onto Listing **kinds** (see Listings spec).

**Digger hire** — `kind: hire`
- Rate line A: `day_rate`, $900/day
- Rate line B: `hourly`, $150/hr, `min_units` 4
- Add-on: "Float / cartage", `flat`, $120, optional=false
- Terms: "Returned with full tank, or refuelling at cost."
- Card headline: *from $150/hr · +extras*

**Contract hay baling** — `kind: service`
- Rate line A: `per_unit`, $14/bale, unit "round baleage", `min_units` 250
- Rate line B: `per_unit`, $9/bale, unit "small square", `min_units` 250
- Add-on: "Cartage", `per_km`, $2.50, optional=true
- Terms: "Booking secures a slot; weather-dependent."
- Card headline: *from $9/bale (min 250) · +extras*

**Water carting** — `kind: service`
- Rate line: `per_unit`, $180/load, unit "10,000L load"
- Add-on: "Distance beyond 20km", `per_km`, $3, optional=false
- Card headline: *$180/load · +extras*

**Grazing available** — `kind: grazing`, `direction: offering`
- Rate line: `per_unit`, $8/head/week (or a second line $/ha/season)
- Terms: "Good fences and water; min 4-week term."
- Enquiry-only (no booking). Card headline: *$8/head/week*

**Fencing** — *steer to jobs + bids, not a listing.* Scope varies too much for a fixed rate; the bid line-items already handle "400m labour + 3 strainers + 1 gate". If listed, use `per_unit` $/metre base with per-strainer / per-gate add-ons and expect most to still go `quote`.

## 8. Effort tiers (build order)

**Tier 1 — near-free, NO migration (do first)** — *scope locked: `min_units` + `day_rate` only.*
- Expose `minimum_units` (stop hardcoding to `1`). Column already there — no migration.
- **Surface `day_rate` in the create UI** (already schema-valid; stop normalising it into `fixed`).
- *Covers: minimum quantity, machinery day-rate. Biggest value-per-hour. `min_charge` is NOT in Tier 1 — see Tier 2.*

**Tier 2 — medium**
- `pricing_add_ons` + the "extra charges" step.
- `pricing_terms` + the terms step.
- **`min_charge`** — deferred from Tier 1; rides this migration (a minimum-dollar figure alongside `minimum_units`).
- *Covers: delivery/float/call-out/bond, fuel & pickup conditions, lease terms, minimum charge.*

**Tier 3 — deeper (candidate fast-follow, not required for resources)**
- `pricing_variants` (multiple rate lines) + the "more rate options" step + "from $X" headline logic.
- *Covers: round vs square vs baleage in one listing. Only item needing real UI + display thought.*

> **Dependency:** the v1 resource kinds (Listings spec) need **Tier 1 + Tier 2** landed first (day_rate, minimums, bond/delivery add-ons, terms). Tier 3 is **not** required for resources.

## 9. Decisions to make (for the beach)

1. **Variants in v1, or fast-follow?** Tier 1+2 alone already rescue most listings. Variants are the cleanest thing to defer if time is tight — a provider can list twice in the meantime.
2. ✅ **RESOLVED — `min_units` vs `min_charge`:** support **both, but staged**. `min_units` ships in **Tier 1** (column exists, no migration). `min_charge` moves to **Tier 2**, riding the `pricing_add_ons`/`pricing_terms` migration.
3. **Add-on bases — how many?** `flat` + `per_km` cover most. Is `per_unit` worth the extra UI, or fold into terms for v1?
4. **Do add-ons compute a requester estimate, or just display?** Proposal: **display only** for v1; a live "estimated total" is a later enhancement.
5. **Barter / non-cash ("pay in baleage")** — proposal: **out of structured scope.** Use `quote` + terms. Don't bend the schema for the long tail.
6. **When to nudge provider → "quote required"?** Fencing-type variable scope. Maybe a gentle hint in the flow rather than a hard rule.

## 10. Out of scope (deliberately)

- Requester-side job budget (stays `fixed` / `open`).
- Payments / money movement — still not being built.

*(Previously listed here: the resource/hire shape. That is now **in v1** as Listing `kind`s — grazing, hire, lease, for_sale, storage-under-lease — and its pricing is covered by this spec. See the Listings — V1 Design & Changes spec.)*
