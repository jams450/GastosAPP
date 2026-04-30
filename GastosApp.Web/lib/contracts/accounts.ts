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

  const accountId = toFiniteNumber(input.accountId);
  if (accountId === null) {
    return null;
  }

  return {
    accountId,
    name: typeof input.name === "string" && input.name.trim().length > 0 ? input.name.trim() : "Sin nombre",
    color: toColor(input.color),
    startDate: toOptionalDateString(input.startDate),
    isCredit: Boolean(input.isCredit),
    dueDay: toOptionalFiniteNumber(input.dueDay),
    paymentDueDay: toOptionalFiniteNumber(input.paymentDueDay),
    earnsInterest: Boolean(input.earnsInterest),
    annualInterestRate: toFiniteNumber(input.annualInterestRate) ?? 0,
    initialBalance: toFiniteNumber(input.initialBalance) ?? 0,
    currentBalance: toFiniteNumber(input.currentBalance) ?? 0,
    active: Boolean(input.active),
    creditLimit: toOptionalFiniteNumber(input.creditLimit)
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
