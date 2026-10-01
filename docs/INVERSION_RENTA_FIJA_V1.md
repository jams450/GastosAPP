# Fixed-income investments V1

Planning tool for manually captured Mexican fixed-income offers. Everything the user enters is a
scenario: the application does not infer rates, does not verify commercial conditions, and is not
financial advice.

## Scope

- A product belongs to one user and may have zero or one linked account. Offers can be captured
  without an account and linked later. A linked account must belong to that user, be active,
  non-credit (`!IsCredit`) and interest-bearing (`EarnsInterest`). Account annual interest metadata
  is not used as an offer rate. PostgreSQL permits at most one active linked product per user/account
  (`ux_investment_products_active_account`); multiple unlinked products are permitted.
- Links may be added, removed or changed with the bounded account PATCH. That action never replaces
  offers or tier IDs, preserving confirmations and historical plan snapshots. Full catalog updates
  also preserve offer/tier IDs when normalized offer content is unchanged. A changed offer still
  replaces its tiers and requires confirmations for the new IDs. Linked activation revalidates
  eligibility and occupancy; unlinked activation is allowed for catalog use.
- Products and monthly offer captures are entered by hand. Every offer requires an HTTPS source URL,
  a capture month, validity dates and an explicit marginal tier schedule. No rate is ever seeded,
  prefilled or inferred.
- Generation reads each linked account's `CurrentBalance` at generation time and stores it as the
  allocation amount. It never creates transactions and never modifies balances, credit data, MSI or
  installments.
- The module is admin-only and read-only with respect to money. `Account.CurrentBalance`,
  transactions, `credit_*` and installment allocations are untouched by every investment operation.

## Institution catalog

The institution is a controlled **code**, never free text. Seven codes exist in V1:

| Code | Label |
|---|---|
| `revolut` | Revolut |
| `cetes` | CETES |
| `nu` | Nu |
| `klar` | Klar |
| `finsus` | Finsus |
| `didi` | DiDi |
| `mercado_libre` | Mercado Libre |

The catalog is enforced in four layers that must stay in sync:

| Layer | Location |
|---|---|
| Domain constants + validation | `GastosApp.BusinessLogic/Models/Investments/InvestmentInstitutions.cs` |
| Server normalization | `InvestmentInstitutions.Normalize` (called by create/update) |
| PostgreSQL CHECK | `ck_investment_products_institution` in `SQL/schema.sql` and `SQL/migrations/2026-09-29_fixed_income_investments_v1.sql` |
| Frontend select | `GastosApp.Web/lib/contracts/investment-institutions.ts` |

`Normalize` trims, lowercases and folds spaces/hyphens to underscores, so input such as `Mercado
Libre` or `MERCADO-LIBRE` resolves to `mercado_libre`; anything that does not resolve to one of the
seven codes is rejected with `400`. The stored value is always the canonical lowercase code, and
responses expose both the code (`institution`) and a human-readable `institutionLabel`.

## Offer capture, validity and inferred validity

- `capturedForMonth` is a `yyyy-MM` key and is unique per product.
- `validFrom` is required. `validTo` is **optional**.
- When `validTo` is omitted, the service sets it to **December 31 of the capture year** and persists
  `validity_inferred = true`. When the caller declares a date, `validity_inferred = false`.
- `validTo >= validFrom` is still enforced (`ck_investment_offers_validity`), so an explicit end date
  that precedes the start is rejected.
- The flag is surfaced on offers (`validityInferred`), on allocations and on the projection, so a
  derived end date is always visible to the reader. **No rate is ever inferred**, with or without a
  declared validity end.

Literal condition text is stored as entered, never parsed:

| Field | Level | Limit |
|---|---|---|
| `termsText` | Offer (campaign/promotional wording) | 1000 chars, optional |
| `specialConditionText` | Per tier (e.g. minimum spend) | 1000 chars, optional |

Blank values are normalized to `NULL`.

## Operating month

`InvestmentMonthResolver` (`GastosApp.BusinessLogic/Services/Investments/InvestmentMonthResolver.cs`)
anchors every month decision to **`America/Mexico_City`**, so eligibility and plan ownership do not
depend on the server host timezone:

- `CurrentMonthKey()` → the current operating month as `yyyy-MM`.
- `Normalize(value)` → validates and trims a `yyyy-MM` key (rejects anything else).
- `StartDate(month)` → first calendar day of the month.
- `EndOfCaptureYear(month)` → December 31 of the capture year.

