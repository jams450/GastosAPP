"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { AccountsSection } from "@/app/dashboard/_components/accounts-section";
import { BreakdownChart } from "@/app/dashboard/_components/breakdown-chart";
import { DashboardFoldSection } from "@/app/dashboard/_components/dashboard-fold-section";
import { DashboardMetricCards } from "@/app/dashboard/_components/dashboard-metric-cards";
import { DashboardToolbar } from "@/app/dashboard/_components/dashboard-toolbar";
import type { DashboardViewMode } from "@/app/dashboard/_components/dashboard-view-mode";
import type { DashboardOverviewResponse } from "@/lib/contracts/dashboard";

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

const emptyOverview: DashboardOverviewResponse = {
  month: "",
  timezone: TIMEZONE,
  generalSummary: {
    monthIncome: 0,
    monthExpense: 0
  },
  charts: {
    expenseByCategory: [],
    expenseBySubcategory: [],
    incomeByAccount: [],
    transferByAccount: []
  },
  creditSummary: {
    totalAvailable: 0,
    monthIncome: 0,
    monthExpense: 0,
    monthNet: 0,
    monthMsiExpense: 0,
    monthNormalExpense: 0,
    pendingMsi: 0,
    pendingNormal: 0
  },
  cashSummary: {
    total: 0,
    monthIncome: 0,
    monthExpense: 0,
    monthNet: 0
  },
  accounts: []
};

export function AccountsOverview() {
  const [month, setMonth] = useState<string>(() => getMexicoCurrentMonth());
  const [viewMode, setViewMode] = useState<DashboardViewMode>("detail");
  const [data, setData] = useState<DashboardOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadDashboard() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/bff/dashboard/overview?month=${encodeURIComponent(month)}`, { cache: "no-store" });
        if (!response.ok) {
          if (response.status === 401) {
            window.location.href = "/login";
            return;
          }

          throw new Error("No se pudo obtener dashboard");
        }

        const payload = (await response.json()) as DashboardOverviewResponse;
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

  const overview = data ?? emptyOverview;
  const accounts = overview.accounts;
  const creditAccounts = useMemo(() => accounts.filter((account) => account.isCredit), [accounts]);
  const cashAccounts = useMemo(() => accounts.filter((account) => !account.isCredit), [accounts]);
  const timezone = overview.timezone || TIMEZONE;

  if (loading) {
    return <DashboardOverviewSkeleton />;
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

      <section className="grid gap-4">
        <div className="space-y-1">
          <h2 className="m-0 text-xl font-semibold text-slate-900 dark:text-slate-100">Resumen general</h2>
          <p className="m-0 text-sm text-slate-500 dark:text-slate-400">Vista mensual de ingresos, gastos y distribución operativa.</p>
        </div>

        <DashboardMetricCards
          items={[
            { title: "Ingresos del mes", amount: overview.generalSummary.monthIncome },
            { title: "Gastos del mes", amount: overview.generalSummary.monthExpense }
          ]}
          columns="sm:grid-cols-2"
        />

        <section className="grid gap-4 xl:grid-cols-2">
          <BreakdownChart
            title="Gastos por categoría"
            description="Top de egresos mensuales agrupados por categoría."
            items={overview.charts.expenseByCategory}
            emptyMessage="No hay gastos del mes por categoría."
            tone="rose"
          />
          <BreakdownChart
            title="Gastos por subcategoría"
            description="Top de egresos mensuales agrupados por subcategoría."
            items={overview.charts.expenseBySubcategory}
            emptyMessage="No hay gastos del mes por subcategoría."
            tone="violet"
          />
          <BreakdownChart
            title="Ingresos por cuenta"
            description="Ingresos del mes distribuidos por cuenta."
            items={overview.charts.incomeByAccount}
            emptyMessage="No hay ingresos del mes."
            tone="emerald"
          />
          <BreakdownChart
            title="Movimiento de transferencias por cuenta"
            description="Volumen mensual de transferencias por cuenta."
            items={overview.charts.transferByAccount}
            emptyMessage="No hay transferencias del mes."
            tone="sky"
          />
        </section>
      </section>

      <DashboardFoldSection
        title="Crédito"
        description="Tarjetas y líneas de crédito con resumen financiero mensual."
        badge={`${creditAccounts.length} cuentas`}
        defaultCollapsed
        storageKey="dashboard:credit-section"
      >
        <div className="grid gap-4">
          <DashboardMetricCards
            items={[
              { title: "Crédito disponible", amount: overview.creditSummary.totalAvailable },
              { title: "Ingresos del mes crédito", amount: overview.creditSummary.monthIncome },
              { title: "Gastos del mes crédito", amount: overview.creditSummary.monthExpense },
              { title: "Neto del mes", amount: overview.creditSummary.monthNet },
              { title: "Gastos MSI", amount: overview.creditSummary.monthMsiExpense, toneClass: "text-indigo-700 dark:text-indigo-400" },
              { title: "Gastos normales", amount: overview.creditSummary.monthNormalExpense, toneClass: "text-fuchsia-700 dark:text-fuchsia-400" },
              { title: "Pendiente MSI", amount: overview.creditSummary.pendingMsi, toneClass: "text-indigo-700 dark:text-indigo-400" },
              { title: "Pendiente normal", amount: overview.creditSummary.pendingNormal, toneClass: "text-fuchsia-700 dark:text-fuchsia-400" }
            ]}
          />

          <AccountsSection
            title="Cuentas de crédito"
            description="Detalle por cuenta con corte, pago y comportamiento del periodo."
            accounts={creditAccounts}
            viewMode={viewMode}
            emptyMessage="No hay cuentas de crédito registradas."
          />
        </div>
      </DashboardFoldSection>

      <DashboardFoldSection
        title="Efectivo"
        description="Cuentas de débito, ahorro y efectivo con flujo mensual."
        badge={`${cashAccounts.length} cuentas`}
        defaultCollapsed
        storageKey="dashboard:cash-section"
      >
        <div className="grid gap-4">
          <DashboardMetricCards
            items={[
              { title: "Total efectivo", amount: overview.cashSummary.total },
              { title: "Ingresos del mes efectivo", amount: overview.cashSummary.monthIncome },
              { title: "Gastos del mes efectivo", amount: overview.cashSummary.monthExpense },
              { title: "Neto del mes", amount: overview.cashSummary.monthNet }
            ]}
          />

          <AccountsSection
            title="Cuentas de efectivo"
            description="Detalle por cuenta de débito, ahorro o disponible mensual."
            accounts={cashAccounts}
            viewMode={viewMode}
            emptyMessage="No hay cuentas de efectivo registradas."
          />
        </div>
      </DashboardFoldSection>
    </div>
  );
}

function DashboardOverviewSkeleton() {
  return (
    <section className="grid gap-4">
      <div className="h-20 animate-pulse rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950" aria-hidden="true" />
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <div
            key={index}
            className="h-24 animate-pulse rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
            aria-hidden="true"
          />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-64 animate-pulse rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
            aria-hidden="true"
          />
        ))}
      </div>
      <div className="h-24 animate-pulse rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950" aria-hidden="true" />
      <div className="h-24 animate-pulse rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950" aria-hidden="true" />
    </section>
  );
}
