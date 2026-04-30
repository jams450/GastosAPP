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
  msiMonths?: number;
  creditAllocations?: CreditInstallmentAllocation[];
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
  creditAllocations?: CreditInstallmentAllocation[];
};

export type CreditInstallmentAllocation = {
  installmentId: number;
  amount: number;
};

export type CreditOpenInstallmentItem = {
  installmentId: number;
  planId: number;
  planType: "MSI" | "Revolving";
  installmentNumber: number;
  months: number;
  dueDate: string;
  totalDue: number;
  paidAmount: number;
  remainingAmount: number;
  sourceTransactionId: number;
  description: string;
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

function toCreditAllocations(value: unknown): CreditInstallmentAllocation[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const rows = value
    .map((entry) => {
      if (!isRecord(entry)) {
        return null;
      }

      const installmentId = toRequiredPositiveNumber(entry.installmentId);
      const amount = toRequiredPositiveNumber(entry.amount);
      if (!installmentId || !amount) {
        return null;
      }

      return { installmentId, amount } satisfies CreditInstallmentAllocation;
    })
    .filter((entry): entry is CreditInstallmentAllocation => Boolean(entry));

  return rows.length > 0 ? rows : undefined;
}

function toOptionalMsiMonths(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 2 || parsed > 60) {
    return undefined;
  }

  return parsed;
}

function toUtcIsoDateTime(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const dateCandidate = /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? `${normalized}T00:00` : normalized;
  const asDate = new Date(dateCandidate);
  if (Number.isNaN(asDate.getTime())) {
    return null;
  }

  return asDate.toISOString();
}

export function validateIncomeExpensePayload(input: unknown): ValidationResult<IncomeExpenseTransactionRequest> {
  if (!isRecord(input)) {
    return { ok: false, message: "Invalid payload" };
  }

  const accountId = toRequiredPositiveNumber(input.accountId);
  const categoryId = toRequiredPositiveNumber(input.categoryId);
  const amount = toRequiredPositiveNumber(input.amount);
  const description = toRequiredText(input.description);
  const transactionDate = toUtcIsoDateTime(input.transactionDate);
  const subcategoryId = toOptionalPositiveNumber(input.subcategoryId);
  const merchantId = toOptionalPositiveNumber(input.merchantId);
  const tags = toNormalizedTags(input.tags);
  const msiMonths = toOptionalMsiMonths(input.msiMonths);
  const creditAllocations = toCreditAllocations(input.creditAllocations);

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
      transactionDate,
      msiMonths,
      creditAllocations
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
  const transactionDate = toUtcIsoDateTime(input.transactionDate);
  const subcategoryId = toOptionalPositiveNumber(input.subcategoryId);
  const merchantId = toOptionalPositiveNumber(input.merchantId);
  const tags = toNormalizedTags(input.tags);
  const creditAllocations = toCreditAllocations(input.creditAllocations);

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
      transactionDate,
      creditAllocations
    }
  };
}

export function normalizeCreditOpenInstallments(input: unknown): CreditOpenInstallmentItem[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((row) => {
      if (!isRecord(row)) {
        return null;
      }

      const installmentId = toRequiredPositiveNumber(row.installmentId);
      const planId = toRequiredPositiveNumber(row.planId);
      const installmentNumber = toRequiredPositiveNumber(row.installmentNumber);
      const months = toRequiredPositiveNumber(row.months);
      const totalDue = toRequiredPositiveNumber(row.totalDue);
      const remainingAmount = toRequiredPositiveNumber(row.remainingAmount);
      const sourceTransactionId = toRequiredPositiveNumber(row.sourceTransactionId);
      const paidAmount = typeof row.paidAmount === "number" ? row.paidAmount : Number(row.paidAmount ?? 0);
      const planType = row.planType === "MSI" ? "MSI" : "Revolving";
      const dueDate = typeof row.dueDate === "string" ? row.dueDate : "";
      const description = typeof row.description === "string" ? row.description : "";

      if (!installmentId || !planId || !installmentNumber || !months || !totalDue || !remainingAmount || !sourceTransactionId || !dueDate) {
        return null;
      }

      return {
        installmentId,
        planId,
        planType,
        installmentNumber,
        months,
        dueDate,
        totalDue,
        paidAmount: Number.isFinite(paidAmount) ? paidAmount : 0,
        remainingAmount,
        sourceTransactionId,
        description
      } satisfies CreditOpenInstallmentItem;
    })
    .filter((row): row is CreditOpenInstallmentItem => Boolean(row));
}
