"use client";

import { useCallback, useEffect, useState } from "react";
import type { AccountAnnualSummary } from "@/lib/contracts/account-annual-summary";
import type { Account } from "@/lib/contracts/accounts";
import { getAccountAnnualSummary, listAccounts } from "../_lib/accounts-api";

export function useAccountAnnualSummary(accountId: number, year: number) {
  const [account, setAccount] = useState<Account | null>(null);
  const [summary, setSummary] = useState<AccountAnnualSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    // Se descarta el resumen anterior para no mostrar cifras de otro año bajo el año pedido.
    setSummary(null);

    // El resumen es la fuente crítica del histórico. El nombre y el tipo de cuenta son
    // accesorios: si esa lista falla se usa el identificador, no se pierde el año consultado.
    const summaryPromise = getAccountAnnualSummary(accountId, year);
    const accountsPromise = listAccounts().catch(() => [] as Account[]);

    Promise.all([summaryPromise, accountsPromise])
      .then(([data, accounts]) => {
        if (cancelled) return;
        setSummary(data);
        setAccount(accounts.find((item) => item.accountId === accountId) ?? null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "No se pudo cargar el histórico anual");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accountId, year, reloadToken]);

  return { account, summary, loading, error, reload };
}
