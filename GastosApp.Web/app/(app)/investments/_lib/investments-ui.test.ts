import assert from "node:assert/strict";
import { test } from "node:test";
import {
  allocationFreshness,
  conditionCandidateLabel,
  conditionCandidates,
  confirmedTierIdsForGeneration,
  exclusionSummary,
  isOfferStale,
  planStateLabel,
  priorConfirmedTierIds,
  resolveGenerationGate,
  type AllocationStateInput,
  type ConditionCatalogProduct
} from "./investments-ui.ts";

const PLAN_MONTH = "2026-09";

function conditionTier(investmentRateTierId: number, specialConditionText: string) {
  return { investmentRateTierId, minimumAmount: 0, maximumAmount: 50000, annualRatePercent: 12, specialConditionText };
}

function catalogProduct(
  investmentProductId: number,
  name: string,
  tiers: ReadonlyArray<ReturnType<typeof conditionTier>>,
  overrides: Partial<ConditionCatalogProduct> = {}
): ConditionCatalogProduct {
  return {
    investmentProductId,
    name,
    active: true,
    offers: [{ capturedForMonth: PLAN_MONTH, tiers }],
    ...overrides
  };
}

function allocation(overrides: Partial<AllocationStateInput> = {}): AllocationStateInput {
  return {
    productName: "Nu cajita",
    offerFreshness: "current",
    tiers: [{ investmentRateTierId: 1, specialConditionText: "" }],
    ...overrides
  };
}

test("planStateLabel distinguishes a persisted plan from a carried draft", () => {
  assert.equal(planStateLabel({ isPersisted: true, planMonth: "2026-09", carriedFromPlanMonth: "2026-08" }), "Generated plan for 2026-09");
  assert.equal(
    planStateLabel({ isPersisted: false, planMonth: "2026-09", carriedFromPlanMonth: "2026-08" }),
    "Draft for 2026-09 carried from 2026-08 — update before generating"
  );
  assert.equal(planStateLabel({ isPersisted: false, planMonth: "2026-09", carriedFromPlanMonth: null }), "Draft for 2026-09 — not generated yet");
});

test("freshness classifies every non-current state as stale", () => {
  assert.equal(allocationFreshness({ offerFreshness: null }), null);
  assert.equal(isOfferStale({ offerFreshness: "current" }), false);
  for (const freshness of ["stale", "missing", "inactive"] as const) {
    assert.equal(isOfferStale({ offerFreshness: freshness }), true, `${freshness} debe bloquear`);
  }
  // Fail-closed: an unknown freshness is treated as blocking, never as current.
  assert.equal(isOfferStale({ offerFreshness: null }), true);
});

test("a persisted plan can always be regenerated", () => {
  const gate = resolveGenerationGate({ isPersisted: true, allocations: [] }, new Set());
  assert.equal(gate.canGenerate, true);
  assert.deepEqual(gate.blockers, []);
});

test("a draft without an eligible product cannot generate", () => {
  const gate = resolveGenerationGate({ isPersisted: false, allocations: [] }, new Set());
  assert.equal(gate.canGenerate, false);
  assert.equal(gate.blockers.length, 1);
});

test("a draft with a stale offer is blocked with an explicit reason", () => {
  const gate = resolveGenerationGate({ isPersisted: false, allocations: [allocation({ offerFreshness: "stale" })] }, new Set());

  assert.equal(gate.canGenerate, false);
  assert.match(gate.blockers[0], /Nu cajita/);
  assert.match(gate.blockers[0], /earlier month/);
});

test("an unknown freshness fails closed and blocks generation", () => {
  const gate = resolveGenerationGate({ isPersisted: false, allocations: [allocation({ offerFreshness: null })] }, new Set());

  assert.equal(gate.canGenerate, false);
  assert.equal(gate.blockers.length, 1);
  assert.match(gate.blockers[0], /unknown/);
});

test("a draft requires an explicit confirmation for every declared special condition", () => {
  const plan = {
    isPersisted: false,
    allocations: [
      allocation({
        tiers: [
          { investmentRateTierId: 1, specialConditionText: "" },
          { investmentRateTierId: 2, specialConditionText: "Gasto mínimo 1000" }
        ]
      })
    ]
  };

  const unconfirmed = resolveGenerationGate(plan, new Set());
  assert.equal(unconfirmed.canGenerate, false);
  assert.match(unconfirmed.blockers[0], /Gasto mínimo 1000/);

  // Confirming an unrelated tier does not unlock generation.
  assert.equal(resolveGenerationGate(plan, new Set([1])).canGenerate, false);

  const confirmed = resolveGenerationGate(plan, new Set([1, 2]));
  assert.equal(confirmed.canGenerate, true);
  assert.deepEqual(confirmed.blockers, []);
});

test("a tier without condition text never asks for a confirmation", () => {
  const gate = resolveGenerationGate({ isPersisted: false, allocations: [allocation()] }, new Set());

  assert.equal(gate.canGenerate, true);
  assert.deepEqual(gate.blockers, []);
});

test("exclusionSummary never claims there were no exclusions when there were", () => {
  assert.equal(exclusionSummary([]), "No products were excluded.");
  assert.equal(exclusionSummary([{ reason: "inactive_product" }]), "1 product excluded");
  assert.equal(exclusionSummary([{ reason: "inactive_product" }, { reason: "no_offer_for_month" }]), "2 products excluded");
});

