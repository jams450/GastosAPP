import type { Account } from "@/lib/contracts/accounts";

export type AccountTotals = {
  deuda: number;
  nonCredit: number;
  credit: number;
};

export function calculateAccountTotals(accounts: Account[]): AccountTotals {
  return accounts.reduce<AccountTotals>(
    (acc, account) => {
      if (account.isCredit) {
        acc.credit += account.currentBalance;
        acc.deuda += Number(account.creditLimit) - account.currentBalance;
      } else {
        acc.nonCredit += account.currentBalance;
      }
      return acc;
    },
    { deuda: 0, nonCredit: 0, credit: 0 }
  );
}

export function getBalanceToneClass(amount: number): string {
  if (amount > 0) return "text-emerald-700 dark:text-emerald-400";
  if (amount < 0) return "text-rose-700 dark:text-rose-400";
  return "text-slate-900 dark:text-slate-100";
}



