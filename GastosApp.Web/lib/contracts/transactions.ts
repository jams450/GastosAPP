type UnknownRecord = Record<string, unknown>;

export type IncomeExpenseTransactionRequest = {
  accountId: number;
  categoryId: number;
  subcategoryId?: number;
  merchantId?: number;
  tags?: string[];
  amount: number;
  description: string;
  transactionDate: string;
};

export type TransferTransactionRequest = {
  sourceAccountId: number;
  destinationAccountId: number;
  categoryId: number;
  subcategoryId?: number;
  merchantId?: number;
  tags?: string[];
  amount: number;
  description: string;
  transactionDate: string;
};

export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string };

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function toRequiredPositiveNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function toRequiredText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toOptionalPositiveNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return parsed;
}

function toNormalizedTags(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const tags = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);

  return tags.length > 0 ? [...new Set(tags)] : undefined;
}

function toIsoDate(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return null;
  }

  const asDate = new Date(`${normalized}T00:00:00Z`);
  return Number.isNaN(asDate.getTime()) ? null : normalized;
}

export function validateIncomeExpensePayload(input: unknown): ValidationResult<IncomeExpenseTransactionRequest> {
  if (!isRecord(input)) {
    return { ok: false, message: "Invalid payload" };
  }

  const accountId = toRequiredPositiveNumber(input.accountId);
  const categoryId = toRequiredPositiveNumber(input.categoryId);
  const amount = toRequiredPositiveNumber(input.amount);
  const description = toRequiredText(input.description);
  const transactionDate = toIsoDate(input.transactionDate);
  const subcategoryId = toOptionalPositiveNumber(input.subcategoryId);
  const merchantId = toOptionalPositiveNumber(input.merchantId);
  const tags = toNormalizedTags(input.tags);

  if (!accountId || !categoryId || !amount || !description || !transactionDate) {
    return {
      ok: false,
      message: "accountId, categoryId, amount, description and transactionDate are required"
    };
  }

  return {
    ok: true,
    data: {
      accountId,
      categoryId,
      subcategoryId,
      merchantId,
      tags,
      amount,
      description,
      transactionDate
    }
  };
}

export function validateTransferPayload(input: unknown): ValidationResult<TransferTransactionRequest> {
  if (!isRecord(input)) {
    return { ok: false, message: "Invalid payload" };
  }

  const sourceAccountId = toRequiredPositiveNumber(input.sourceAccountId);
  const destinationAccountId = toRequiredPositiveNumber(input.destinationAccountId);
  const categoryId = toRequiredPositiveNumber(input.categoryId);
  const amount = toRequiredPositiveNumber(input.amount);
  const description = toRequiredText(input.description);
  const transactionDate = toIsoDate(input.transactionDate);
  const subcategoryId = toOptionalPositiveNumber(input.subcategoryId);
  const merchantId = toOptionalPositiveNumber(input.merchantId);
  const tags = toNormalizedTags(input.tags);

  if (!sourceAccountId || !destinationAccountId || !categoryId || !amount || !description || !transactionDate) {
    return {
      ok: false,
      message: "sourceAccountId, destinationAccountId, categoryId, amount, description and transactionDate are required"
    };
  }

  if (sourceAccountId === destinationAccountId) {
    return {
      ok: false,
      message: "sourceAccountId and destinationAccountId must be different"
    };
  }

  return {
    ok: true,
    data: {
      sourceAccountId,
      destinationAccountId,
      categoryId,
      subcategoryId,
      merchantId,
      tags,
      amount,
      description,
      transactionDate
    }
  };
}