test("conditionCandidates lists only condition-bearing tiers of the plan month", () => {
  const products: ConditionCatalogProduct[] = [
    {
      investmentProductId: 1,
      name: "Nu cajita",
      active: true,
      offers: [
        {
          capturedForMonth: PLAN_MONTH,
          tiers: [
            conditionTier(7, "Gasto mínimo 1000"),
            { investmentRateTierId: 8, minimumAmount: 50000, maximumAmount: null, annualRatePercent: 7, specialConditionText: "   " }
          ]
        },
        {
          capturedForMonth: "2026-08",
          tiers: [conditionTier(5, "Condición de agosto")]
        }
      ]
    },
    catalogProduct(2, "Finsus", [conditionTier(6, "Condición de un producto inactivo")], { active: false }),
    catalogProduct(3, "CETES", [conditionTier(9, "Condición de un mes que no se está planeando")], {
      offers: [{ capturedForMonth: "2026-07", tiers: [conditionTier(9, "Condición de un mes que no se está planeando")] }]
    })
  ];

  const candidates = conditionCandidates(products, PLAN_MONTH);

  assert.deepEqual(
    candidates.map((candidate) => candidate.investmentRateTierId),
    [7]
  );
  assert.deepEqual(
    candidates.map((candidate) => candidate.productName),
    ["Nu cajita"]
  );
  assert.deepEqual(
    conditionCandidates([catalogProduct(2, "Finsus", [conditionTier(6, "Condición de un producto inactivo")], { active: false })], PLAN_MONTH),
    [],
    "an inactive product never asks for a confirmation"
  );
});

test("regenerating preserves confirmed tiers and never sends an unconfirmed condition tier", () => {
  const products = [
    catalogProduct(1, "Nu cajita", [conditionTier(7, "Gasto mínimo 1000"), conditionTier(8, "Sin comisión")])
  ];
  const candidates = conditionCandidates(products, PLAN_MONTH);
  assert.deepEqual(
    candidates.map((candidate) => candidate.investmentRateTierId),
    [7, 8]
  );

  // What a persisted plan recorded when it was generated: tier 7 accepted, tier 8 never offered then.
  const persistedPlan = {
    allocations: [
      {
        tiers: [
          { investmentRateTierId: 7, specialConditionText: "Gasto mínimo 1000", conditionConfirmed: true },
          { investmentRateTierId: 99, specialConditionText: "", conditionConfirmed: true }
        ]
      }
    ]
  };

  const preserved = priorConfirmedTierIds(persistedPlan);
  assert.deepEqual([...preserved], [7]);

  // Regenerating without touching the UI keeps tier 7 confirmed instead of dropping it.
  const onRegenerate = confirmedTierIdsForGeneration(candidates, preserved);
  assert.deepEqual(onRegenerate, [7]);
  assert.equal(onRegenerate.includes(8), false, "an unconfirmed condition tier is left out so the server excludes it");

  // Confirming the new tier in the same month sends both; a preserved draft state may hold extra ids.
  assert.deepEqual(confirmedTierIdsForGeneration(candidates, new Set([...preserved, 8])), [7, 8]);
  assert.deepEqual(confirmedTierIdsForGeneration(candidates, new Set([7, 8, 12345])), [7, 8]);
});

test("a tier id from another month is never sent with the generation request", () => {
  const products = [
    catalogProduct(1, "Nu cajita", [conditionTier(7, "Gasto mínimo 1000")], {
      offers: [
        { capturedForMonth: PLAN_MONTH, tiers: [conditionTier(7, "Gasto mínimo 1000")] },
        { capturedForMonth: "2026-08", tiers: [conditionTier(5, "Condición de agosto")] }
      ]
    })
  ];

  const candidates = conditionCandidates(products, PLAN_MONTH);

  assert.deepEqual(confirmedTierIdsForGeneration(candidates, new Set([7, 5])), [7]);
  assert.deepEqual(confirmedTierIdsForGeneration(candidates, new Set([5])), []);
});

test("priorConfirmedTierIds never assumes a confirmation", () => {
  assert.deepEqual([...priorConfirmedTierIds(null)], []);
  assert.deepEqual([...priorConfirmedTierIds({ allocations: [] })], []);

  // A draft allocates a condition tier without attesting it.
  assert.deepEqual(
    [...priorConfirmedTierIds({ allocations: [{ tiers: [{ investmentRateTierId: 7, specialConditionText: "Gasto mínimo 1000", conditionConfirmed: false }] }] })],
    []
  );

  // A tier without condition text is not a confirmation either.
  assert.deepEqual(
    [...priorConfirmedTierIds({ allocations: [{ tiers: [{ investmentRateTierId: 8, specialConditionText: "  ", conditionConfirmed: true }] }] })],
    []
  );

  // An allocation tier whose snapshot the catalog no longer offers still counts as granted.
  assert.deepEqual(
    [...priorConfirmedTierIds({ allocations: [{ tiers: [{ investmentRateTierId: 7, specialConditionText: "Gasto mínimo 1000", conditionConfirmed: true }] }] })],
    [7]
  );
});

test("the confirmation label is tied to the tier and carries the literal condition text", () => {
  const [candidate] = conditionCandidates([catalogProduct(1, "Nu cajita", [conditionTier(7, "Gasto mínimo 1000")])], PLAN_MONTH);
  const label = conditionCandidateLabel(candidate);

  assert.match(label, /Gasto mínimo 1000/);
  assert.match(label, /Nu cajita/);
  assert.match(label, /0-50000/);
  assert.match(label, /12%/);
});
