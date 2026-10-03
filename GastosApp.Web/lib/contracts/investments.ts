/**
 * Investment contracts and defensive normalizers.
 *
 * Self-contained on purpose: no imports, no side effects. The API returns purpose-built DTOs, but the
 * UI still validates shape so an unexpected payload degrades to an explicit empty/unknown state
 * instead of rendering `undefined` or a fabricated zero. Money stays a finite number, and an unknown
 * amount stays `null` rather than becoming `0`, because a zero balance and an unknown balance are not
 * the same thing.
 *
 * Institution codes are validated by `lib/contracts/investment-institutions.ts`; display labels come
 * from the same module so there is a single catalog.
 */

export type InvestmentTier = {
  investmentRateTierId: number;
  minimumAmount: number;
  maximumAmount: number | null;
  annualRatePercent: number;
  specialConditionText: string;
};

export type InvestmentOffer = {
  investmentOfferId: number;
  capturedForMonth: string;
  validFrom: string;
  validTo: string;
  validityInferred: boolean;
  sourceUrl: string;
  sourceLabel: string;
  termsText: string;
  conditionsConfirmed: boolean;
  tiers: InvestmentTier[];
};

export type InvestmentProduct = {
  investmentProductId: number;
  accountId: number | null;
  accountName: string | null;
  name: string;
  institution: string;
  institutionLabel: string;
  active: boolean;
  offers: InvestmentOffer[];
};

export type InvestmentOfferFreshness = "current" | "stale" | "missing" | "inactive";

export type InvestmentPendingCondition = {
  investmentProductId: number;
  investmentOfferId: number;
  investmentRateTierId: number;
  specialConditionText: string;
};

export type InvestmentAllocationTier = {
  investmentRateTierId: number;
  minimumAmount: number;
  maximumAmount: number | null;
  annualRatePercent: number;
  specialConditionText: string;
  conditionConfirmed: boolean;
};

export type InvestmentProjectionRow = {
  monthNumber: number;
  month: string;
  openingBalance: number;
  interest: number;
  closingBalance: number;
};

export type InvestmentAllocation = {
  investmentProductId: number;
  accountId: number;
  productName: string;
  institution: string;
  institutionLabel: string;
  allocatedAmount: number;
  offerCapturedForMonth: string;
  offerValidFrom: string;
  offerValidTo: string;
  validityInferred: boolean;
  offerSourceUrl: string;
  offerSourceLabel: string;
  termsText: string;
  conditionsConfirmed: boolean;
  offerFreshness: InvestmentOfferFreshness | null;
  pendingConditions: InvestmentPendingCondition[];
  tiers: InvestmentAllocationTier[];
};

export type InvestmentAllocationProjection = InvestmentAllocation & { projection: InvestmentProjectionRow[] };

export type InvestmentExclusion = {
  investmentProductId: number;
  productName: string;
  institution: string;
  institutionLabel: string;
  reason: string;
  message: string;
};

export type InvestmentPlan = {
  investmentPlanId: number;
  planMonth: string;
  projectionMonths: number;
  /** False means this is a derived draft: it is not stored and must be updated before generating. */
  isPersisted: boolean;
  carriedFromPlanId: number | null;
  carriedFromPlanMonth: string | null;
  allocations: InvestmentAllocation[];
  exclusions: InvestmentExclusion[];
};

