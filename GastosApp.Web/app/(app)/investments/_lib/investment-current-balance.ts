import { normalizeAccounts, type Account } from "../../../../lib/contracts/accounts.ts";
import type { InvestmentProduct } from "../../../../lib/contracts/investments.ts";

/** Scope strict balance parsing to investments; unknown balances must not become zero. */
export function normalizeInvestmentAccounts(input: unknown): Account[] {
  if (!Array.isArray(input)) return [];
  return input.flatMap((value) => {
    const account = normalizeAccounts([value])[0];
    if (!account) return [];
    const raw = value as Record<string, unknown>;
    const balance = raw.currentBalance ?? raw.CurrentBalance;
    const valid = typeof balance === "number" || (typeof balance === "string" && /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(balance));
    return [{ ...account, currentBalance: valid && Number.isFinite(Number(balance)) ? Number(balance) : Number.NaN }];
  });
}

/** Catalog visibility is independent of linkage, eligibility, and plan generation. */
export function linkedCurrentBalance(product: Pick<InvestmentProduct, "accountId">, accounts: Account[]): number | null {
  if (product.accountId === null) return null;
  const matches = accounts.filter((account) => account.accountId === product.accountId);
  const account = matches.length === 1 ? matches[0] : null;
  return account?.active && !account.isCredit && account.earnsInterest && Number.isFinite(account.currentBalance) ? account.currentBalance : null;
}
