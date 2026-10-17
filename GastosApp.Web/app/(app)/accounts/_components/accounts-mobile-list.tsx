import Link from "next/link";
import type { Account } from "@/lib/contracts/accounts";
import { formatCurrency } from "@/lib/format/currency";
import { AlertCircle, History, Inbox } from "lucide-react";
import { accountAnnualSummaryHref } from "../_lib/accounts-annual-ui";
import {
  ACCOUNT_METRIC_UNAVAILABLE_LABEL,
  accountMetricValue,
  getAccountMetricLabel,
  getAccountStatusBadgeClass,
  getAccountStatusLabel,
  getAccountTypeBadgeClass,
  getAccountTypeLabel,
  type AccountsCatalogSection
} from "../_lib/accounts-ui";
import { AccountActionsMenu } from "./account-actions-menu";

type Props = {
  section: AccountsCatalogSection;
  loading: boolean;
  errorMessage?: string | null;
  onEdit: (account: Account) => void;
  onToggleActive: (account: Account) => void;
};

function formatMetric(value: number | null): string {
  return value === null ? ACCOUNT_METRIC_UNAVAILABLE_LABEL : formatCurrency(value);
}

export function AccountsMobileList({ section, loading, errorMessage, onEdit, onToggleActive }: Props) {
  const rows = section.accounts;

  if (loading) {
    return (
      <div className="space-y-2.5 md:hidden" role="status" aria-live="polite" aria-label={`Cargando cuentas de ${section.title.toLowerCase()}`}>
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="animate-pulse border border-default bg-[var(--color-surface-2)] p-3">
            <div className="h-3 w-28 rounded-none bg-[var(--color-surface-3)]" />
            <div className="mt-2 h-2.5 w-44 rounded-none bg-[var(--color-surface-3)]" />
            <div className="mt-3 h-8 rounded-none bg-[var(--color-surface-3)]" />
          </div>
        ))}
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="border-[var(--color-danger)]/35 bg-[var(--color-danger)]/12 p-4 text-[var(--color-danger)] md:hidden" role="alert" aria-live="assertive">
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="text-sm font-bold">Error al cargar cuentas</p>
            <p className="mt-1 text-xs font-medium">{errorMessage}</p>
          </div>
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="border-default bg-[var(--color-surface-2)] px-3 py-6 text-center md:hidden" role="status" aria-live="polite">
        <Inbox className="text-muted mx-auto h-6 w-6" aria-hidden="true" />
        <p className="text-primary mt-2 text-sm font-bold">Sin resultados</p>
        <p className="text-muted mt-1 text-xs">No hay cuentas de {section.title.toLowerCase()} con filtros actuales.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 md:hidden">
      {rows.map((account) => (
        <article key={account.accountId} className="border border-default bg-[var(--color-surface-2)] p-3">
          <header className="flex items-start justify-between gap-2 pb-2">
            <div className="min-w-0">
              <Link
                href={accountAnnualSummaryHref(account.accountId)}
                className="focus-ring group inline-flex flex-col items-start gap-0.5"
                title={`Ver histórico anual de ${account.name}`}
                aria-label={`Ver histórico anual de ${account.name}`}
              >
                <span className="text-primary text-sm font-extrabold group-hover:underline">{account.name}</span>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--color-accent)] group-hover:underline">
                  <History className="h-3.5 w-3.5" aria-hidden="true" />
                  Ver histórico anual
                </span>
              </Link>
              <dl className="mt-1.5 space-y-0.5">
                {section.metrics.map((metric) => {
                  const value = accountMetricValue(account, metric);
                  return (
                    <div key={metric} className="flex items-baseline justify-between gap-3 text-xs">
                      <dt className="text-muted">{getAccountMetricLabel(metric)}</dt>
                      <dd
                        className={
                          value === null
                            ? "text-muted text-[11px] font-medium tabular-nums"
                            : "text-primary text-right font-semibold tabular-nums"
                        }
                      >
                        {formatMetric(value)}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </div>
            <span className="sr-only">Cuenta activa para acciones rápidas</span>
          </header>

          <div className="flex flex-wrap items-center gap-2 py-2">
            <span className={getAccountTypeBadgeClass(account)}>{getAccountTypeLabel(account)}</span>
            <span className={getAccountStatusBadgeClass(account)}>{getAccountStatusLabel(account)}</span>
          </div>

          <footer>
            <AccountActionsMenu account={account} mobile onEdit={onEdit} onToggleActive={onToggleActive} />
          </footer>
        </article>
      ))}
    </div>
  );
}
