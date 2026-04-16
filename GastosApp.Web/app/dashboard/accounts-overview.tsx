"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { type DashboardAccountOverview, type DashboardCreditOverview } from "@/lib/contracts/dashboard";
import { getBalanceToneClass } from "@/lib/accounts/metrics";

const TIMEZONE = "America/Mexico_City";

function getMexicoCurrentMonth(): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit"
  });

  const parts = formatter.formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;

  if (!year || !month) {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  }

  return `${year}-${month}`;
}

function formatAmount(value: number): string {
  return new Intl.NumberFormat("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

export function AccountsOverview() {
  const [month, setMonth] = useState<string>(() => getMexicoCurrentMonth());
  const [data, setData] = useState<DashboardCreditOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadDashboard() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/bff/dashboard/credit-overview?month=${encodeURIComponent(month)}`, { cache: "no-store" });
        if (!response.ok) {
          if (response.status === 401) {
            window.location.href = "/login";
            return;
          }

          throw new Error("No se pudo obtener dashboard");
        }

        const payload = (await response.json()) as DashboardCreditOverview;
        if (isMounted) {
          setData(payload);
        }
      } catch {
        if (isMounted) {
          setError("No se pudieron cargar los datos del dashboard");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void loadDashboard();

    return () => {
      isMounted = false;
    };
  }, [month]);

  const accounts = useMemo(() => data?.accounts ?? [], [data]);
  const timezone = data?.timezone ?? TIMEZONE;
  const summary = useMemo(
    () =>
      data?.summary ?? {
        cashTotal: 0,
        creditUsed: 0,
        pendingInformative: 0,
        monthExpenses: 0
      },
    [data]
  );
  const totalDebt = useMemo(
    () =>
      accounts
        .filter((account) => account.isCredit)
        .reduce((acc, account) => acc + ((account.creditLimit ?? 0) - account.currentBalance), 0),
    [accounts]
  );

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
        <MetricCard title="Total efectivo" amount={summary.cashTotal} />
        <MetricCard title="Total crédito" amount={summary.creditUsed} />
        <MetricCard title="Gastos totales" amount={totalDebt * -1} />
      </section>

      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="space-y-1">
            <h2 className="m-0 text-xl font-semibold text-slate-900 dark:text-slate-100">Cuentas</h2>
            <p className="m-0 text-xs text-slate-500 dark:text-slate-400">Corte por zona horaria: {timezone}</p>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400" htmlFor="dashboard-month">
              Mes
            </label>
            <input
              id="dashboard-month"
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-sky-500 dark:focus:ring-sky-900"
            />
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
              {accounts.length} registradas
            </span>
          </div>
        </div>

        {accounts.length === 0 ? (
          <p className="m-0 rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            No hay cuentas registradas.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {accounts.map((account) => <AccountCard key={account.accountId} account={account} />)}
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
        {formatAmount(amount)}
      </p>
    </Card>
  );
}

function AccountCard({ account }: { account: DashboardAccountOverview }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-sky-300 hover:shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:hover:border-sky-600">
      <p className="m-0 font-semibold text-slate-900 dark:text-slate-100">{account.name}</p>
      <p className="my-1.5 text-xs text-slate-500 dark:text-slate-400">
        {account.isCredit ? "Crédito" : "Efectivo"} · {account.active ? "Activa" : "Inactiva"}
      </p>
      <p className={`m-0 text-lg font-semibold ${getBalanceToneClass(account.currentBalance)}`}>{formatAmount(account.currentBalance)}</p>

      {account.isCredit ? <CreditDetails account={account} /> : null}
    </article>
  );
}

function CreditDetails({ account }: { account: DashboardAccountOverview }) {
  return (
    <div className="mt-2 space-y-1">
      {account.creditLimit !== null ? <CreditLimit amount={account.creditLimit} /> : null}
      <p className="m-0 text-xs text-slate-500 dark:text-slate-400">Día de corte: {account.cutoffDay ?? "No definido"}</p>
      <p className="m-0 text-xs text-slate-500 dark:text-slate-400">Fecha límite de pago: {account.paymentDueDay ?? "No definida"}</p>
      <p className="m-0 text-xs text-slate-500 dark:text-slate-400">
        Pendiente (informativo): <span className={`font-semibold ${getBalanceToneClass(account.pendingInformative)}`}>{formatAmount(account.pendingInformative)}</span>
      </p>
    </div>
  );
}

function CreditLimit({ amount }: { amount: number }) {
  return (
    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
      Límite: <span className={`font-semibold ${getBalanceToneClass(amount)}`}>{formatAmount(amount)}</span>
    </p>
  );
}
