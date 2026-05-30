export type Account = {
  accountId: number;
  name: string;
  color: string;
  startDate: string | null;
  isCredit: boolean;
  dueDay: number | null;
  paymentDueDay: number | null;
  earnsInterest: boolean;
  annualInterestRate: number;
  initialBalance: number;
  currentBalance: number;
  active: boolean;
  creditLimit: number | null;
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function toFiniteNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toOptionalFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return toFiniteNumber(value);
}

function toBool(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return fallback;
}

function toOptionalDateString(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  return value;
}

function toColor(value: unknown): string {
  if (typeof value !== "string") {
    return "#0ea5e9";
  }

  const parsed = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(parsed) ? parsed : "#0ea5e9";
}

export function accountStartDateToInput(value: string | null): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function normalizeAccount(input: unknown): Account | null {
  if (!isRecord(input)) {
    return null;
  }

  const accountId = toFiniteNumber(input.accountId ?? input.AccountId);
  if (accountId === null) {
    return null;
  }

  const nameRaw = input.name ?? input.Name;

  return {
    accountId,
    name: typeof nameRaw === "string" && nameRaw.trim().length > 0 ? nameRaw.trim() : "Sin nombre",
    color: toColor(input.color ?? input.Color),
    startDate: toOptionalDateString(input.startDate ?? input.StartDate),
    isCredit: toBool(input.isCredit ?? input.IsCredit),
    dueDay: toOptionalFiniteNumber(input.dueDay ?? input.DueDay),
    paymentDueDay: toOptionalFiniteNumber(input.paymentDueDay ?? input.PaymentDueDay),
    earnsInterest: toBool(input.earnsInterest ?? input.EarnsInterest),
    annualInterestRate: toFiniteNumber(input.annualInterestRate ?? input.AnnualInterestRate) ?? 0,
    initialBalance: toFiniteNumber(input.initialBalance ?? input.InitialBalance) ?? 0,
    currentBalance: toFiniteNumber(input.currentBalance ?? input.CurrentBalance) ?? 0,
    active: toBool(input.active ?? input.Active, true),
    creditLimit: toOptionalFiniteNumber(input.creditLimit ?? input.CreditLimit)
  };
}

export function normalizeAccounts(input: unknown): Account[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((item) => normalizeAccount(item))
    .filter((account): account is Account => account !== null);
}
