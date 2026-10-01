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

import { normalizePlan, normalizeProducts } from "../../../../lib/contracts/investments.ts";
import { normalizeAccounts } from "../../../../lib/contracts/accounts.ts";
import { eligibleLinkAccounts } from "./investment-form-model.ts";

import { exclusionReasonLabel } from "./investment-copy.ts";

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
  assert.equal(planStateLabel({ isPersisted: true, planMonth: "2026-09", carriedFromPlanMonth: "2026-08" }), "Plan generado para 2026-09");
  assert.equal(
    planStateLabel({ isPersisted: false, planMonth: "2026-09", carriedFromPlanMonth: "2026-08" }),
    "Borrador para 2026-09 basado en 2026-08 — actualiza antes de generar"
  );
  assert.equal(planStateLabel({ isPersisted: false, planMonth: "2026-09", carriedFromPlanMonth: null }), "Borrador para 2026-09 — aún no generado");
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
  assert.match(gate.blockers[0], /mes anterior/);
});

test("an unknown freshness fails closed and blocks generation", () => {
  const gate = resolveGenerationGate({ isPersisted: false, allocations: [allocation({ offerFreshness: null })] }, new Set());

  assert.equal(gate.canGenerate, false);
  assert.equal(gate.blockers.length, 1);
  assert.match(gate.blockers[0], /desconocido/);
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
  assert.equal(exclusionSummary([]), "No hay productos excluidos.");
  assert.equal(exclusionSummary([{ reason: "inactive_product" }]), "1 producto excluido");
  assert.equal(exclusionSummary([{ reason: "inactive_product" }, { reason: "no_offer_for_month" }]), "2 productos excluidos");
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

test("Spanish display mappings preserve machine codes and stored user text", async () => {
  const { exclusionReasonLabel, investmentErrorMessage, EXCLUSION_REASON_COPY } = await import("./investment-copy.ts");
  for (const reason of Object.keys(EXCLUSION_REASON_COPY)) assert.notEqual(exclusionReasonLabel(reason), reason);
  assert.equal(exclusionReasonLabel("conditions_not_confirmed"), "Las condiciones de la oferta no están confirmadas.");
  assert.equal(investmentErrorMessage(new Error("An active investment product already links this account."), "No se pudo guardar."), "Esta cuenta ya está vinculada a un producto de inversión activo.");
  assert.equal(investmentErrorMessage(new Error("Unknown server detail"), "No se pudo guardar."), "No se pudo guardar.");
  assert.match(conditionCandidateLabel({ investmentProductId: 1, productName: "Nu", investmentRateTierId: 1, minimumAmount: 0, maximumAmount: null, annualRatePercent: 7, specialConditionText: "Keep this literal" }), /^Confirmar "Keep this literal" para Nu, tramo/);
});


test("unlinked catalog entries retain null and are displayed as exclusions, not zero allocations", () => {
  const products = normalizeProducts([{ investmentProductId: 1, accountId: null, active: true },
    { investmentProductId: 2, active: true }, { investmentProductId: 3, accountId: 7 }]);
  assert.deepEqual(products.map((product) => product.accountId), [null, null, 7]);
  const plan = normalizePlan({ planMonth: PLAN_MONTH, allocations: [], exclusions: [
    { investmentProductId: 1, reason: "unlinked_account" }
  ] });
  assert.ok(plan);
  assert.equal(plan.allocations.length, 0);
  assert.equal(resolveGenerationGate(plan, new Set()).canGenerate, false);
  assert.equal(exclusionReasonLabel(plan.exclusions[0].reason), "El producto no tiene una cuenta vinculada.");
});

test("account exclusion reasons have explicit Spanish guidance", () => {
  for (const reason of ["unlinked_account", "missing_account", "foreign_account", "inactive_account", "credit_account", "non_interest_account"]) {
    assert.notEqual(exclusionReasonLabel(reason), exclusionReasonLabel("unknown"));
  }
});


test("normalized account payload flags drive link eligibility, not the account annual rate", () => {
  const accounts = normalizeAccounts([
    { AccountId: 1, Active: true, IsCredit: false, EarnsInterest: true, AnnualInterestRate: 0 },
    { accountId: 2, active: true, isCredit: false, earnsInterest: false, annualInterestRate: 20 },
    { accountId: 3, active: true, isCredit: true, earnsInterest: true },
    { accountId: 4, active: false, isCredit: false, earnsInterest: true }
  ]);
  assert.deepEqual(eligibleLinkAccounts(accounts, [], null).map((account) => account.accountId), [1]);
});

// Dashboard projections deliberately use generated snapshots, never current catalog/account data.
import { buildInvestmentDashboard, calendarYearPoint, projectSnapshot, projectionEndDate } from "./investment-dashboard.ts";
import { normalizePlanProjection } from "../../../../lib/contracts/investments.ts";

function dashboardPlan(month = PLAN_MONTH, horizon = 2) {
  return normalizePlan({ investmentPlanId: 42, planMonth: month, projectionMonths: horizon, isPersisted: true, allocations: [{
    investmentProductId: 1, accountId: 7, productName: "Snapshot", allocatedAmount: 1500,
    conditionsConfirmed: true, tiers: [
      { minimumAmount: 0, maximumAmount: 1000, annualRatePercent: 12 },
      { minimumAmount: 1000, maximumAmount: null, annualRatePercent: 6 }
    ]
  }] })!;
}

function matchingProjection(plan: ReturnType<typeof dashboardPlan>) {
  return normalizePlanProjection({ ...plan, allocations: plan.allocations.map((allocation) => ({
    ...allocation, projection: projectSnapshot(allocation, plan.planMonth, plan.projectionMonths) ?? []
  })) })!;
}

function checkedDashboard(plan: ReturnType<typeof dashboardPlan> | null, horizon: number, api = plan ? matchingProjection(plan) : null) {
  return buildInvestmentDashboard(plan, horizon, api);
}

test("snapshot marginal compounding matches InvestmentCalculator cents, not a flattened rate", () => {
  const rows = projectSnapshot(dashboardPlan().allocations[0], PLAN_MONTH, 3)!;
  assert.deepEqual(rows.map((row) => [row.openingBalance, row.interest, row.closingBalance]), [
    [1500, 12.5, 1512.5], [1512.5, 12.56, 1525.06], [1525.06, 12.63, 1537.69]
  ]);
  const allocation = dashboardPlan().allocations[0];
  assert.equal(projectSnapshot({ ...allocation, allocatedAmount: 1, tiers: [{ ...allocation.tiers[0], maximumAmount: null, annualRatePercent: 6 }] }, PLAN_MONTH, 1)![0].interest, 0.01, "midpoint rounds away from zero");
  assert.equal(projectSnapshot({ ...allocation, allocatedAmount: 999.99 }, PLAN_MONTH, 2)![1].interest, 10.05, "compounding crosses the marginal boundary");
  assert.equal(projectSnapshot({ ...allocation, allocatedAmount: 0 }, PLAN_MONTH, 1)![0].closingBalance, 0);
});

test("calendar year includes plan month and exact twelve-month KPI ignores selected horizon", () => {
  assert.equal(calendarYearPoint("2026-01"), 12);
  assert.equal(calendarYearPoint("2026-09"), 4);
  assert.equal(calendarYearPoint("2026-12"), 1);
  assert.equal(calendarYearPoint("invalid"), null);
  for (const month of ["2026-01", "2026-09", "2026-12"]) {
    const plan = dashboardPlan(month);
    const rows = projectSnapshot(plan.allocations[0], month, 24)!;
    for (const horizon of [1, 2, 12, 24]) {
      const dashboard = checkedDashboard(plan, horizon);
      assert.equal(dashboard.monthEnd, rows[0].closingBalance);
      assert.equal(dashboard.yearEnd, rows[calendarYearPoint(month)! - 1].closingBalance);
      assert.equal(dashboard.twelveMonthEnd, rows[11].closingBalance);
      assert.equal(dashboard.points.length, horizon + 1);
      assert.equal(dashboard.points.at(-1)!.capital, rows[horizon - 1].closingBalance);
    }
  }
});

test("chart starts at frozen capital then shows every monthly close in chronological order", () => {
  const plan = dashboardPlan("2028-02");
  const dashboard = checkedDashboard(plan, 3);
  assert.deepEqual(dashboard.points.map((point) => point.date), ["2028-02-01", "2028-02-29", "2028-03-31", "2028-04-30"]);
  assert.equal(projectionEndDate("2026-12", 2), "2027-01-31");
  assert.equal(dashboard.points[0].capital, 1500);
  assert.equal(dashboard.points[0].interest, null);
  assert.equal(dashboard.points[1].capital, dashboard.monthEnd);
  assert.equal(dashboard.starting, 1500);
  const second = { ...plan.allocations[0], investmentProductId: 2, accountId: 8, allocatedAmount: 1000 };
  const aggregate = checkedDashboard({ ...plan, allocations: [...plan.allocations, second] }, 3);
  assert.equal(aggregate.starting, 2500);
  assert.equal(aggregate.monthEnd, 2522.5);
  assert.equal(aggregate.points[1].interest, 22.5);
  for (let point = 1; point <= 3; point++) {
    const rows = [...aggregate.allocations.values()].map((series) => series[point - 1]);
    assert.equal(aggregate.points[point].capital, rows.reduce((sum, row) => sum + Math.round(row.closingBalance * 100), 0) / 100);
  }
});

test("draft, absent, empty, malformed and unverified inputs never become fabricated projections", () => {
  const plan = dashboardPlan();
  for (const input of [null, { ...plan, isPersisted: false }, { ...plan, allocations: [] }]) {
    const result = checkedDashboard(input, 12);
    assert.equal(result.starting, null);
    assert.deepEqual(result.points, []);
    assert.equal(result.twelveMonthEnd, null);
  }
  for (const allocation of [
    { ...plan.allocations[0], tiers: [] },
    { ...plan.allocations[0], allocatedAmount: Number.NaN },
    { ...plan.allocations[0], conditionsConfirmed: false },
    { ...plan.allocations[0], tiers: [{ ...plan.allocations[0].tiers[0], maximumAmount: null, specialConditionText: "Keep this literal", conditionConfirmed: false }] },
    { ...plan.allocations[0], tiers: [{ ...plan.allocations[0].tiers[0], minimumAmount: 10 }] },
    { ...plan.allocations[0], tiers: [{ ...plan.allocations[0].tiers[0], maximumAmount: null, annualRatePercent: Number.NaN }] }
  ]) {
    const result = checkedDashboard({ ...plan, allocations: [allocation] }, 12);
    assert.equal(result.monthEnd, null);
    assert.equal(result.twelveMonthEnd, null);
    assert.ok(result.points.slice(1).every((point) => point.capital === null));
  }
  assert.deepEqual(checkedDashboard(plan, 25).points, []);
});

test("API series parity is checked and missing values remain non-finite, not zeros", () => {
  const plan = dashboardPlan();
  const projection = normalizePlanProjection({ ...plan, allocations: plan.allocations.map((allocation) => ({
    ...allocation, projection: projectSnapshot(allocation, plan.planMonth, plan.projectionMonths)
  })) })!;
  assert.equal(checkedDashboard(plan, 24, projection).monthEnd, 1512.5);
  projection.allocations[0].projection[0].closingBalance = 999;
  assert.equal(checkedDashboard(plan, 24, projection).monthEnd, null);
  const malformed = normalizePlanProjection({ ...plan, allocations: [{ ...plan.allocations[0], projection: [{ month: PLAN_MONTH, monthNumber: 1, closingBalance: null }] }] })!;
  assert.ok(Number.isNaN(malformed.allocations[0].projection[0].closingBalance));
  assert.ok(Number.isNaN(malformed.allocations[0].projection[0].interest));
  assert.equal(checkedDashboard(plan, 12, malformed).monthEnd, null);
  const absentRate = normalizePlan({ ...plan, allocations: [{ ...plan.allocations[0], allocatedAmount: null, tiers: [{ minimumAmount: 0, maximumAmount: null }] }] })!;
  assert.ok(Number.isNaN(absentRate.allocations[0].allocatedAmount));
  assert.ok(Number.isNaN(absentRate.allocations[0].tiers[0].annualRatePercent));
  assert.equal(checkedDashboard(absentRate, 12).starting, null);
});

test("bounded schedules, decimal rates and API gaps fail closed or round exactly", () => {
  const plan = dashboardPlan();
  const tier = plan.allocations[0].tiers[0];
  const halfCent = { ...plan.allocations[0], allocatedAmount: 12000, tiers: [{ ...tier, maximumAmount: null, annualRatePercent: 0.0005 }] };
  assert.equal(projectSnapshot(halfCent, PLAN_MONTH, 1)![0].interest, 0.01);
  const invalidSchedules = [
    [{ ...tier, maximumAmount: 1000 }],
    [{ ...tier, maximumAmount: 1000 }, { ...tier, minimumAmount: 1001, maximumAmount: null }],
    [{ ...tier, maximumAmount: null }, { ...tier, minimumAmount: 1000, maximumAmount: null }],
    [{ ...tier, maximumAmount: null, annualRatePercent: -1 }]
  ];
  for (const tiers of invalidSchedules) assert.equal(projectSnapshot({ ...plan.allocations[0], tiers }, PLAN_MONTH, 12), null);
  const raw = { ...plan, allocations: [{ ...plan.allocations[0], projection: projectSnapshot(plan.allocations[0], PLAN_MONTH, 1) }] };
  assert.equal(checkedDashboard(plan, 12, normalizePlanProjection(raw)).monthEnd, null, "truncated API series must not silently become complete");
  assert.equal(checkedDashboard({ ...plan, allocations: [{ ...plan.allocations[0], allocatedAmount: 0 }] }, 12).starting, 0, "verified zero is distinct from absent capital");
});

test("pending, missing or failed API projection exposes only valid frozen principal", () => {
  const plan = dashboardPlan();
  for (const api of [undefined, null]) {
    const result = buildInvestmentDashboard(plan, 12, api);
    assert.equal(result.starting, 1500);
    assert.equal(result.monthEnd, null);
    assert.equal(result.yearEnd, null);
    assert.equal(result.twelveMonthEnd, null);
    assert.deepEqual(result.points, []);
    assert.equal(result.allocations.size, 0);
  }
  assert.equal(buildInvestmentDashboard(plan, 12, matchingProjection(plan)).monthEnd, 1512.5);
});

test("stored 24-month series remains valid when chart is reduced to one month", () => {
  const plan = dashboardPlan(PLAN_MONTH, 24);
  const api = matchingProjection(plan);
  const full = buildInvestmentDashboard(plan, 24, api);
  const short = buildInvestmentDashboard(plan, 1, api);
  assert.equal(short.points.length, 2);
  assert.equal(short.monthEnd, full.monthEnd);
  assert.equal(short.yearEnd, full.yearEnd);
  assert.equal(short.twelveMonthEnd, full.twelveMonthEnd);
  assert.equal(short.twelveMonthEnd, api.allocations[0].projection[11].closingBalance);
  assert.equal(short.allocations.get(1)!.length, 24);
  const invalid = [
    { ...api, projectionMonths: 25 },
    { ...api, projectionMonths: 1 },
    { ...api, allocations: [{ ...api.allocations[0], projection: api.allocations[0].projection.slice(0, 23) }] },
    { ...api, allocations: [{ ...api.allocations[0], projection: [...api.allocations[0].projection].reverse() }] },
    { ...api, allocations: [{ ...api.allocations[0], projection: api.allocations[0].projection.map((row, index) => index === 23 ? { ...row, monthNumber: 100000 } : row) }] },
    { ...api, allocations: [{ ...api.allocations[0], projection: api.allocations[0].projection.map((row, index) => index === 1 ? { ...row, month: PLAN_MONTH } : row) }] }
  ];
  for (const malformed of invalid) assert.equal(buildInvestmentDashboard(plan, 1, malformed).twelveMonthEnd, null);
});

test("snapshot numeric normalization rejects coercible nonnumbers and whitespace", () => {
  const plan = dashboardPlan();
  for (const value of [" ", "\t", "", [], [0], {}, true, false, null, undefined, "0x10", " 12 ", "NaN", Infinity]) {
    const normalized = normalizePlan({ ...plan, allocations: [{ ...plan.allocations[0], allocatedAmount: value, tiers: [{ minimumAmount: value, maximumAmount: value, annualRatePercent: value }] }] })!;
    assert.ok(Number.isNaN(normalized.allocations[0].allocatedAmount), `invalid amount ${JSON.stringify(value)}`);
    assert.ok(Number.isNaN(normalized.allocations[0].tiers[0].annualRatePercent));
    const projected = normalizePlanProjection({ ...plan, allocations: [{ ...plan.allocations[0], projection: [{ monthNumber: 1, month: PLAN_MONTH, openingBalance: value, interest: value, closingBalance: value }] }] })!;
    assert.ok(Number.isNaN(projected.allocations[0].projection[0].closingBalance));
  }
  for (const value of [0, "0", "12.50", "1e2"]) {
    const normalized = normalizePlan({ ...plan, allocations: [{ ...plan.allocations[0], allocatedAmount: value }] })!;
    assert.equal(normalized.allocations[0].allocatedAmount, Number(value));
  }
});

test("API parity rejects duplicate missing unexpected identities and conflicting snapshots", () => {
  const plan = dashboardPlan();
  const api = matchingProjection(plan);
  const allocation = api.allocations[0];
  for (const allocations of [[], [allocation, allocation], [allocation, { ...allocation, accountId: 99 }], [{ ...allocation, investmentProductId: 99 }]]) {
    const result = buildInvestmentDashboard(plan, 12, { ...api, allocations });
    assert.equal(result.monthEnd, null);
    assert.equal(result.allocations.size, 0);
  }
  const fields = { accountId: 99, allocatedAmount: 999, productName: "Other", institution: "other", offerCapturedForMonth: "2026-08", offerValidFrom: "2026-08-01", offerValidTo: "2026-08-31", offerSourceUrl: "https://other.example", offerSourceLabel: "Other", termsText: "Changed", conditionsConfirmed: false, validityInferred: true };
  for (const [key, value] of Object.entries(fields)) {
    assert.equal(buildInvestmentDashboard(plan, 12, { ...api, allocations: [{ ...allocation, [key]: value }] }).monthEnd, null, key);
  }
  assert.equal(buildInvestmentDashboard(plan, 12, { ...api, investmentPlanId: 43 }).monthEnd, null);
  assert.equal(buildInvestmentDashboard(plan, 12, { ...api, planMonth: "2026-08" }).monthEnd, null);
  assert.equal(buildInvestmentDashboard(plan, 12, { ...api, allocations: [{ ...allocation, tiers: allocation.tiers.map((tier, index) => index === 0 ? { ...tier, annualRatePercent: 13 } : tier) }] }).monthEnd, null);
  const secondPlan = { ...plan, allocations: [...plan.allocations, { ...plan.allocations[0], investmentProductId: 2, accountId: 8 }] };
  const secondApi = matchingProjection(secondPlan);
  assert.equal(buildInvestmentDashboard(secondPlan, 12, { ...secondApi, allocations: [secondApi.allocations[0], secondApi.allocations[0]] }).monthEnd, null, "same-size duplicate hides missing identity");
});

// InvestmentPlanResult / InvestmentPlanProjectionResult serialized by AddApiMvc:
// camelCase, DateOnly strings, numeric decimals, WhenWritingNull (no maximumAmount).
function serializedBackendPlan() {
  const allocation = {
    investmentProductId: 1, accountId: 7, productName: "Snapshot", institution: "nu", institutionLabel: "Nu",
    allocatedAmount: 1500, offerCapturedForMonth: PLAN_MONTH, offerValidFrom: "2026-09-01", offerValidTo: "2026-12-31",
    validityInferred: true, offerSourceUrl: "https://example.test/offer", offerSourceLabel: "Published offer",
    conditionsConfirmed: true, pendingConditions: [], tiers: [
      { investmentRateTierId: 11, minimumAmount: 0, maximumAmount: 1000, annualRatePercent: 12, conditionConfirmed: true },
      { investmentRateTierId: 12, minimumAmount: 1000, annualRatePercent: 6, conditionConfirmed: true }
    ]
  };
  const plan = { investmentPlanId: 42, planMonth: PLAN_MONTH, projectionMonths: 2, isPersisted: true, allocations: [allocation], exclusions: [] };
  const projection = { ...plan, allocations: [{ ...allocation, projection: [
    { monthNumber: 1, month: "2026-09", openingBalance: 1500, interest: 12.5, closingBalance: 1512.5 },
    { monthNumber: 2, month: "2026-10", openingBalance: 1512.5, interest: 12.56, closingBalance: 1525.06 }
  ] }] };
  return { plan, projection };
}

test("actual API null-omitting DTO preserves unbounded tiers and displays persisted amounts/chart", () => {
  const dto = serializedBackendPlan();
  const plan = normalizePlan(dto.plan)!;
  const api = normalizePlanProjection(dto.projection)!;
  assert.equal(plan.allocations[0].tiers[1].maximumAmount, null);
  const dashboard = buildInvestmentDashboard(plan, 2, api);
  assert.equal(dashboard.starting, 1500);
  assert.equal(dashboard.monthEnd, 1512.5);
  assert.deepEqual(dashboard.points.map((point) => point.capital), [1500, 1512.5, 1525.06]);
  assert.ok(dashboard.yearEnd! > 1500);
  assert.ok(dashboard.twelveMonthEnd! > 1500);
});

import { loadInvestmentPlan } from "./investment-plan-load.ts";
import { linkedCurrentBalance, normalizeInvestmentAccounts } from "./investment-current-balance.ts";

test("complete load requests detail then separate series using actual serialized DTOs", async () => {
  const dto = serializedBackendPlan();
  const calls: string[] = [];
  const result = await loadInvestmentPlan(PLAN_MONTH, (async (url) => {
    calls.push(String(url));
    return Response.json(calls.length === 1 ? dto.plan : dto.projection);
  }) as typeof fetch);
  assert.deepEqual(calls, ["/api/bff/investments/plans/current?planMonth=2026-09", "/api/bff/investments/plans/42/projection"]);
  assert.equal(result.projectionError, null);
  assert.equal(buildInvestmentDashboard(result.plan, 2, result.projection).monthEnd, 1512.5);
});

test("projection errors keep factual plan and capital, never fabricate chart", async () => {
  const dto = serializedBackendPlan();
  for (const kind of ["http", "network", "invalid", "json"]) {
    const result = await loadInvestmentPlan(PLAN_MONTH, (async (url) => {
      if (String(url).includes("current")) return Response.json(dto.plan);
      if (kind === "network") throw new Error("offline");
      if (kind === "http") return new Response(null, { status: 503 });
      if (kind === "json") return new Response("bad json");
      return Response.json({});
    }) as typeof fetch);
    assert.equal(result.plan!.allocations[0].allocatedAmount, 1500);
    assert.ok(result.projectionError);
    assert.equal(result.projection, null);
    const dashboard = buildInvestmentDashboard(result.plan, 12, result.projection);
    assert.equal(dashboard.starting, 1500);
    assert.equal(dashboard.monthEnd, null);
    assert.deepEqual(dashboard.points, []);
  }
});

test("draft or absent plan needs no projection request and leaves catalog/link balances independent", async () => {
  const dto = serializedBackendPlan();
  const products = normalizeProducts([
    { investmentProductId: 1, accountId: 7, name: "Linked", active: true, institution: "nu", offers: [] },
    { investmentProductId: 2, name: "Unlinked", active: true, institution: "nu", offers: [] }
  ]);
  const accounts = normalizeInvestmentAccounts([{ accountId: 7, name: "Cash", active: true, isCredit: false, earnsInterest: true, currentBalance: 1750.25 }]);
  for (const body of [null, { ...dto.plan, investmentPlanId: 0, isPersisted: false, allocations: [] }, { ...dto.plan, investmentPlanId: 0, isPersisted: false }]) {
    let requests = 0;
    const result = await loadInvestmentPlan(PLAN_MONTH, (async () => {
      requests++;
      return body ? Response.json(body) : new Response(null, { status: 404 });
    }) as typeof fetch);
    assert.equal(requests, 1);
    assert.equal(result.projection, null);
    assert.deepEqual(buildInvestmentDashboard(result.plan, 12, result.projection).points, []);
    assert.equal(products.length, 2);
    assert.equal(linkedCurrentBalance(products[0], accounts), 1750.25);
    assert.equal(linkedCurrentBalance(products[1], accounts), null);
  }
});

test("linked balances require actual eligible account and preserve unknown vs genuine zero", () => {
  const product = { accountId: 7 };
  const account = { accountId: 7, active: true, isCredit: false, earnsInterest: true, currentBalance: 0 };
  assert.equal(linkedCurrentBalance(product, normalizeInvestmentAccounts([account])), 0);
  assert.equal(linkedCurrentBalance(product, normalizeInvestmentAccounts([{ ...account, currentBalance: "12.50" }])), 12.5);
  for (const balance of [null, undefined, "", " ", false, [], {}, Infinity]) {
    assert.equal(linkedCurrentBalance(product, normalizeInvestmentAccounts([{ ...account, currentBalance: balance }])), null);
  }
  for (const patch of [{ active: false }, { isCredit: true }, { earnsInterest: false }, { accountId: 8 }]) {
    assert.equal(linkedCurrentBalance(product, normalizeInvestmentAccounts([{ ...account, ...patch }])), null);
  }
  assert.equal(linkedCurrentBalance(product, []), null);
  assert.equal(linkedCurrentBalance(product, normalizeInvestmentAccounts([account, account])), null);
});

test("omitted optional bound is supported without relaxing malformed bounds or snapshot parity", () => {
  const dto = serializedBackendPlan();
  for (const bound of ["", " ", false, {}, "NaN"]) {
    const allocations = [{ ...dto.plan.allocations[0], tiers: [{ ...dto.plan.allocations[0].tiers[1], minimumAmount: 0, maximumAmount: bound }] }];
    const plan = normalizePlan({ ...dto.plan, allocations })!;
    assert.ok(Number.isNaN(plan.allocations[0].tiers[0].maximumAmount));
    assert.equal(buildInvestmentDashboard(plan, 12, normalizePlanProjection(dto.projection)).monthEnd, null);
  }
  const plan = normalizePlan(dto.plan)!;
  const api = normalizePlanProjection(dto.projection)!;
  api.allocations[0].accountId = 8;
  assert.equal(buildInvestmentDashboard(plan, 12, api).monthEnd, null);
});