The resolver is deliberately separate from `MonthRangeResolver`: the dashboard resolves a half-open
UTC billing range for an arbitrary timezone, while investments only need the local calendar month.
**Dashboard behavior is not affected.**

## Eligibility and exclusion reasons

For a generation request the service classifies every product of the user. A product is eligible only
when **all** of the following hold:

1. Its institution is in the seven-code catalog.
2. It is active.
3. It has an eligible linked account (same user, active, non-credit, interest-bearing), then at least one offer.
4. An offer exists whose `capturedForMonth` **equals the plan month**. A capture from an earlier month
   is stale and is never promoted to the current month.
5. That offer's validity covers the plan month start (`validFrom <= monthStart && validTo >=
   monthStart`).
6. `conditionsConfirmed` is true on the offer.
7. Its tier schedule is non-empty and valid (canonical marginal schedule).
8. Every tier that declares `specialConditionText` was explicitly confirmed in the request.

Every ineligible product is reported with a machine-readable reason:

| Reason | Meaning |
|---|---|
| `unlinked_account` | No account is linked; catalog-only product, no balance allocation. |
| `missing_account` | The linked account is unavailable. |
| `foreign_account` | The linked account belongs to another user. |
| `inactive_account` | The linked account is inactive. |
| `credit_account` | The linked account is a credit account. |
| `non_interest_account` | The linked account does not earn interest. |
| `inactive_product` | The product is inactive. |
| `unsupported_institution` | The institution is outside the V1 catalog. |
| `no_offer_for_month` | The product has no offers at all. |
| `offer_not_captured_for_month` | Offers exist but none was captured for the plan month. |
| `validity_not_covering_month` | The offer validity does not cover the plan month start. |
| `conditions_not_confirmed` | Offer conditions, or a required per-tier condition, are not confirmed. |
| `invalid_or_missing_tiers` | The marginal tier schedule is missing or invalid. |

Generation **succeeds using the eligible products** and returns the exclusion list; it never fails
because some products are ineligible. `400` is returned only when **zero** products are eligible, and
the error names each product with its reason. Exclusions are persisted on the plan
(`exclusions_json`) and returned by both the plan and the projection endpoints.

The derived draft classifies the catalog with these same rules and this same reason vocabulary (see
[Monthly plan](#monthly-plan-persisted-plan-vs-derived-draft)); the only deferred rule is the per-tier
condition attestation, which a draft cannot hold and therefore reports as `pendingConditions`.

## Per-tier condition confirmation

A tier with `specialConditionText` is only usable when the generation request explicitly attests that
exact tier via `confirmedTierIds`. The service:

- requires the confirmation for **every** tier that declares condition text;
- never infers a confirmation from a previous plan;
- stores both the condition text and the confirmation flag in the allocation tier snapshot
  (`InvestmentTierSnapshot`), so the generated plan explains what was accepted;
- reports the still-missing confirmations as `conditions_not_confirmed` when generating and as
  `pendingConditions` on a draft.

The request boundary mirrors the limits the service enforces, so an obviously invalid payload never
reaches the domain layer: `projectionMonths` carries `[Range(1, 24)]`, and the literal
`termsText`/`specialConditionText` fields carry `[MaxLength(1000)]`. The service stays authoritative
for the institution catalog, the marginal tier schedule and the per-tier attestation.

## Monthly plan: persisted plan vs. derived draft

`GET /api/investments/plans/current?planMonth=YYYY-MM` (month optional, defaults to the operating
month) returns one of two shapes, distinguished by `isPersisted`:

- **Persisted plan** (`isPersisted = true`): the plan row for that month.
- **Derived draft** (`isPersisted = false`): a plan for a month that has not been generated. It is
  **never written to the database** (`investmentPlanId = 0`) and it partitions the catalog with the
  same rules generation applies — the same machine-readable exclusion reasons, and **every** product
  reported either as an allocation or as an exclusion, never absent from both lists:
  - an allocation is a product generation would allocate once the pending conditions are confirmed, so
    a carried product whose offer became stale, unconfirmed, inactive or otherwise ineligible for the
    target month is reported as an exclusion with its real reason instead of being presented as usable;
  - `carriedFromPlanId` and `carriedFromPlanMonth` identify the most recent previous plan, which
    supplies provenance and the projection horizon only;
  - per-allocation `offerFreshness` (always `current` for a draft allocation, because a non-current
    offer is now an exclusion reason);
  - per-allocation `pendingConditions`;
  - `conditionsConfirmed = false` on the allocation tiers, because a draft carries no confirmations and
    they must be reasserted.

When there is no previous plan but products exist, the draft is built from the current catalog. The
endpoint returns `404` **only** when the user has no prior plan **and** no products.

Freshness states (`InvestmentOfferFreshness`):

| State | Meaning |
|---|---|
| `current` | An offer captured for the requested month whose validity covers the month start. The only state a draft allocation can carry. |
| `stale` | Offers exist but were captured in an earlier month, or their validity does not cover the month. A draft reports `offer_not_captured_for_month` or `validity_not_covering_month` instead. |
| `missing` | The product has no offers at all; a draft reports `no_offer_for_month`. |
| `inactive` | The linked product is inactive; a draft reports `inactive_product`. |

The frontend keeps treating any value other than `current` — including an unknown/absent value — as not
generatable, so an unrecognized payload fails closed instead of being read as current.

## Projection

- Horizon is **1–24 months** (`MinProjectionMonths`/`MaxProjectionMonths`; CHECK
  `ck_investment_plans_projection_months` in SQL). Values outside the range are rejected with `400`.
- Tiers are always **marginal**: each rate applies only to the portion of the balance inside its own
  interval, never to the whole balance. For $200,000 with `[0, 25,000)` at 15% and `[25,000, ∞)` at
  7%, the result is $25,000 at 15% plus $175,000 at 7%.
- The series compounds the estimated monthly interest into the next month's balance. Interest is
  rounded to two decimals with `MidpointRounding.AwayFromZero`.
- There is no starting-amount field and no forecast contributions: the projection starts from the
  generated allocation amount (`Account.CurrentBalance` at generation time).
- The projection is computed from the **snapshot** tiers, so editing a catalog offer later does not
  rewrite an already generated plan.
- `GET /api/investments/plans/{id}/projection` returns the monthly series per allocation plus the
  exclusions recorded at generation. `GET /api/investments/plans/{id}` returns the plan detail
  (allocations, tier snapshots, exclusions) and deliberately **no** monthly series.

## API surface

All endpoints are admin-gated (`[Authorize(Policy = "AdminWithId")]`) and derive the user id from
`ICurrentUserService`; the request never carries a user id. Responses are purpose-built DTOs — no EF
entity or navigation graph is serialized, and an id belonging to another user behaves exactly like a
missing one.

| Method and route | Purpose |
|---|---|
| `GET /api/investments/products` | List the user's products with offers and tiers. |
| `GET /api/investments/products/{id}` | Product detail. |
| `POST /api/investments/products` | Create a product within the institution catalog. |
| `PUT /api/investments/products/{id}` | Update catalog fields and optional link; replace offers/tiers only if their content changes. |
| `PATCH /api/investments/products/{id}/account` | Link, unlink (`accountId: null`) or relink without replacing offer/tier IDs. |
| `PATCH /api/investments/products/{id}/active` | Activate/deactivate; reactivation revalidates the account. |
| `GET /api/investments/plans/current?planMonth=` | Persisted plan or derived draft (see above). |
| `GET /api/investments/plans/{id}` | Plan detail: allocations + exclusions, no series. |
| `GET /api/investments/plans/{id}/projection` | Monthly series per allocation + recorded exclusions. |
| `POST /api/investments/plans` | Generate/replace the plan for the requested month. |

DTO examples: `InvestmentProductResult`, `InvestmentOfferResult`, `InvestmentTierResult`,
`InvestmentPlanResult`, `InvestmentPlanProjectionResult`, `InvestmentAllocationResult`,
`InvestmentAllocationProjectionResult`, `InvestmentProjectionRow`, `InvestmentExclusionResult`,
`InvestmentPendingConditionResult`.

## Frontend

- Account selectors use normalized account flags, filter active cash interest-bearing accounts and
  active-link occupancy, and offer an explicit blank option that sends `null` (never `0`). The existing
  link remains visible even if it became ineligible, allowing unlink/relink. Loading failures have
  explicit Spanish guidance rather than being presented as an empty eligible list.
- A separate Spanish linking drawer uses the bounded PATCH and existing CSRF/admin BFF pattern.
  Only eligible linked products enter draft/generation allocations, using their actual account balance;
  unlinked or invalid links are excluded before any balance dereference, never allocated a fake zero.
  Relinking does not regenerate an already persisted plan; only explicit generation replaces it.

- Page `/investments` is admin-guarded (`requireAdminSession`), listed in `privateRoutes` and the
  middleware `matcher`, and linked from the navigation config.
- All calls go through the server-side BFF under `app/api/bff/investments/**`, which requires a
  session, requires the admin role, keeps `cache: "no-store"` and forwards the request with the
  session cookie refresh pattern already used by the other BFF routes.
- The institution field is a `<select>` fed by the shared catalog module; the label is shown while the
  canonical code is submitted. Free text is rejected by the client model (`isAllowedInstitution`) and
  again by the server.
- When an offer has no explicit end date, the form displays December 31 of the capture year
  (`inferredValidTo`) so the user sees exactly what the server will persist, flagged as inferred.
- The client distinguishes a persisted plan from a draft (`planStateLabel`), shows the freshness copy
  per allocation (`OFFER_FRESHNESS_COPY`), marks inferred validity, renders the exclusions table, and
  disables the generate action while blockers remain (`resolveGenerationGate`). The blockers are the
  same rules the server enforces. Copy and gate logic live in `_lib/investments-ui.ts`; the validated
  form model lives in `_lib/investment-form-model.ts`. Both modules are import-free so they run under
  `node --experimental-strip-types`.
- Condition confirmations are rendered from the catalog (`conditionCandidates`), one labelled checkbox
  per tier that declares condition text on the offer captured for the month — for a persisted plan as
  well as for a draft, so a tier stays confirmable even after its product was excluded. The label is
  tied to the exact tier (product, interval, rate and the literal condition text) and each control is a
  native checkbox, so it is keyboard operable and never an icon-only affordance.
- On load, the confirmations the current plan already recorded are pre-checked from the allocation tier
  snapshots (`priorConfirmedTierIds`, `conditionConfirmed`), so regenerating does not silently move
  every condition-bearing product into `conditions_not_confirmed`.
- `generate()` sends only the confirmed ids of tiers declared by the plan month's offers
  (`confirmedTierIdsForGeneration`): an id from another month, or from an offer that no longer exists,
  is never sent, and an unconfirmed tier is left out so the server reports it as an exclusion.
- For a persisted plan, the series is fetched from the projection endpoint because the detail
  contract intentionally has none.

## Unchanged invariants

One active linked product per account and zero or one account per product; optional mutable links;
linked-account revalidation on reactivation; read-only balances; no transactions, credit or MSI writes;
canonical marginal tier schedule validated both on input and at generation; snapshots of the tier,
offer, terms and condition state; admin-only API, BFF and page guard; CSRF handled by the existing
mutable-method middleware and client header.

## Deferred

- Comparison is intentionally not exposed: under V1 each active account can drive only one active
  product and a plan is regenerated in place, so an API comparison endpoint would have no independent
  persisted scenarios to compare.
- Full plan-generation version history and scenario comparison belong to a later version.
- There is no Banxico SIE connector, no scraping and no automatic rate retrieval.

## DDL and verification status

`SQL/schema.sql` holds the fresh-install DDL and
`SQL/migrations/2026-09-29_fixed_income_investments_v1.sql` the idempotent migration for existing
databases. `SQL/migrations/2026-09-30_optional_investment_account.sql` is a new additive,
transactional, repeatable migration that drops only the product account column's NOT NULL constraint.
Apply it after the V1 migration, before deploying nullable-link code to an existing database.
It does not change data, allocation account requirements, RESTRICT foreign keys or the partial unique
index. Neither migration was applied as part of this correction. This solution has **no EF migrations**; catalog CHECK constraints live only in SQL, and the
migration backfills `validity_inferred`, `offer_validity_inferred_snapshot`, `source_label`,
`offer_captured_for_month_snapshot` and `exclusions_json` before adding the named constraints.

Verified: `dotnet build code.sln --no-restore`, `pnpm typecheck`, `pnpm lint`, `pnpm test`. The
migration has **not** been executed against a PostgreSQL instance: DDL correctness was reviewed by
reading the SQL only. Endpoint behavior at runtime, ownership isolation and the E2E flow still require
integration verification.
