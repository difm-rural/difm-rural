# Rural Connections — Build & Launch Checklist

Working tracker for the pre-launch push. Tick items as you go (`- [x]`).
Companion docs: **Service Pricing Model — Spec** (the pricing detail) and the **Scenario Audit** tool (the evidence behind these priorities).

**Suggested order:** lock remaining decisions → Pricing Tier 1 → Tier 2 → Listings/resources (§4, needs Tier 1+2) → launch prep (parallel from now). Tier 3 (variants) optional, not required for resources.

---

## 0. Decisions to lock first

These gate the build — resolve before or while starting the code.

- [ ] **Variants in v1, or fast-follow?** (Tiers 1+2 rescue most services; variants are the clean thing to defer.) → gates Tier 3 below.
- [x] **`min_units` vs `min_charge` — support both, or one?** → **Tier 1 does `min_units` only (no migration; column already exists). `min_charge` deferred to Tier 2**, where it rides the `pricing_add_ons`/`pricing_terms` migration.
- [ ] **Add-on bases — how many?** `flat` + `per_km` cover most; is `per_unit` worth the UI, or fold into terms for v1?
- [ ] **Add-ons: display-only, or live requester estimate?** (Proposed: display-only for v1.)
- [ ] **Barter / non-cash ("pay in baleage") — confirm out of structured scope** (use `quote` + terms).
- [x] **Resource shape (grazing, hire, lease, for-sale, storage) — IN v1** as Listing `kind`s. See *Listings — V1 Design & Changes* spec. (Decisions locked: all five kinds, reuse chat for enquiry, rename Services→Listings, storage under lease, enquiry-only kinds bypass bookings.)
- [ ] **When to nudge a provider → "quote required"** (e.g. variable-scope fencing) — hard rule or gentle hint?

---

## 1. Coding — Pricing Tier 1 (near-free, do first)

Highest value-per-hour. **No migration** — both items use columns/enums that already exist (`minimum_units` column, `day_rate` in the `pricing_type` check). Scope locked: **`min_units` + `day_rate` only** (`min_charge` moved to Tier 2).

- [ ] **Expose `minimum_units`** in create-service (stop hardcoding to `1` on publish).
- [ ] **Promote `day_rate` to a first-class `pricing_type`** (stop folding it into `fixed`).
- [ ] Update service **create/edit UI** to enter minimum + day-rate.
- [ ] Update **list-card headline** logic so day-rate and "min X" render correctly (`JobServiceCard` / `ServiceListCard`).
- [ ] Verify existing listings still render unchanged.

## 2. Coding — Pricing Tier 2 (medium)

- [ ] **Schema:** add `pricing_add_ons jsonb`, `pricing_terms text`, and **`min_charge numeric`** (additive migration; wrap current single rate into existing structure so old rows are untouched).
- [ ] **`min_charge`** (deferred from Tier 1) — minimum-dollar figure alongside the existing `minimum_units`, entered in the pricing step.
- [ ] **Add-on lines** — reuse the bid `line_items` pattern: `{ label, basis, amount, optional }`.
- [ ] **"Extra charges" step** in the create-service flow (delivery / call-out / float / bond / chemical).
- [ ] **Terms field** + step, with smart placeholder prompts (fuel policy, pickup vs delivered, deposit).
- [ ] **Review screen** renders the assembled price card as the requester will see it.
- [ ] Update **list cards** to show a "+extras" marker when add-ons exist.

## 3. Coding — Pricing Tier 3 (variants — only if in v1)

- [ ] **Schema:** add `pricing_variants jsonb` — `[{ label, pricing_type, rate, unit_label, min_units, min_charge }]`.
- [ ] **Multiple rate lines** in create-service ("add another rate option"): round vs square vs baleage in one listing.
- [ ] **Headline logic:** show **"from $X"** (cheapest line) when 2+ variants; keep denormalised `pricing_type`/`rate`/`unit_label` auto-set from the primary line.
- [ ] Migrate existing single rates into a one-element `pricing_variants`.

## 4. Coding — Listings: resources in v1 (kind + direction)

Generalise Services → **Listings**. Full detail in the *Listings — V1 Design & Changes* spec. **Depends on Pricing Tier 1 + 2 landing first.**

- [ ] **Schema:** add `kind` (`service`/`grazing`/`hire`/`lease`/`for_sale`), `direction` (`offering`/`wanted`), `close_reason`, `closed_at`; drop `rate` NOT NULL (wanted/quote listings have no rate).
- [ ] **`LISTING_CATEGORIES` keyed by kind** + kind/category picker (storage lives under `lease`).
- [ ] **Create-flow Step 0** (pick kind + direction) with per-kind pricing defaults; `wanted` skips the price step (optional budget field).
- [ ] **Enquiry-only path via existing chat/connections** for `for_sale`/`grazing`/`lease` (no booking state machine). `service`/`hire` keep bookings.
- [ ] **Close states + SOLD/TAKEN badges**; closed listings drop out of active browse.
- [ ] **Cards:** kind badge + Wanted tag; **browse filters** (kind, offering/wanted).
- [ ] **Rename user-facing "Services" → "Listings"** (nav, titles, copy). DB table stays `services`.
- [ ] Per-kind copy in create + detail + review.

---

## 5. Launch prep (non-code — start now, run in parallel)

- [ ] **Choose the first district** on *winnability*: your presence/credibility, a real community hub (saleyards, farm-supply store, strong local FB group), enough of both farmers and providers to match jobs. Not the biggest.
- [ ] **Recruit 3–5 providers per core category BY HAND, before launch** *(single most important sequencing call — supply first)*. Core categories ≈ general labour, fencing, machinery/digger, spraying, stock work, cartage.
- [ ] **Founding-member framing:** state openly from day one that paid tiers are coming; promise founders a grandfathered discount / extended free.
- [ ] **Community marketing plan** (local FB groups, farm-supply noticeboard, saleyards, word of mouth) over paid ads.
- [ ] Decide the **launch date** — gate it on supply being seeded, not the calendar.

## 6. Instrumentation — liquidity gates

Set these up in the admin funnel so the "switch on fees" and "open next district" gates are measurable.

- [ ] Track **fill rate** (share of jobs getting ≥1 usable bid) — **by category**, not just district average.
- [ ] Track **time-to-first-bid** (target median < 48h).
- [ ] Track **active providers per core category** (target ≥ 3–5).
- [ ] Track **repeat usage** (both sides posting/bidding again within 90 days).
- [ ] Define the **"liquid enough" trigger** (sustained ~4–6 weeks): fill rate ≥ 75% with **no core category below ~60%**, median TTFB < 48h, ≥ 3 providers/core category, healthy repeat rate.

## 7. Monetization switch-on (later, gated by §6)

- [ ] When liquidity trigger holds: **convert founding providers to freemium subscription** (free basic presence; paid pro = extra listings, verified badge, priority placement, wider-area visibility, analytics).
- [ ] Keep **requesters free** — posting a job never gated. Any requester paid feature is optional value-add only.
- [ ] Use district-one subscription revenue to **fund district two's free period** (self-funding rollout).
- [ ] Only **open the next district** once the current one is liquid, low-touch, and starting to convert.

---

## Notes

- **Supabase:** run on **Pro (~$25/mo)** from launch — the free tier auto-pauses after a week's inactivity. At one-district scale you'll sit near the base for a long time; the cost driver as you scale is **image storage + egress** (listing/service photos) and MAU, not the database.
- **Binding constraint is your time**, not hosting cost — size each district's rollout to the support load one person can carry.
