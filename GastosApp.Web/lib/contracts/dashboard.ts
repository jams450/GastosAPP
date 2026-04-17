export type DashboardSummary = {
  cashTotal: number;
  creditUsed: number;
  totalDebt: number;
  monthIncome: number;
  monthExpense: number;
};

export type DashboardAccountOverview = {
  accountId: number;
  name: string;
  active: boolean;
  isCredit: boolean;
  cutoffDay: number | null;
  paymentDueDay: number | null;
  initialBalance: number;
  openingBalance: number;
  monthIncome: number;
  monthExpense: number;
  monthNet: number;
  closingBalance: number;
  creditLimit: number | null;
  periodStart: string | null;
  periodEnd: string | null;
  periodSpent: number;
  pendingInformative: number;
};

export type DashboardCreditOverview = {
  month: string;
  timezone: string;
  summary: DashboardSummary;
  accounts: DashboardAccountOverview[];
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
    monthIncome: toFiniteNumber(input.monthIncome),
    monthExpense: toFiniteNumber(input.monthExpense),
    monthNet: toFiniteNumber(input.monthNet),
    closingBalance: toFiniteNumber(input.closingBalance),
    creditLimit: toOptionalFiniteNumber(input.creditLimit),
    periodStart: toOptionalDateString(input.periodStart),
    periodEnd: toOptionalDateString(input.periodEnd),
    periodSpent: toFiniteNumber(input.periodSpent),
    pendingInformative: toFiniteNumber(input.pendingInformative)
  };
}

export function normalizeDashboardCreditOverview(input: unknown): DashboardCreditOverview {
  if (!isRecord(input)) {
    return {
      month: "",
      timezone: "America/Mexico_City",
      summary: {
        cashTotal: 0,
        creditUsed: 0,
        totalDebt: 0,
        monthIncome: 0,
        monthExpense: 0
      },
      accounts: []
    };
  }

  const summaryInput = isRecord(input.summary) ? input.summary : {};
  const accounts = Array.isArray(input.accounts)
    ? input.accounts.map((item) => normalizeAccount(item)).filter((item): item is DashboardAccountOverview => item !== null)
    : [];

  return {
    month: typeof input.month === "string" ? input.month : "",
    timezone: typeof input.timezone === "string" ? input.timezone : "America/Mexico_City",
    summary: {
      cashTotal: toFiniteNumber(summaryInput.cashTotal),
      creditUsed: toFiniteNumber(summaryInput.creditUsed),
      totalDebt: toFiniteNumber(summaryInput.totalDebt),
      monthIncome: toFiniteNumber(summaryInput.monthIncome),
      monthExpense: toFiniteNumber(summaryInput.monthExpense)
    },
    accounts
  };
}
