"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { AccountsSection } from "@/app/(app)/dashboard/_components/accounts-section";
import { BreakdownChart } from "@/app/(app)/dashboard/_components/breakdown-chart";
import { DashboardFoldSection } from "@/app/(app)/dashboard/_components/dashboard-fold-section";
import { DashboardMetricCards } from "@/app/(app)/dashboard/_components/dashboard-metric-cards";
import { DashboardToolbar } from "@/app/(app)/dashboard/_components/dashboard-toolbar";
import type { DashboardViewMode } from "@/app/(app)/dashboard/_components/dashboard-view-mode";
import { normalizeDashboardOverview, type DashboardOverviewResponse } from "@/lib/contracts/dashboard";

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
    monthExpense: 0,
    monthFinancialNet: 0
  },
  charts: {
    expenseByCategory: [],
    expenseBySubcategory: [],
    incomeByAccount: [],
    expenseByAccount: [],
    transferInByAccount: [],
    transferOutByAccount: []
  },
  creditSummary: {
    totalAvailable: 0,
    monthIncome: 0,
    monthExpense: 0,
    monthNet: 0,
    monthFinancialNet: 0,
    transferIn: 0,
    transferOut: 0,
    monthMsiExpense: 0,
    monthNormalExpense: 0,
    pendingMsi: 0,
    pendingNormal: 0
  },
  cashSummary: {
    total: 0,
    monthIncome: 0,
    monthExpense: 0,
    monthNet: 0,
    monthFinancialNet: 0
  },
  accounts: []
};

