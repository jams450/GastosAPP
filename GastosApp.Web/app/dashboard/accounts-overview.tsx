"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { AccountsSection } from "@/app/dashboard/_components/accounts-section";
import { DashboardToolbar } from "@/app/dashboard/_components/dashboard-toolbar";
import { SummaryCards } from "@/app/dashboard/_components/summary-cards";
import type { DashboardViewMode } from "@/app/dashboard/_components/dashboard-view-mode";
import { type DashboardCreditOverview } from "@/lib/contracts/dashboard";

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

export function AccountsOverview() {
  const [month, setMonth] = useState<string>(() => getMexicoCurrentMonth());
  const [viewMode, setViewMode] = useState<DashboardViewMode>("detail");
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
  const creditAccounts = useMemo(() => accounts.filter((account) => account.isCredit), [accounts]);
  const cashAccounts = useMemo(() => accounts.filter((account) => !account.isCredit), [accounts]);
  const timezone = data?.timezone ?? TIMEZONE;
  const summary = useMemo(
    () =>
      data?.summary ?? {
        cashTotal: 0,
        creditUsed: 0,
        totalDebt: 0,
        monthIncome: 0,
        monthExpense: 0
      },
    [data]
  );

  if (loading) {
    return (
      <section className="grid gap-4">
        <div className="h-20 animate-pulse rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950" aria-hidden="true" />
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
        <div className="h-48 animate-pulse rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950" aria-hidden="true" />
      </section>
    );
  }

  if (error) {
    return <Alert variant="danger">{error}</Alert>;
  }

  return (
    <div className="grid gap-6">
      <DashboardToolbar
        month={month}
        timezone={timezone}
        viewMode={viewMode}
        onMonthChange={setMonth}
        onViewModeChange={setViewMode}
      />

      <SummaryCards summary={summary} />

      <AccountsSection
        title="Crédito"
        description="Tarjetas de crédito y líneas con control de deuda mensual."
        accounts={creditAccounts}
        viewMode={viewMode}
        emptyMessage="No hay cuentas de crédito registradas."
      />

      <AccountsSection
        title="Efectivo"
        description="Cuentas de débito, efectivo o ahorro con seguimiento de flujo mensual."
        accounts={cashAccounts}
        viewMode={viewMode}
        emptyMessage="No hay cuentas de efectivo registradas."
      />
    </div>
  );
}