export type InvestmentPlanProjection = {
  investmentPlanId: number;
  planMonth: string;
  projectionMonths: number;
  isPersisted: boolean;
  allocations: InvestmentAllocationProjection[];
  exclusions: InvestmentExclusion[];
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Unknown snapshot numbers stay non-finite so projection consumers fail closed, never plot zero. */
function snapshotNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : Number.NaN;
  if (typeof value !== "string" || !/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)) return Number.NaN;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function asOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asInt(value: unknown): number {
  const parsed = asNumber(value);
  return Number.isInteger(parsed) ? parsed : Math.trunc(parsed);
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function normalizeTier(value: unknown): InvestmentTier {
  const tier = isRecord(value) ? value : {};
  return {
    investmentRateTierId: asInt(tier.investmentRateTierId),
    minimumAmount: asNumber(tier.minimumAmount),
    maximumAmount: asOptionalNumber(tier.maximumAmount),
    annualRatePercent: asNumber(tier.annualRatePercent),
    specialConditionText: asString(tier.specialConditionText)
  };
}

function normalizeOffer(value: unknown): InvestmentOffer {
  const offer = isRecord(value) ? value : {};
  return {
    investmentOfferId: asInt(offer.investmentOfferId),
    capturedForMonth: asString(offer.capturedForMonth),
    validFrom: asString(offer.validFrom),
    validTo: asString(offer.validTo),
    validityInferred: asBoolean(offer.validityInferred),
    sourceUrl: asString(offer.sourceUrl),
    sourceLabel: asString(offer.sourceLabel),
    termsText: asString(offer.termsText),
    conditionsConfirmed: asBoolean(offer.conditionsConfirmed),
    tiers: asArray(offer.tiers).map(normalizeTier)
  };
}

/** Drops products without identity: a nameless row is worse than an omitted one. */
export function normalizeProducts(input: unknown): InvestmentProduct[] {
  return asArray(input)
    .map((value) => {
      if (!isRecord(value)) return null;
      const id = asInt(value.investmentProductId);
      if (id <= 0) return null;
      return {
        investmentProductId: id,
        accountId: asOptionalNumber(value.accountId),
        accountName: asOptionalString(value.accountName),
        name: asString(value.name),
        institution: asString(value.institution),
        institutionLabel: asString(value.institutionLabel),
        active: asBoolean(value.active),
        offers: asArray(value.offers).map(normalizeOffer)
      } satisfies InvestmentProduct;
    })
    .filter((product): product is InvestmentProduct => product !== null);
}

function normalizePendingCondition(value: unknown): InvestmentPendingCondition {
  const condition = isRecord(value) ? value : {};
  return {
    investmentProductId: asInt(condition.investmentProductId),
    investmentOfferId: asInt(condition.investmentOfferId),
    investmentRateTierId: asInt(condition.investmentRateTierId),
    specialConditionText: asString(condition.specialConditionText)
  };
}

function normalizeAllocationTier(value: unknown): InvestmentAllocationTier {
  const tier = isRecord(value) ? value : {};
  return {
    investmentRateTierId: asInt(tier.investmentRateTierId),
    minimumAmount: snapshotNumber(tier.minimumAmount),
    // AddApiMvc omits null properties; an absent nullable bound means unbounded.
    maximumAmount: tier.maximumAmount === null || tier.maximumAmount === undefined ? null : snapshotNumber(tier.maximumAmount),
    annualRatePercent: snapshotNumber(tier.annualRatePercent),
    specialConditionText: asString(tier.specialConditionText),
    conditionConfirmed: asBoolean(tier.conditionConfirmed)
  };
}

const FRESHNESS_VALUES: ReadonlySet<string> = new Set(["current", "stale", "missing", "inactive"]);

function normalizeFreshness(value: unknown): InvestmentOfferFreshness | null {
  return typeof value === "string" && FRESHNESS_VALUES.has(value) ? (value as InvestmentOfferFreshness) : null;
}

function normalizeAllocation(value: unknown): InvestmentAllocation {
  const allocation = isRecord(value) ? value : {};
  return {
    investmentProductId: snapshotNumber(allocation.investmentProductId),
    accountId: snapshotNumber(allocation.accountId),
    productName: asString(allocation.productName),
    institution: asString(allocation.institution),
    institutionLabel: asString(allocation.institutionLabel),
    allocatedAmount: snapshotNumber(allocation.allocatedAmount),
    offerCapturedForMonth: asString(allocation.offerCapturedForMonth),
    offerValidFrom: asString(allocation.offerValidFrom),
    offerValidTo: asString(allocation.offerValidTo),
    validityInferred: asBoolean(allocation.validityInferred),
    offerSourceUrl: asString(allocation.offerSourceUrl),
    offerSourceLabel: asString(allocation.offerSourceLabel),
    termsText: asString(allocation.termsText),
    conditionsConfirmed: asBoolean(allocation.conditionsConfirmed),
    offerFreshness: normalizeFreshness(allocation.offerFreshness),
    pendingConditions: asArray(allocation.pendingConditions).map(normalizePendingCondition),
    tiers: asArray(allocation.tiers).map(normalizeAllocationTier)
  };
}

function normalizeExclusion(value: unknown): InvestmentExclusion {
  const exclusion = isRecord(value) ? value : {};
  return {
    investmentProductId: asInt(exclusion.investmentProductId),
    productName: asString(exclusion.productName),
    institution: asString(exclusion.institution),
    institutionLabel: asString(exclusion.institutionLabel),
    reason: asString(exclusion.reason),
    message: asString(exclusion.message)
  };
}

/** Returns `null` for an unusable plan payload so callers show an explicit error state. */
export function normalizePlan(input: unknown): InvestmentPlan | null {
  if (!isRecord(input)) return null;
  const planMonth = asString(input.planMonth);
  if (!MONTH_PATTERN.test(planMonth)) return null;

  return {
    investmentPlanId: snapshotNumber(input.investmentPlanId),
    planMonth,
    projectionMonths: snapshotNumber(input.projectionMonths),
    isPersisted: asBoolean(input.isPersisted),
    carriedFromPlanId: asOptionalNumber(input.carriedFromPlanId),
    carriedFromPlanMonth: asOptionalString(input.carriedFromPlanMonth),
    allocations: asArray(input.allocations).map(normalizeAllocation),
    exclusions: asArray(input.exclusions).map(normalizeExclusion)
  };
}

function normalizeProjectionRow(value: unknown): InvestmentProjectionRow {
  const row = isRecord(value) ? value : {};
  return {
    monthNumber: snapshotNumber(row.monthNumber),
    month: asString(row.month),
    openingBalance: snapshotNumber(row.openingBalance),
    interest: snapshotNumber(row.interest),
    closingBalance: snapshotNumber(row.closingBalance)
  };
}

export function normalizePlanProjection(input: unknown): InvestmentPlanProjection | null {
  if (!isRecord(input)) return null;
  const planMonth = asString(input.planMonth);
  if (!MONTH_PATTERN.test(planMonth)) return null;

  return {
    investmentPlanId: snapshotNumber(input.investmentPlanId),
    planMonth,
    projectionMonths: snapshotNumber(input.projectionMonths),
    isPersisted: asBoolean(input.isPersisted),
    allocations: asArray(input.allocations).map((value) => ({
      ...normalizeAllocation(value),
      projection: asArray(isRecord(value) ? value.projection : []).map(normalizeProjectionRow)
    })),
    exclusions: asArray(input.exclusions).map(normalizeExclusion)
  };
}

/**
 * Rendimiento mensual esperado de renta fija para un periodo (`yyyy-MM`).
 *
 * Es una lectura de la serie generada por el backend, no un cálculo del frontend: el interés
 * compuesto sin aportaciones vive en `InvestmentCalculator` y aquí solo se consume tal cual.
 * El importe es un **supuesto de proyección, nunca un ingreso real**: por eso viaja en una línea
 * aparte y jamás se mezcla con `committedIncome`/`executedIncome` del plan.
 */
export type ExpectedInvestmentIncome = {
  period: string;
  expectedInterest: number;
  allocationCount: number;
  hasPlan: boolean;
};

/** `null` ante un payload inutilizable para que el lector muestre un estado explícito. */
export function normalizeExpectedInvestmentIncome(input: unknown): ExpectedInvestmentIncome | null {
  if (!isRecord(input)) return null;
  const period = asString(input.period);
  if (!MONTH_PATTERN.test(period)) return null;

  const allocationCount = asInt(input.allocationCount);

  return {
    period,
    expectedInterest: asNumber(input.expectedInterest),
    allocationCount: allocationCount < 0 ? 0 : allocationCount,
    hasPlan: input.hasPlan === true
  };
}

function roundExpectedMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Suma el `interest` de la serie del backend para `period`, asignación por asignación.
 *
 * Solo cuentan las filas cuyo `month` es exactamente el periodo pedido y cuyo interés es finito:
 * una fila no numérica (`NaN` tras normalizar) no aporta ni se cuenta como asignación, en vez de
 * contaminar la suma. `allocationCount` es la cantidad de asignaciones que aportan a ese mes, no
 * el total del plan, para que el conteo sea coherente con la suma que acompaña.
 */
export function sumExpectedInvestmentIncome(
  projection: InvestmentPlanProjection,
  period: string
): { expectedInterest: number; allocationCount: number } {
  let total = 0;
  let allocationCount = 0;

  for (const allocation of projection.allocations) {
    let contributes = false;

    for (const row of allocation.projection) {
      if (row.month !== period || !Number.isFinite(row.interest)) {
        continue;
      }

      total += row.interest;
      contributes = true;
    }

    if (contributes) {
      allocationCount += 1;
    }
  }

  return { expectedInterest: roundExpectedMoney(total), allocationCount };
}