export function AccountsOverview() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedMonth = searchParams.get("month");
  const initialMonth = requestedMonth && /^\d{4}-\d{2}$/.test(requestedMonth) ? requestedMonth : getMexicoCurrentMonth();
  const [month, setMonth] = useState<string>(initialMonth);
  const [viewMode, setViewMode] = useState<DashboardViewMode>("detail");
  const [data, setData] = useState<DashboardOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const requestedMonth = searchParams.get("month");
    const resolvedMonth = requestedMonth && /^\d{4}-\d{2}$/.test(requestedMonth) ? requestedMonth : getMexicoCurrentMonth();

    if (resolvedMonth !== month) {
      setMonth(resolvedMonth);
    }
  }, [searchParams, month]);

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

        const payload = await response.json();
        if (isMounted) {
          setData(normalizeDashboardOverview(payload));
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
  const cashTotals = useMemo(
    () =>
      cashAccounts.reduce(
        (totals, account) => ({
          transferIn: totals.transferIn + account.monthTransferIn,
          transferOut: totals.transferOut + account.monthTransferOut
        }),
        { transferIn: 0, transferOut: 0 }
      ),
    [cashAccounts]
  );
  const timezone = overview.timezone || TIMEZONE;

  return (
    <div className="grid min-w-0 gap-5 sm:gap-6">
      <DashboardToolbar
        month={month}
        timezone={timezone}
        viewMode={viewMode}
        onMonthChange={(value) => {
          setMonth(value);
          const params = new URLSearchParams(searchParams.toString());
          params.set("month", value);
          router.replace(`${pathname}?${params.toString()}`, { scroll: false });
        }}
        onViewModeChange={setViewMode}
      />

      {loading ? (
        <DashboardOverviewSkeleton />
      ) : error ? (
        <Alert variant="danger">{error}</Alert>
      ) : (
        <>
      <DashboardFoldSection
        title="Resumen general"
        description="Vista mensual de ingresos, gastos y distribución operativa."
        defaultCollapsed
        storageKey="dashboard:general-section"
      >
        <div className="grid gap-4">
          <DashboardMetricCards
            items={[
              { title: "Ingresos del mes efectivo", subtitle: "Ingreso real", amount: overview.cashSummary.monthIncome, toneClass: "text-emerald-700 dark:text-emerald-400" },
              { title: "Gastos del mes efectivo", subtitle: "Gasto real + efectivo→crédito", amount: overview.cashSummary.monthExpense * -1, toneClass: "text-rose-700 dark:text-rose-400" },
              { title: "Neto del mes efectivo", subtitle: "Balance financiero", amount: overview.cashSummary.monthFinancialNet },
              { title: "Ingresos del mes crédito", subtitle: "Ingreso real + efectivo→crédito", amount: overview.creditSummary.monthIncome, toneClass: "text-emerald-700 dark:text-emerald-400" },
              { title: "Gastos del mes crédito", subtitle: "Gasto real + transferencias", amount: overview.creditSummary.monthExpense * -1, toneClass: "text-rose-700 dark:text-rose-400" },
              { title: "Neto del mes crédito", subtitle: "Balance financiero", amount: overview.creditSummary.monthFinancialNet }
            ]}
            columns="sm:grid-cols-2 xl:grid-cols-3"
          />

           <section className="grid gap-4">
             <BreakdownChart
               title="Gastos por categoría"
               description="Top de egresos mensuales agrupados por categoría, dividido entre efectivo y crédito."
               showFundingSplit
              items={overview.charts.expenseByCategory}
              emptyMessage="No hay gastos del mes por categoría."
            />
            <BreakdownChart
               title="Gastos por subcategoría"
               description="Top de egresos mensuales agrupados por subcategoría, dividido entre efectivo y crédito."
               showFundingSplit
              items={overview.charts.expenseBySubcategory}
              emptyMessage="No hay gastos del mes por subcategoría."
            />
           </section>
           <section className="grid gap-4">
             <BreakdownChart
               title="Ingresos por cuenta"
              description="Ingresos reales y transferencias de efectivo a crédito, por cuenta."
              items={overview.charts.incomeByAccount}
              emptyMessage="No hay ingresos del mes por cuenta."
              tone="emerald"
            />
            <BreakdownChart
              title="Gastos por cuenta"
              description="Gastos reales y transferencias hacia crédito o efectivo, por cuenta."
              items={overview.charts.expenseByAccount}
              emptyMessage="No hay gastos por cuenta del mes."
              tone="sky"
            />
          </section>
        </div>
      </DashboardFoldSection>

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
              { title: "Gastos MSI", amount: overview.creditSummary.monthMsiExpense, toneClass: "dashboard-money-credit" },
              { title: "Gastos normales", amount: overview.creditSummary.monthNormalExpense, toneClass: "dashboard-money-credit" }
            ]}
            columns="sm:grid-cols-3"
          />

          <DashboardMetricCards
            items={[
              { title: "Pendiente MSI", amount: overview.creditSummary.pendingMsi, toneClass: "dashboard-money-credit" },
              { title: "Pendiente normal", amount: overview.creditSummary.pendingNormal, toneClass: "dashboard-money-credit" }
            ]}
            columns="sm:grid-cols-2"
          />

          <AccountsSection
            title="Cuentas de crédito"
            description="Detalle por cuenta con corte, pago y comportamiento del periodo."
             accounts={creditAccounts}
             viewMode={viewMode}
             timezone={timezone}
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
              { title: "Ingresos", amount: overview.cashSummary.monthIncome, toneClass: "text-emerald-700 dark:text-emerald-400" },
              { title: "Gastos", amount: overview.cashSummary.monthExpense * -1, toneClass: "text-rose-700 dark:text-rose-400" },
              { title: "Transferencias ingreso", amount: cashTotals.transferIn, toneClass: "text-emerald-700 dark:text-emerald-400" }
            ]}
            columns="sm:grid-cols-3"
          />

          <DashboardMetricCards
            items={[
              { title: "Transferencias gasto", amount: cashTotals.transferOut * -1, toneClass: "text-rose-700 dark:text-rose-400" },
              { title: "Total efectivo", amount: overview.cashSummary.total }
            ]}
            columns="sm:grid-cols-2"
          />

          <AccountsSection
            title="Cuentas de efectivo"
            description="Detalle por cuenta de débito, ahorro o disponible mensual."
             accounts={cashAccounts}
             viewMode={viewMode}
             timezone={timezone}
             emptyMessage="No hay cuentas de efectivo registradas."
          />
        </div>
      </DashboardFoldSection>
        </>
      )}
    </div>
  );
}

function DashboardOverviewSkeleton() {
  return (
    <section className="grid gap-4" aria-busy="true">
      <span className="sr-only">Cargando resumen del dashboard</span>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-2xl border border-default bg-[var(--color-surface-1)]"
            aria-hidden="true"
          />
        ))}
      </div>
      <div className="grid gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-72 animate-pulse rounded-2xl border border-default bg-[var(--color-surface-1)]"
            aria-hidden="true"
          />
        ))}
      </div>
    </section>
  );
}
