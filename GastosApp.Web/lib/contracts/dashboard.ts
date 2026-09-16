export type DashboardAccountOverview = {
  accountId: number;
  name: string;
  active: boolean;
  isCredit: boolean;
  cutoffDay: number | null;
  paymentDueDay: number | null;
  initialBalance: number;
  openingBalance: number;
  currentBalance: number;
  monthIncome: number;
  monthExpense: number;
  monthTransferIn: number;
  monthTransferOut: number;
  monthNet: number;
  closingBalance: number;
  creditLimit: number | null;
  periodStart: string | null;
  periodEnd: string | null;
  periodSpent: number;
  estimatedCutoffCharges: number;
  cutoffPayments: number;
  cutoffPending: number;
  msiOutstanding: number;
  normalOutstanding: number;
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function toFiniteNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toOptionalFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toOptionalInt(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    return null;
  }

  return parsed;
}

function toOptionalDateString(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  return value;
}

function normalizeAccount(input: unknown): DashboardAccountOverview | null {
  if (!isRecord(input)) {
    return null;
  }

  const accountId = toFiniteNumber(input.accountId);
  if (accountId <= 0) {
    return null;
  }

  return {
    accountId,
    name: typeof input.name === "string" && input.name.trim().length > 0 ? input.name.trim() : "Sin nombre",
    active: Boolean(input.active),
    isCredit: Boolean(input.isCredit),
    cutoffDay: toOptionalInt(input.cutoffDay),
    paymentDueDay: toOptionalInt(input.paymentDueDay),
    initialBalance: toFiniteNumber(input.initialBalance),
    openingBalance: toFiniteNumber(input.openingBalance),
    currentBalance: toFiniteNumber(input.currentBalance),
    monthIncome: toFiniteNumber(input.monthIncome),
    monthExpense: toFiniteNumber(input.monthExpense),
    monthTransferIn: toFiniteNumber(input.monthTransferIn),
    monthTransferOut: toFiniteNumber(input.monthTransferOut),
    monthNet: toFiniteNumber(input.monthNet),
    closingBalance: toFiniteNumber(input.closingBalance),
    creditLimit: toOptionalFiniteNumber(input.creditLimit),
    periodStart: toOptionalDateString(input.periodStart),
    periodEnd: toOptionalDateString(input.periodEnd),
    periodSpent: toFiniteNumber(input.periodSpent),
    estimatedCutoffCharges: toFiniteNumber(input.estimatedCutoffCharges),
    cutoffPayments: toFiniteNumber(input.cutoffPayments),
    cutoffPending: toFiniteNumber(input.cutoffPending),
    msiOutstanding: toFiniteNumber(input.msiOutstanding),
    normalOutstanding: toFiniteNumber(input.normalOutstanding)
  };
}

export type DashboardBreakdownItem = {
  id: number | null;
  name: string;
  amount: number;
  cashAmount: number;
  creditAmount: number;
};

export type DashboardGeneralSummary = {
  monthIncome: number;
  monthExpense: number;
  monthFinancialNet: number;
};

export type DashboardCharts = {
  expenseByCategory: DashboardBreakdownItem[];
  expenseBySubcategory: DashboardBreakdownItem[];
  incomeByAccount: DashboardBreakdownItem[];
  expenseByAccount: DashboardBreakdownItem[];
  // Sin uso en la UI del dashboard (se conserva por compatibilidad).
  transferInByAccount: DashboardBreakdownItem[];
  // Sin uso en la UI del dashboard (se conserva por compatibilidad).
  transferOutByAccount: DashboardBreakdownItem[];
};

export type DashboardCreditSectionSummary = {
  totalAvailable: number;
  monthIncome: number;
  monthExpense: number;
  monthNet: number;
  monthFinancialNet: number;
  transferIn: number;
  transferOut: number;
  monthMsiExpense: number;
  monthNormalExpense: number;
  pendingMsi: number;
  pendingNormal: number;
};

export type DashboardCashSectionSummary = {
  total: number;
  monthIncome: number;
  monthExpense: number;
  monthNet: number;
  monthFinancialNet: number;
};

export type DashboardOverviewResponse = {
  month: string;
  timezone: string;
  generalSummary: DashboardGeneralSummary;
  charts: DashboardCharts;
  creditSummary: DashboardCreditSectionSummary;
  cashSummary: DashboardCashSectionSummary;
  accounts: DashboardAccountOverview[];
};

function normalizeBreakdownItem(input: unknown): DashboardBreakdownItem | null {
  if (!isRecord(input)) {
    return null;
  }

  return {
    id: toOptionalInt(input.id),
    name: typeof input.name === "string" && input.name.trim().length > 0 ? input.name.trim() : "Sin nombre",
    amount: toFiniteNumber(input.amount),
    cashAmount: toFiniteNumber(input.cashAmount),
    creditAmount: toFiniteNumber(input.creditAmount)
  };
}

