import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { getServerSession } from "@/lib/auth/session";

type UnknownRecord = Record<string, unknown>;
const TRANSACTIONS_TIMEZONE = "America/Mexico_City";

type TransactionListItem = {
  transactionId: number;
  accountId: number;
  categoryId: number | null;
  subcategoryId: number | null;
  merchantId: number | null;
  type: "income" | "expense" | "transfer" | "opening_credit";
  transferGroupId: string | null;
  amount: number;
  description: string;
  transactionDate: string;
  tags: string[];
  creditMonths: number | null;
  creditRemainingAmount: number | null;
  creditStatus: string | null;
};

type CreditChargeSummary = {
  sourceTransactionId: number;
  months: number;
  remainingAmount: number;
  status: string;
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function toNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toOptionalNumber(value: unknown): number | null {
  const parsed = toNumber(value);
  return parsed === null ? null : parsed;
}

function normalizeTransaction(input: unknown): TransactionListItem | null {
  if (!isRecord(input)) {
    return null;
  }

  const transactionId = toNumber(input.transactionId ?? input.TransactionId);
  const accountId = toNumber(input.accountId ?? input.AccountId);
  const amount = toNumber(input.amount ?? input.Amount);
  const typeRaw = input.type ?? input.Type;
  const type = typeof typeRaw === "string" ? typeRaw.toLowerCase() : "";
  const transactionDateRaw = input.transactionDate ?? input.TransactionDate;
  const transactionDate = typeof transactionDateRaw === "string" ? transactionDateRaw : "";

  if (
    transactionId === null ||
    accountId === null ||
    amount === null ||
    !(type === "income" || type === "expense" || type === "transfer" || type === "opening_credit") ||
    !transactionDate
  ) {
    return null;
  }

  return {
    transactionId,
    accountId,
    categoryId: toOptionalNumber(input.categoryId ?? input.CategoryId),
    subcategoryId: toOptionalNumber(input.subcategoryId ?? input.SubcategoryId),
    merchantId: toOptionalNumber(input.merchantId ?? input.MerchantId),
    type,
    transferGroupId: typeof (input.transferGroupId ?? input.TransferGroupId) === "string" ? String(input.transferGroupId ?? input.TransferGroupId) : null,
    amount,
    description: typeof (input.description ?? input.Description) === "string" ? String(input.description ?? input.Description) : "",
    transactionDate,
    tags: Array.isArray(input.tags ?? input.Tags)
      ? (input.tags ?? input.Tags).filter((tag): tag is string => typeof tag === "string").map((tag) => tag.trim()).filter(Boolean)
      : [],
    creditMonths: null,
    creditRemainingAmount: null,
    creditStatus: null
  };
}

function normalizeCreditSummary(input: unknown): CreditChargeSummary | null {
  if (!isRecord(input)) return null;
  const sourceTransactionId = toNumber(input.sourceTransactionId ?? input.SourceTransactionId);
  const months = toNumber(input.months ?? input.Months);
  const remainingAmount = toNumber(input.remainingAmount ?? input.RemainingAmount);
  const statusRaw = input.status ?? input.Status;
  const status = typeof statusRaw === "string" ? statusRaw : "";
  if (sourceTransactionId === null || months === null || remainingAmount === null || !status) {
    return null;
  }
  return { sourceTransactionId, months, remainingAmount, status };
}

function getYearMonthInTimezone(dateIso: string, timezone: string): string | null {
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return null;

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit"
  });

  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  if (!year || !month) return null;

  return `${year}-${month}`;
}

