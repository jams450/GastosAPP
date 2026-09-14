"use client";

import { useCallback, useEffect, useState } from "react";
import type { Account } from "@/lib/contracts/accounts";
import type { AccountUpsertPayload } from "@/lib/contracts/accounts-admin";
import { createAccount, listAccounts, patchAccountActive, updateAccount } from "../_lib/accounts-api";

export function useAccountsAdmin() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAccounts(await listAccounts());
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar cuentas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const create = useCallback(async (payload: AccountUpsertPayload) => {
    setError(null);
    await createAccount(payload);
    await reload();
  }, [reload]);

  const update = useCallback(async (accountId: number, payload: AccountUpsertPayload) => {
    setError(null);
    await updateAccount(accountId, payload);
    await reload();
  }, [reload]);

  const toggleActive = useCallback(async (account: Account) => {
    setError(null);
    await patchAccountActive(account.accountId, !account.active);
    await reload();
  }, [reload]);

  return {
    accounts,
    loading,
    error,
    setError,
    reload,
    create,
    update,
    toggleActive
  };
}
