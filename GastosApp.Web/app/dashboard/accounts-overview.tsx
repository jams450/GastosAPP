"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { type Account } from "@/lib/contracts/accounts";
import { calculateAccountTotals, getBalanceToneClass } from "@/lib/accounts/metrics";
import { formatCurrency } from "@/lib/format/currency";

export function AccountsOverview() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadAccounts() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/bff/accounts", { cache: "no-store" });
        if (!response.ok) {
          if (response.status === 401) {
            window.location.href = "/login";
            return;
          }

          throw new Error("No se pudo obtener cuentas");
        }

        const data = (await response.json()) as Account[];
        if (isMounted) {
          setAccounts(data);
        }
      } catch {
        if (isMounted) {
          setError("No se pudieron cargar las cuentas");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void loadAccounts();

    return () => {
      isMounted = false;
    };
  }, []);

  const totals = useMemo(() => calculateAccountTotals(accounts), [accounts]);

  if (loading) {
    return (
      <section className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-24 animate-pulse rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
              aria-hidden="true"
            />
          ))}
        </div>
        <div className="h-48 animate-pulse rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950" aria-hidden="true" />
      </section>
    );
  }

  if (error) {
    return <Alert variant="danger">{error}</Alert>;
  }

  return (
    <div className="grid gap-6">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard title="Total efectivo" amount={totals.nonCredit} />
        <MetricCard title="Total crédito" amount={totals.credit} />
        <MetricCard title="Total deuda" amount={totals.deuda * -1} />
      </section>

      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="m-0 text-xl font-semibold text-slate-900 dark:text-slate-100">Cuentas</h2>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            {accounts.length} registradas
          </span>
        </div>

        {accounts.length === 0 ? (
          <p className="m-0 rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            No hay cuentas registradas.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {accounts.map((account) => (
                <article
                  key={account.accountId}
                  className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-sky-300 hover:shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:hover:border-sky-600"
                >
                  <p className="m-0 font-semibold text-slate-900 dark:text-slate-100">{account.name}</p>
                  <p className="my-1.5 text-xs text-slate-500 dark:text-slate-400">
                    {account.isCredit ? "Crédito" : "Efectivo"} · {account.active ? "Activa" : "Inactiva"}
                  </p>
                  <p className={`m-0 text-lg font-semibold ${getBalanceToneClass(account.currentBalance)}`}>
                    {formatCurrency(account.currentBalance)}
                  </p>

                  {account.isCredit && account.creditLimit !== null ? <CreditLimit amount={account.creditLimit} /> : null}
              </article>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function MetricCard({ title, amount }: { title: string; amount: number }) {
  return (
    <Card className="rounded-2xl p-4">
      <p className="m-0 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</p>
      <p className={`mt-2 text-2xl font-semibold ${getBalanceToneClass(amount)}`}>
        {formatCurrency(amount)}
      </p>
    </Card>
  );
}

function CreditLimit({ amount }: { amount: number }) {
  return (
    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
      Límite: <span className={`font-semibold ${getBalanceToneClass(amount)}`}>{formatCurrency(amount)}</span>
    </p>
  );
}
