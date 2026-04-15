export type Account = {
  accountId: number;
  name: string;
  isCredit: boolean;
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
    isCredit: Boolean(input.isCredit),
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