function normalizeCollection<T>(input: unknown, normalize: (item: unknown) => T | null): T[] {
  return Array.isArray(input) ? input.map((item) => normalize(item)).filter((item): item is T => item !== null) : [];
}

function normalizeBreakdownCollection(input: unknown): DashboardBreakdownItem[] {
  return normalizeCollection(input, normalizeBreakdownItem);
}

export function normalizeDashboardOverview(input: unknown): DashboardOverviewResponse {
  if (!isRecord(input)) {
    return {
      month: "",
      timezone: "America/Mexico_City",
      generalSummary: {
        monthIncome: 0,
        monthExpense: 0,
        monthFinancialNet: 0
      },
      charts: {
        expenseByCategory: [],
        expenseBySubcategory: [],
        incomeByAccount: [],
        expenseByAccount: [],
        transferInByAccount: [],
        transferOutByAccount: []
      },
      creditSummary: {
        totalAvailable: 0,
        monthIncome: 0,
        monthExpense: 0,
        monthNet: 0,
        monthFinancialNet: 0,
        transferIn: 0,
        transferOut: 0,
        monthMsiExpense: 0,
        monthNormalExpense: 0,
        pendingMsi: 0,
        pendingNormal: 0
      },
      cashSummary: {
        total: 0,
        monthIncome: 0,
        monthExpense: 0,
        monthNet: 0,
        monthFinancialNet: 0
      },
      accounts: []
    };
  }

  const generalSummaryInput = isRecord(input.generalSummary) ? input.generalSummary : {};
  const chartsInput = isRecord(input.charts) ? input.charts : {};
  const creditSummaryInput = isRecord(input.creditSummary) ? input.creditSummary : {};
  const cashSummaryInput = isRecord(input.cashSummary) ? input.cashSummary : {};
  const accounts = Array.isArray(input.accounts)
    ? input.accounts.map((item) => normalizeAccount(item)).filter((item): item is DashboardAccountOverview => item !== null)
    : [];

  return {
    month: typeof input.month === "string" ? input.month : "",
    timezone: typeof input.timezone === "string" ? input.timezone : "America/Mexico_City",
    generalSummary: {
      monthIncome: toFiniteNumber(generalSummaryInput.monthIncome),
      monthExpense: toFiniteNumber(generalSummaryInput.monthExpense),
      monthFinancialNet: toFiniteNumber(
        generalSummaryInput.monthFinancialNet ??
          toFiniteNumber(generalSummaryInput.monthIncome) - toFiniteNumber(generalSummaryInput.monthExpense)
      )
    },
    charts: {
      expenseByCategory: normalizeBreakdownCollection(chartsInput.expenseByCategory),
      expenseBySubcategory: normalizeBreakdownCollection(chartsInput.expenseBySubcategory),
      incomeByAccount: normalizeBreakdownCollection(chartsInput.incomeByAccount),
      expenseByAccount: normalizeBreakdownCollection(chartsInput.expenseByAccount),
      transferInByAccount: normalizeBreakdownCollection(chartsInput.transferInByAccount),
      transferOutByAccount: normalizeBreakdownCollection(chartsInput.transferOutByAccount)
    },
    creditSummary: {
      totalAvailable: toFiniteNumber(creditSummaryInput.totalAvailable),
      monthIncome: toFiniteNumber(creditSummaryInput.monthIncome),
      monthExpense: toFiniteNumber(creditSummaryInput.monthExpense),
      monthNet: toFiniteNumber(creditSummaryInput.monthNet),
      monthFinancialNet: toFiniteNumber(
        creditSummaryInput.monthFinancialNet ??
          toFiniteNumber(creditSummaryInput.monthIncome) - toFiniteNumber(creditSummaryInput.monthExpense)
      ),
      transferIn: toFiniteNumber(creditSummaryInput.transferIn),
      transferOut: toFiniteNumber(creditSummaryInput.transferOut),
      monthMsiExpense: toFiniteNumber(creditSummaryInput.monthMsiExpense),
      monthNormalExpense: toFiniteNumber(creditSummaryInput.monthNormalExpense),
      pendingMsi: toFiniteNumber(creditSummaryInput.pendingMsi),
      pendingNormal: toFiniteNumber(creditSummaryInput.pendingNormal)
    },
    cashSummary: {
      total: toFiniteNumber(cashSummaryInput.total),
      monthIncome: toFiniteNumber(cashSummaryInput.monthIncome),
      monthExpense: toFiniteNumber(cashSummaryInput.monthExpense),
      monthNet: toFiniteNumber(cashSummaryInput.monthNet),
      monthFinancialNet: toFiniteNumber(
        cashSummaryInput.monthFinancialNet ??
          toFiniteNumber(cashSummaryInput.monthIncome) - toFiniteNumber(cashSummaryInput.monthExpense)
      )
    },
    accounts
  };
}

