"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DashboardTabs } from "@/app/(app)/dashboard/_components/dashboard-tabs";
import { DashboardToolbar } from "@/app/(app)/dashboard/_components/dashboard-toolbar";
import { CreditoTab } from "@/app/(app)/dashboard/_components/tabs/credito-tab";
import { EfectivoTab } from "@/app/(app)/dashboard/_components/tabs/efectivo-tab";
import { ProyeccionTab } from "@/app/(app)/dashboard/_components/tabs/proyeccion-tab";
import { ResumenTab } from "@/app/(app)/dashboard/_components/tabs/resumen-tab";
import type { DashboardViewMode } from "@/app/(app)/dashboard/_components/dashboard-view-mode";
import {
  isMonthScopedTab,
  parseDashboardTab,
  parseHorizonMonths
} from "@/app/(app)/dashboard/_lib/dashboard-tabs";
import { redirectToLoginOnSessionExpired } from "@/lib/bff/client-session";
import {
  normalizeDashboardOverview,
  normalizeDashboardProjection,
  type DashboardOverviewResponse,
  type DashboardProjectionResponse
} from "@/lib/contracts/dashboard";

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
    totalLimit: 0,
    totalDebt: 0,
    totalNormalDebt: 0,
    totalMsiDebt: 0,
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

  const tab = parseDashboardTab(searchParams.get("tab"));
  const horizon = parseHorizonMonths(searchParams.get("horizon"));
  const monthScoped = isMonthScopedTab(tab);
  const currentMonth = getMexicoCurrentMonth();

  const requestedMonth = searchParams.get("month");
  const initialMonth = requestedMonth && /^\d{4}-\d{2}$/.test(requestedMonth) ? requestedMonth : currentMonth;

  const [month, setMonth] = useState<string>(initialMonth);
  const [viewMode, setViewMode] = useState<DashboardViewMode>("detail");
  const [data, setData] = useState<DashboardOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projection, setProjection] = useState<DashboardProjectionResponse | null>(null);
  const [projectionLoading, setProjectionLoading] = useState(true);
  const [projectionError, setProjectionError] = useState<string | null>(null);

  useEffect(() => {
    const requested = searchParams.get("month");
    const resolved = requested && /^\d{4}-\d{2}$/.test(requested) ? requested : getMexicoCurrentMonth();

    if (resolved !== month) {
      setMonth(resolved);
    }
  }, [searchParams, month]);

  // Crédito y proyección son snapshot actual: el mes seleccionado sólo aplica a Resumen y Efectivo.
  const overviewMonth = monthScoped ? month : currentMonth;

  useEffect(() => {
    let isMounted = true;

    async function loadDashboard() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/bff/dashboard/overview?month=${encodeURIComponent(overviewMonth)}`, { cache: "no-store" });
        if (!response.ok) {
          if (redirectToLoginOnSessionExpired(response)) {
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
  }, [overviewMonth]);

  // La proyección no depende del mes seleccionado; sí del horizonte (3/6/12).
  useEffect(() => {
    let isMounted = true;

    async function loadProjection() {
      setProjectionLoading(true);
      setProjectionError(null);

      try {
        const response = await fetch(`/api/bff/dashboard/projection?months=${horizon}`, { cache: "no-store" });
        if (!response.ok) {
          if (redirectToLoginOnSessionExpired(response)) {
            return;
          }

          throw new Error("No se pudo obtener la proyección");
        }

        const payload = await response.json();
        if (isMounted) {
          setProjection(normalizeDashboardProjection(payload));
        }
      } catch {
        if (isMounted) {
          setProjectionError("No se pudo cargar la proyección de efectivo");
        }
      } finally {
        if (isMounted) {
          setProjectionLoading(false);
        }
      }
    }

    void loadProjection();

    return () => {
      isMounted = false;
    };
  }, [horizon]);

  function updateUrl(next: { tab: string; month: string; horizon: number }) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", next.tab);
    params.set("month", next.month);
    params.set("horizon", String(next.horizon));
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const overview = data ?? emptyOverview;
  const timezone = overview.timezone || TIMEZONE;

  return (
    <div className="grid min-w-0 gap-5 sm:gap-6">
      <DashboardTabs activeTab={tab} onChange={(nextTab) => updateUrl({ tab: nextTab, month, horizon })} />

      <DashboardToolbar
        month={month}
        timezone={timezone}
        viewMode={viewMode}
        onMonthChange={(value) => {
          setMonth(value);
          updateUrl({ tab, month: value, horizon });
        }}
        onViewModeChange={setViewMode}
        showMonth={monthScoped}
        showViewMode={tab !== "proyeccion"}
        snapshotLabel={
          tab === "credito"
            ? "Snapshot al día de hoy: no depende del mes seleccionado"
            : tab === "proyeccion"
              ? "Escenario al día de hoy: no depende del mes seleccionado"
              : null
        }
      />

      <div
        role="tabpanel"
        id={`dashboard-panel-${tab}`}
        aria-labelledby={`dashboard-tab-${tab}`}
        tabIndex={0}
        className="min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-border-focus)]"
      >
        {tab === "resumen" ? (
          <ResumenTab overview={data} loading={loading} error={error} viewMode={viewMode} timezone={timezone} />
        ) : null}

        {tab === "efectivo" ? (
          <EfectivoTab overview={data} loading={loading} error={error} viewMode={viewMode} timezone={timezone} />
        ) : null}

        {tab === "credito" ? (
          <CreditoTab
            overview={data}
            loading={loading}
            error={error}
            projection={projection}
            projectionLoading={projectionLoading}
            projectionError={projectionError}
            viewMode={viewMode}
            timezone={timezone}
          />
        ) : null}

        {tab === "proyeccion" ? (
          <ProyeccionTab
            projection={projection}
            loading={projectionLoading}
            error={projectionError}
            horizon={horizon}
            onHorizonChange={(months) => updateUrl({ tab, month, horizon: months })}
            timezone={timezone}
          />
        ) : null}
      </div>
    </div>
  );
}
