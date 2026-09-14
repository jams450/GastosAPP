"use client";

import { useMemo, useState } from "react";
import type { Account } from "@/lib/contracts/accounts";
import { ACCOUNTS_FILTER_DEFAULTS } from "../_lib/accounts-module-definition";

export type AccountsStatusFilter = "all" | "active" | "inactive";
export type AccountsTypeFilter = "all" | "credit" | "cash";

export function useAccountsFilters(accounts: Account[]) {
  const [search, setSearch] = useState<string>(ACCOUNTS_FILTER_DEFAULTS.search);
  const [status, setStatus] = useState<AccountsStatusFilter>(ACCOUNTS_FILTER_DEFAULTS.status);
  const [type, setType] = useState<AccountsTypeFilter>(ACCOUNTS_FILTER_DEFAULTS.type);

  const filteredAccounts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return accounts.filter((account) => {
      if (status === "active" && !account.active) return false;
      if (status === "inactive" && account.active) return false;
      if (type === "credit" && !account.isCredit) return false;
      if (type === "cash" && account.isCredit) return false;
      if (query && !account.name.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [accounts, search, status, type]);

  const hasActiveFilters = search.trim().length > 0 || status !== "all" || type !== "all";

  function resetFilters() {
    setSearch(ACCOUNTS_FILTER_DEFAULTS.search);
    setStatus(ACCOUNTS_FILTER_DEFAULTS.status);
    setType(ACCOUNTS_FILTER_DEFAULTS.type);
  }

  return {
    search,
    status,
    type,
    setSearch,
    setStatus,
    setType,
    filteredAccounts,
    hasActiveFilters,
    resetFilters
  };
}
