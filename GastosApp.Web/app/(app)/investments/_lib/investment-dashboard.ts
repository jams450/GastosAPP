import type { InvestmentAllocation, InvestmentPlan, InvestmentPlanProjection, InvestmentProjectionRow } from "../../../../lib/contracts/investments.ts";

export type ProjectionPoint = { date: string; monthNumber: number; capital: number | null; interest: number | null };
export type DashboardProjection = {
  starting: number | null;
  monthEnd: number | null;
  yearEnd: number | null;
  twelveMonthEnd: number | null;
  points: ProjectionPoint[];
  allocations: Map<number, InvestmentProjectionRow[]>;
};

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export function projectionMonth(planMonth: string, offset: number): string {
  const [year, month] = planMonth.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return date.toISOString().slice(0, 7);
}

export function projectionEndDate(planMonth: string, monthNumber: number): string {
  const [year, month] = projectionMonth(planMonth, monthNumber - 1).split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

/** December includes the plan month: September closes the year at point 4, not 3. */
export function calendarYearPoint(planMonth: string): number | null {
  return MONTH.test(planMonth) ? 13 - Number(planMonth.slice(5)) : null;
}

/** Convert DB decimal(15,2) money and decimal(7,4) rates without binary floating rounding. */
function scaled(value: number, places: number): bigint | null {
  if (!Number.isFinite(value) || value < 0) return null;
  const text = String(value);
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  if (fraction.length > places) return null;
  return BigInt(whole + fraction.padEnd(places, "0"));
}

/** Mirrors InvestmentCalculator.Project: marginal portions, monthly compounding, away-from-zero cents. */
export function projectSnapshot(allocation: Pick<InvestmentAllocation, "allocatedAmount" | "tiers">, planMonth: string, months: number): InvestmentProjectionRow[] | null {
  if (!MONTH.test(planMonth) || !Number.isInteger(months) || months < 1 || months > 24) return null;
  const initial = scaled(allocation.allocatedAmount, 2);
  if (initial === null || !allocation.tiers.length) return null;
  let balance: bigint = initial;
  const tiers = [...allocation.tiers].sort((a, b) => a.minimumAmount - b.minimumAmount).map((tier) => ({
    minimum: scaled(tier.minimumAmount, 2),
    maximum: tier.maximumAmount === null ? null : scaled(tier.maximumAmount, 2),
    rate: scaled(tier.annualRatePercent, 4),
    unbounded: tier.maximumAmount === null,
    confirmed: !tier.specialConditionText.trim() || tier.conditionConfirmed
  }));
  if (tiers[0].minimum !== BigInt(0)) return null;
  for (const [index, tier] of tiers.entries()) {
    if (tier.minimum === null || tier.rate === null || !tier.confirmed) return null;
    if (tier.unbounded) {
      if (index !== tiers.length - 1) return null;
    } else if (tier.maximum === null || tier.maximum <= tier.minimum || index === tiers.length - 1 || tiers[index + 1].minimum !== tier.maximum) return null;
  }
  const rows: InvestmentProjectionRow[] = [];
  const denominator = BigInt(12_000_000); // annual percent scaled to 4 decimals × 100 × 12
  for (let index = 0; index < months; index++) {
    let numerator = BigInt(0);
    for (const tier of tiers) {
      const upper = tier.maximum === null || balance < tier.maximum ? balance : tier.maximum;
      const portion = upper > tier.minimum! ? upper - tier.minimum! : BigInt(0);
      numerator += portion * tier.rate!;
    }
    const interest = (numerator + denominator / BigInt(2)) / denominator;
    const closing = balance + interest;
    if (closing > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    rows.push({ monthNumber: index + 1, month: projectionMonth(planMonth, index), openingBalance: Number(balance) / 100, interest: Number(interest) / 100, closingBalance: Number(closing) / 100 });
    balance = closing;
  }
  return rows;
}

function sumMoney(values: number[]): number | null {
  let total = BigInt(0);
  for (const value of values) {
    const cents = scaled(value, 2);
    if (cents === null) return null;
    total += cents;
  }
  return total <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(total) / 100 : null;
}

const validHorizon = (value: number) => Number.isInteger(value) && value >= 1 && value <= 24;

/** Compare persisted traceability as well as math; display-only labels are not snapshot identity. */
function sameSnapshot(a: InvestmentAllocation, b: InvestmentAllocation): boolean {
  const fields = ["investmentProductId", "accountId", "productName", "institution", "allocatedAmount", "offerCapturedForMonth", "offerValidFrom", "offerValidTo", "validityInferred", "offerSourceUrl", "offerSourceLabel", "termsText", "conditionsConfirmed"] as const;
  if (fields.some((field) => a[field] !== b[field]) || a.tiers.length !== b.tiers.length) return false;
  const tierFields = ["investmentRateTierId", "minimumAmount", "maximumAmount", "annualRatePercent", "specialConditionText", "conditionConfirmed"] as const;
  return a.tiers.every((tier, index) => tierFields.every((field) => tier[field] === b.tiers[index][field]));
}

/** Forecasts require a matching successful API series. Only then may frozen snapshots extend it. */
export function buildInvestmentDashboard(plan: InvestmentPlan | null, horizon: number, api: InvestmentPlanProjection | null = null): DashboardProjection {
  const empty: DashboardProjection = { starting: null, monthEnd: null, yearEnd: null, twelveMonthEnd: null, points: [], allocations: new Map() };
  if (!plan?.isPersisted || !plan.allocations.length || !MONTH.test(plan.planMonth) || !validHorizon(horizon)) return empty;
  const validIdentity = (allocation: InvestmentAllocation) => Number.isInteger(allocation.investmentProductId) && allocation.investmentProductId > 0 && Number.isInteger(allocation.accountId) && allocation.accountId > 0;
  const planIds = new Set(plan.allocations.map((allocation) => allocation.investmentProductId));
  if (planIds.size !== plan.allocations.length || plan.allocations.some((allocation) => !validIdentity(allocation))) return empty;
  const starting = sumMoney(plan.allocations.map((allocation) => allocation.allocatedAmount));
  const unknown = { ...empty, starting };
  if (!Number.isInteger(plan.investmentPlanId) || plan.investmentPlanId <= 0 || !validHorizon(plan.projectionMonths) || !api?.isPersisted || api.investmentPlanId !== plan.investmentPlanId || api.planMonth !== plan.planMonth || !validHorizon(api.projectionMonths) || api.projectionMonths !== plan.projectionMonths || api.allocations.length !== plan.allocations.length) return unknown;
  const apiIds = new Set(api.allocations.map((allocation) => allocation.investmentProductId));
  if (apiIds.size !== api.allocations.length || api.allocations.some((allocation) => !validIdentity(allocation) || !planIds.has(allocation.investmentProductId))) return unknown;
  let apiMax = 0;
  for (const allocation of api.allocations) {
    if (allocation.projection.length !== api.projectionMonths || allocation.projection.some((row, index) => !validHorizon(row.monthNumber) || row.monthNumber !== index + 1 || row.month !== projectionMonth(plan.planMonth, index))) return unknown;
    apiMax = Math.max(apiMax, allocation.projection.at(-1)!.monthNumber);
  }
  const yearPoint = calendarYearPoint(plan.planMonth)!;
  const months = Math.max(horizon, 12, yearPoint, plan.projectionMonths, apiMax);
  const allocations = new Map<number, InvestmentProjectionRow[]>();
  for (const allocation of plan.allocations) {
    const stored = api.allocations.find((item) => item.investmentProductId === allocation.investmentProductId)!;
    if (!allocation.conditionsConfirmed || !sameSnapshot(allocation, stored)) return unknown;
    const rows = projectSnapshot(allocation, plan.planMonth, months);
    if (!rows || stored.projection.some((row, index) => row.openingBalance !== rows[index].openingBalance || row.interest !== rows[index].interest || row.closingBalance !== rows[index].closingBalance)) return unknown;
    allocations.set(allocation.investmentProductId, rows);
  }
  const totalAt = (point: number, key: "closingBalance" | "interest") => sumMoney([...allocations.values()].map((rows) => rows[point - 1][key]));
  return {
    starting,
    monthEnd: totalAt(1, "closingBalance"),
    yearEnd: totalAt(yearPoint, "closingBalance"),
    twelveMonthEnd: totalAt(12, "closingBalance"),
    allocations,
    points: [
      { date: `${plan.planMonth}-01`, monthNumber: 0, capital: starting, interest: null },
      ...Array.from({ length: horizon }, (_, index) => ({ date: projectionEndDate(plan.planMonth, index + 1), monthNumber: index + 1, capital: totalAt(index + 1, "closingBalance"), interest: totalAt(index + 1, "interest") }))
    ]
  };
}