export type DashboardProjectionHistoricalMonth = {
  month: string;
  income: number;
  expense: number;
  net: number;
};

export type DashboardProjectionTrend = {
  sampleMonths: number;
  monthlyNetSlope: number;
  projectedMonthlyNet: number;
  hasSufficientHistory: boolean;
};

export type DashboardProjectionMonth = {
  month: string;
  projectedCashBalance: number;
  projectedNet: number;
  msiCommitment: number;
  msiPaymentScenarioBalance: number;
};

export type DashboardProjectionMsiPlan = {
  planId: string | null;
  accountId: number | null;
  accountName: string;
  remainingAmount: number;
  openInstallments: number | null;
  nextDueDate: string | null;
  nextDueAmount: number | null;
  endsOn: string | null;
  scheduleComplete: boolean;
};

export type DashboardProjectionResponse = {
  asOfDate: string | null;
  timezone: string;
  horizonMonths: number;
  cashRealBalance: number;
  historicalMonths: DashboardProjectionHistoricalMonth[];
  trend: DashboardProjectionTrend;
  months: DashboardProjectionMonth[];
  msiPlans: DashboardProjectionMsiPlan[];
};

function toStringId(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function normalizeProjectionHistoricalMonth(input: unknown): DashboardProjectionHistoricalMonth | null {
  if (!isRecord(input)) {
    return null;
  }

  const month = typeof input.month === "string" ? input.month.trim() : "";
  if (month.length === 0) {
    return null;
  }

  return {
    month,
    income: toFiniteNumber(input.income),
    expense: toFiniteNumber(input.expense),
    net: toFiniteNumber(input.net ?? toFiniteNumber(input.income) - toFiniteNumber(input.expense))
  };
}

function normalizeProjectionMonth(input: unknown): DashboardProjectionMonth | null {
  if (!isRecord(input)) {
    return null;
  }

  const month = typeof input.month === "string" ? input.month.trim() : "";
  if (month.length === 0) {
    return null;
  }

  const projectedCashBalance = toFiniteNumber(input.projectedCashBalance);

  return {
    month,
    projectedCashBalance,
    projectedNet: toFiniteNumber(input.projectedNet),
    msiCommitment: toFiniteNumber(input.msiCommitment),
    // Sin escenario explícito, el saldo base es el mejor sustituto: no inventa impacto MSI.
    msiPaymentScenarioBalance: toFiniteNumber(input.msiPaymentScenarioBalance ?? projectedCashBalance)
  };
}

function normalizeProjectionMsiPlan(input: unknown): DashboardProjectionMsiPlan | null {
  if (!isRecord(input)) {
    return null;
  }

  const planId = toStringId(input.planId);
  const accountId = toOptionalInt(input.accountId);

  if (planId === null && accountId === null) {
    return null;
  }

  return {
    planId,
    accountId,
    accountName:
      typeof input.accountName === "string" && input.accountName.trim().length > 0
        ? input.accountName.trim()
        : "Cuenta sin nombre",
    remainingAmount: toFiniteNumber(input.remainingAmount),
    openInstallments: toOptionalInt(input.openInstallments),
    nextDueDate: toOptionalDateString(input.nextDueDate),
    nextDueAmount: toOptionalFiniteNumber(input.nextDueAmount),
    endsOn: toOptionalDateString(input.endsOn),
    // Ausente = sin evidencia de calendario incompleto; no se alarma sin dato.
    scheduleComplete: input.scheduleComplete !== false
  };
}

function normalizeProjectionTrend(input: unknown): DashboardProjectionTrend {
  const source = isRecord(input) ? input : {};

  return {
    sampleMonths: toOptionalInt(source.sampleMonths) ?? 0,
    monthlyNetSlope: toFiniteNumber(source.monthlyNetSlope),
    projectedMonthlyNet: toFiniteNumber(source.projectedMonthlyNet),
    hasSufficientHistory: source.hasSufficientHistory === true
  };
}

export function normalizeDashboardProjection(input: unknown): DashboardProjectionResponse {
  const source = isRecord(input) ? input : {};
  const months = normalizeCollection(source.months, normalizeProjectionMonth);
  const horizonMonths = toOptionalInt(source.horizonMonths);

  return {
    asOfDate: toOptionalDateString(source.asOfDate),
    timezone: typeof source.timezone === "string" && source.timezone.trim().length > 0 ? source.timezone : "America/Mexico_City",
    horizonMonths: horizonMonths !== null && horizonMonths > 0 ? horizonMonths : months.length,
    cashRealBalance: toFiniteNumber(source.cashRealBalance),
    historicalMonths: normalizeCollection(source.historicalMonths, normalizeProjectionHistoricalMonth),
    trend: normalizeProjectionTrend(source.trend),
    months,
    msiPlans: normalizeCollection(source.msiPlans, normalizeProjectionMsiPlan)
  };
}
