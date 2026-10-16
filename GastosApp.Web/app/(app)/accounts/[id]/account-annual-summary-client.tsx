"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/navigation/page-header";
import { Button } from "@/components/ui/button";
import { parseAnnualSummaryYear } from "@/lib/contracts/account-annual-summary";
import { AccountAnnualYearSelector } from "../_components/account-annual-year-selector";
import { AnnualBalanceLine, AnnualFlowBars } from "../_components/annual-summary-charts";
import { AnnualSummaryKpis } from "../_components/annual-summary-kpis";
import { AnnualSummaryTable } from "../_components/annual-summary-table";
import { useAccountAnnualSummary } from "../_hooks/use-account-annual-summary";
import { ANNUAL_HISTORY_TAB, annualSummaryCopy, earliestSummaryYear } from "../_lib/accounts-annual-ui";

type Props = {
  accountId: number;
  /** Año del primer render, ya resuelto en el servidor; la URL manda después. */
  initialYear: number;
  currentYear: number;
};

/** Anclas de la propia página: el año y la pestaña siguen viviendo en la URL. */
const ANNUAL_SECTIONS = [
  { id: "resumen", label: "Resumen" },
  { id: "graficas", label: "Gráficas" },
  { id: "detalle", label: "Detalle mensual" }
] as const;

export function AccountAnnualSummaryClient({ accountId, initialYear, currentYear }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const year = parseAnnualSummaryYear(searchParams.get("year"), initialYear);
  const { account, summary, loading, error, reload } = useAccountAnnualSummary(accountId, year);

  // El año vive en la URL para que el enlace sea compartible: se normaliza en cuanto se conoce.
  useEffect(() => {
    if (searchParams.get("year") === String(year) && searchParams.get("tab") === ANNUAL_HISTORY_TAB) {
      return;
    }

    router.replace(`${pathname}?tab=${ANNUAL_HISTORY_TAB}&year=${year}`, { scroll: false });
  }, [pathname, router, searchParams, year]);

  const copy = useMemo(() => annualSummaryCopy(account?.isCredit ?? false), [account?.isCredit]);
  const earliestYear = earliestSummaryYear(account?.startDate ?? null, currentYear);
  const accountKind = account === null ? null : account.isCredit ? "Crédito" : "Efectivo";

  function goToYear(nextYear: number) {
    router.replace(`${pathname}?tab=${ANNUAL_HISTORY_TAB}&year=${nextYear}`, { scroll: false });
  }

  return (
    <>
      <PageHeader
        section="Cuentas"
        title={account?.name ?? `Cuenta #${accountId}`}
        subtitle={accountKind ? `Histórico anual ${year} · ${accountKind}` : `Histórico anual ${year}`}
        variant="plain"
        meta={
          <AccountAnnualYearSelector
            year={year}
            earliestYear={earliestYear}
            latestYear={currentYear}
            disabled={loading}
            onChange={goToYear}
          />
        }
        actions={
          <Link
            href="/accounts"
            className="btn-secondary-semantic focus-ring inline-flex h-10 items-center justify-center gap-2 px-4 text-sm font-semibold"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Volver a cuentas
          </Link>
        }
      />

      {summary ? (
        <nav aria-label="Secciones del histórico anual" className="flex flex-wrap items-center gap-2">
          <span className="text-muted text-[11px] font-semibold uppercase tracking-[0.08em]">Ir a</span>
          {ANNUAL_SECTIONS.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="btn-secondary-semantic focus-ring inline-flex h-8 items-center px-3 text-xs font-semibold"
            >
              {section.label}
            </a>
          ))}
        </nav>
      ) : null}

      <section className="space-y-4" aria-busy={loading}>
        {error ? (
          <div className="border-[var(--color-danger)]/35 bg-[var(--color-danger)]/12 p-4 text-[var(--color-danger)]" role="alert" aria-live="assertive">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <p className="m-0 text-sm font-bold">Error al cargar el histórico anual</p>
                <p className="m-0 mt-1 text-xs font-medium">{error}</p>
              </div>
            </div>
            <Button type="button" variant="secondary" className="mt-3" onClick={reload}>
              Reintentar
            </Button>
          </div>
        ) : null}

        {loading && !summary ? <AnnualSummarySkeleton /> : null}

        {summary ? (
          <>
            <section id="resumen" className="scroll-mt-24 space-y-3" aria-label={`Resumen del año ${summary.year}`}>
              <h2 className="text-primary m-0 text-base font-semibold">Resumen del año</h2>
              <AnnualSummaryKpis summary={summary} copy={copy} />
            </section>

            <section id="graficas" className="scroll-mt-24 space-y-3" aria-label={`Gráficas del año ${summary.year}`}>
              <h2 className="text-primary m-0 text-base font-semibold">Gráficas del año</h2>
              <div className="grid gap-4">
                <AnnualFlowBars months={summary.months} year={summary.year} caption={copy.flowCaption} />
                <AnnualBalanceLine months={summary.months} year={summary.year} caption={copy.yearCaption} />
              </div>
            </section>

            <section id="detalle" className="scroll-mt-24 space-y-3" aria-label={`Detalle mensual ${summary.year}`}>
              <h2 className="text-primary m-0 text-base font-semibold">Detalle mensual</h2>
              <AnnualSummaryTable summary={summary} />
            </section>
          </>
        ) : null}
      </section>
    </>
  );
}

function AnnualSummarySkeleton() {
  return (
    <div className="space-y-4" role="status" aria-live="polite" aria-label="Cargando histórico anual">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="app-card animate-pulse p-4">
            <div className="h-3 w-24 rounded-none bg-[var(--color-surface-3)]" />
            <div className="mt-4 h-7 w-32 rounded-none bg-[var(--color-surface-3)]" />
          </div>
        ))}
      </div>
      <div className="app-card animate-pulse p-4">
        <div className="h-4 w-40 rounded-none bg-[var(--color-surface-3)]" />
        <div className="mt-4 h-56 rounded-none bg-[var(--color-surface-3)]" />
      </div>
    </div>
  );
}
