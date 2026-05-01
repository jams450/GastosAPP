import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { getServerSession } from "@/lib/auth/session";

type UnknownRecord = Record<string, unknown>;

type TransactionListItem = {
  transactionId: number;
  accountId: number;
  categoryId: number | null;
  subcategoryId: number | null;
  merchantId: number | null;
  type: "income" | "expense" | "transfer";
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

  const transactionId = toNumber(input.transactionId);
  const accountId = toNumber(input.accountId);
  const amount = toNumber(input.amount);
  const type = typeof input.type === "string" ? input.type.toLowerCase() : "";
  const transactionDate = typeof input.transactionDate === "string" ? input.transactionDate : "";

  if (
    transactionId === null ||
    accountId === null ||
    amount === null ||
    !(type === "income" || type === "expense" || type === "transfer") ||
    !transactionDate
  ) {
    return null;
  }

  return {
    transactionId,
    accountId,
    categoryId: toOptionalNumber(input.categoryId),
    subcategoryId: toOptionalNumber(input.subcategoryId),
    merchantId: toOptionalNumber(input.merchantId),
    type,
    transferGroupId: typeof input.transferGroupId === "string" ? input.transferGroupId : null,
    amount,
    description: typeof input.description === "string" ? input.description : "",
    transactionDate,
    tags: Array.isArray(input.tags)
      ? input.tags.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.trim()).filter(Boolean)
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

function monthWindow(month: string) {
  const start = new Date(`${month}-01T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) {
    return null;
  }

  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  end.setUTCMilliseconds(end.getUTCMilliseconds() - 1);

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString()
  };
}

function currentMonth() {
  const date = new Date();
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
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

  const window = monthWindow(month);
  if (!window) {
    return NextResponse.json({ message: "Invalid month" }, { status: 400 });
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
          const accountId = toNumber(value.accountId);
          const name = typeof value.name === "string" ? value.name.trim() : "";
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
        `${getApiBaseUrl()}/api/transactions/account/${account.accountId}/date-range?startDate=${encodeURIComponent(window.startIso)}&endDate=${encodeURIComponent(window.endIso)}`,
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
