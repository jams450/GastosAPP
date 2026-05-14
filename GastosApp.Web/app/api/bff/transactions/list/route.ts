import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { attachSessionCookie, fetchApiWithAutoRefresh } from "@/lib/auth/api-session";
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
  allocations: {
    transactionAllocationId: number;
    billablePartyId: number;
    billablePartyName: string;
    allocationMode: "percentage" | "amount";
    allocationValue: number;
    calculatedAmount: number;
  }[];
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

  const rawTags = input.tags ?? input.Tags;
  const normalizedTags = Array.isArray(rawTags)
    ? rawTags
        .filter((tag): tag is string => typeof tag === "string")
        .map((tag) => tag.trim())
        .filter(Boolean)
    : [];

  const rawAllocations = input.allocations ?? input.Allocations;
  const allocations = Array.isArray(rawAllocations)
    ? rawAllocations
        .filter((row): row is UnknownRecord => isRecord(row))
        .map((row) => {
          const transactionAllocationId = toNumber(row.transactionAllocationId ?? row.TransactionAllocationId);
          const billablePartyId = toNumber(row.billablePartyId ?? row.BillablePartyId);
          const allocationValue = toNumber(row.allocationValue ?? row.AllocationValue);
          const calculatedAmount = toNumber(row.calculatedAmount ?? row.CalculatedAmount);
          const allocationModeRaw = row.allocationMode ?? row.AllocationMode;
          const allocationMode: "percentage" | "amount" | null =
            allocationModeRaw === "amount" ? "amount" : allocationModeRaw === "percentage" ? "percentage" : null;
          if (transactionAllocationId === null || billablePartyId === null || allocationValue === null || calculatedAmount === null || !allocationMode) {
            return null;
          }

          return {
            transactionAllocationId,
            billablePartyId,
            billablePartyName: typeof (row.billablePartyName ?? row.BillablePartyName) === "string" ? String(row.billablePartyName ?? row.BillablePartyName) : "Responsable",
            allocationMode,
            allocationValue,
            calculatedAmount
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null)
    : [];

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
    tags: normalizedTags,
    creditMonths: null,
    creditRemainingAmount: null,
    creditStatus: null,
    allocations
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

function getMonthRangeUtc(month: string): { startIso: string; endIso: string } {
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthNumber = Number(monthText);
  const startUtc = new Date(Date.UTC(year, monthNumber - 1, 1, 0, 0, 0, 0));
  const endUtc = new Date(Date.UTC(year, monthNumber, 0, 23, 59, 59, 999));
  return { startIso: startUtc.toISOString(), endIso: endUtc.toISOString() };
}

export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  let authSession = session;

  const { searchParams } = new URL(request.url);
  const month = (searchParams.get("month") ?? currentMonth()).trim();
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ message: "month must use YYYY-MM format" }, { status: 400 });
  }

  const accountsCall = await fetchApiWithAutoRefresh(authSession, `${getApiBaseUrl()}/api/accounts`, {
    method: "GET",
    cache: "no-store"
  });
  const accountsResponse = accountsCall.response;
  authSession = accountsCall.session;

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

  const { startIso, endIso } = getMonthRangeUtc(month);
  const transactionsByAccount: unknown[] = [];

  for (const account of accounts) {
    const call = await fetchApiWithAutoRefresh(
      authSession,
      `${getApiBaseUrl()}/api/transactions/account/${account.accountId}/date-range?startDate=${encodeURIComponent(startIso)}&endDate=${encodeURIComponent(endIso)}`,
      {
        method: "GET",
        cache: "no-store"
      }
    );
    authSession = call.session;
    if (!call.response.ok) {
      const body = (await call.response.json().catch(() => null)) as { message?: string; Message?: string } | null;
      return NextResponse.json(
        { message: body?.message ?? body?.Message ?? "Failed to load transactions" },
        { status: call.response.status }
      );
    }

    transactionsByAccount.push(await call.response.json().catch(() => []));
  }

  const accountNameById = new Map(accounts.map((account) => [account.accountId, account.name]));

  const transactions = transactionsByAccount
    .flatMap((items) => (Array.isArray(items) ? items : []))
    .map((item) => normalizeTransaction(item))
    .filter((item): item is TransactionListItem => item !== null)
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
    const summariesCall = await fetchApiWithAutoRefresh(authSession, `${getApiBaseUrl()}/api/transactions/credit/charge-summaries`, {
      method: "POST",
      cache: "no-store",
      body: JSON.stringify({ sourceTransactionIds: creditExpenseIds })
    });
    const summariesResponse = summariesCall.response;
    authSession = summariesCall.session;

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

  const out = NextResponse.json({ month, transactions });
  await attachSessionCookie(out, authSession, session);
  return out;
}