function currentMonth(timezone = TRANSACTIONS_TIMEZONE) {
  const month = getYearMonthInTimezone(new Date().toISOString(), timezone);
  if (month) return month;

  const date = new Date();
  const year = date.getFullYear();
  const monthFallback = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${monthFallback}`;
}

function isTransactionInMonth(dateIso: string, month: string, timezone = TRANSACTIONS_TIMEZONE) {
  return getYearMonthInTimezone(dateIso, timezone) === month;
}

export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const month = (searchParams.get("month") ?? currentMonth()).trim();
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ message: "month must use YYYY-MM format" }, { status: 400 });
  }

  const headers = {
    Authorization: `Bearer ${session.accessToken}`,
    "Content-Type": "application/json"
  };

  const accountsResponse = await fetch(`${getApiBaseUrl()}/api/accounts`, {
    method: "GET",
    headers,
    cache: "no-store"
  });

  if (!accountsResponse.ok) {
    const body = (await accountsResponse.json().catch(() => null)) as { message?: string; Message?: string } | null;
    return NextResponse.json(
      { message: body?.message ?? body?.Message ?? "Failed to load accounts" },
      { status: accountsResponse.status }
    );
  }

  const accountsRaw = (await accountsResponse.json().catch(() => [])) as unknown;
  const accounts = Array.isArray(accountsRaw)
    ? accountsRaw
        .filter((value): value is UnknownRecord => isRecord(value))
        .map((value) => {
          const accountId = toNumber(value.accountId ?? value.AccountId);
          const nameRaw = value.name ?? value.Name;
          const name = typeof nameRaw === "string" ? nameRaw.trim() : "";
          if (accountId === null || !name) {
            return null;
          }

          const isCredit = value.isCredit === true || value.IsCredit === true;
          return { accountId, name, isCredit };
        })
        .filter((value): value is { accountId: number; name: string; isCredit: boolean } => value !== null)
    : [];

  const transactionResponses = await Promise.all(
    accounts.map((account) =>
      fetch(
        `${getApiBaseUrl()}/api/transactions/account/${account.accountId}`,
        {
          method: "GET",
          headers,
          cache: "no-store"
        }
      )
    )
  );

  const failed = transactionResponses.find((response) => !response.ok);
  if (failed) {
    const body = (await failed.json().catch(() => null)) as { message?: string; Message?: string } | null;
    return NextResponse.json(
      { message: body?.message ?? body?.Message ?? "Failed to load transactions" },
      { status: failed.status }
    );
  }

  const transactionsByAccount = await Promise.all(transactionResponses.map((response) => response.json().catch(() => [])));

  const accountNameById = new Map(accounts.map((account) => [account.accountId, account.name]));

  const transactions = transactionsByAccount
    .flatMap((items) => (Array.isArray(items) ? items : []))
    .map((item) => normalizeTransaction(item))
    .filter((item): item is TransactionListItem => item !== null)
    .filter((item) => isTransactionInMonth(item.transactionDate, month))
    .map((item) => ({
      ...item,
      accountName: accountNameById.get(item.accountId) ?? "Cuenta"
    }))
    .sort((a, b) => new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime());

  const creditAccountIds = new Set(accounts.filter((account) => account.isCredit).map((account) => account.accountId));
  const creditExpenseIds = transactions
    .filter((item) => item.type === "expense" && creditAccountIds.has(item.accountId))
    .map((item) => item.transactionId);

  if (creditExpenseIds.length > 0) {
    const summariesResponse = await fetch(`${getApiBaseUrl()}/api/transactions/credit/charge-summaries`, {
      method: "POST",
      headers,
      cache: "no-store",
      body: JSON.stringify({ sourceTransactionIds: creditExpenseIds })
    });

    if (summariesResponse.ok) {
      const summariesRaw = (await summariesResponse.json().catch(() => [])) as unknown;
      const summaries = Array.isArray(summariesRaw)
        ? summariesRaw.map((item) => normalizeCreditSummary(item)).filter((item): item is CreditChargeSummary => item !== null)
        : [];

      const summaryByTxId = new Map(summaries.map((summary) => [summary.sourceTransactionId, summary]));
      for (const item of transactions) {
        const summary = summaryByTxId.get(item.transactionId);
        if (!summary) continue;
        item.creditMonths = summary.months;
        item.creditRemainingAmount = summary.remainingAmount;
        item.creditStatus = summary.status;
      }
    }
  }

  return NextResponse.json({ month, transactions });
}
