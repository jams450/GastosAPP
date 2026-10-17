"use client";

import { useMemo } from "react";
import Link from "next/link";
import { History } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataGrid } from "@/components/data-grid/data-grid";
import type { Account } from "@/lib/contracts/accounts";
import { formatCurrency } from "@/lib/format/currency";
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

export function AccountsTable({ section, loading, errorMessage, onEdit, onToggleActive }: Props) {
  const columns = useMemo<ColumnDef<Account>[]>(() => {
    const metricColumns: ColumnDef<Account>[] = section.metrics.map((metric) => ({
      id: metric,
      header: getAccountMetricLabel(metric),
      cell: ({ row }) => {
        const value = accountMetricValue(row.original, metric);
        return (
          <span
            className={
              value === null
                ? "text-muted block text-right text-[11px] font-medium tabular-nums"
                : "block text-right font-semibold tabular-nums"
            }
          >
            {formatMetric(value)}
          </span>
        );
      }
    }));

    // Corte y pago límite solo aplican a crédito; en efectivo no se inventan columnas.
    const scheduleColumns: ColumnDef<Account>[] =
      section.key === "credit"
        ? [
            {
              id: "dueDay",
              header: "Corte",
              cell: ({ row }) => <span className="block text-right tabular-nums">{row.original.dueDay ? String(row.original.dueDay) : "—"}</span>
            },
            {
              id: "paymentDueDay",
              header: "Pago límite",
              cell: ({ row }) => (
                <span className="block text-right tabular-nums">{row.original.paymentDueDay ? String(row.original.paymentDueDay) : "—"}</span>
              )
            }
          ]
        : [];

    return [
      {
        header: "Cuenta",
        accessorKey: "name",
        // El nombre es el enlace al histórico anual; la celda conserva el acceso por la columna
        // para que el ordenamiento por nombre siga funcionando.
        cell: ({ row }) => (
          <Link
            href={accountAnnualSummaryHref(row.original.accountId)}
            className="focus-ring group inline-flex flex-col items-start gap-0.5"
            title={`Ver histórico anual de ${row.original.name}`}
            aria-label={`Ver histórico anual de ${row.original.name}`}
          >
            <span className="text-primary font-semibold group-hover:underline">{row.original.name}</span>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--color-accent)] group-hover:underline">
              <History className="h-3.5 w-3.5" aria-hidden="true" />
              Ver histórico anual
            </span>
          </Link>
        )
      },
      {
        header: "Tipo",
        cell: ({ row }) => <span className={getAccountTypeBadgeClass(row.original)}>{getAccountTypeLabel(row.original)}</span>
      },
      ...metricColumns,
      ...scheduleColumns,
      {
        header: "Estado",
        cell: ({ row }) => <span className={getAccountStatusBadgeClass(row.original)}>{getAccountStatusLabel(row.original)}</span>
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => <AccountActionsMenu account={row.original} onEdit={onEdit} onToggleActive={onToggleActive} />
      }
    ];
  }, [section, onEdit, onToggleActive]);

  return (
    <div className="app-grid-skin app-grid-skin-flat overflow-hidden rounded-none p-0">
      <DataGrid
        columns={columns}
        rows={section.accounts}
        loading={loading}
        errorMessage={errorMessage}
        mode="client"
        density="compact"
        emptyMessage={`Sin cuentas de ${section.title.toLowerCase()} con filtros actuales`}
        stickyHeader
        stickyActionsColumn
      />
      <p className="text-muted m-0 px-3 pb-3 pt-2 text-[11px] font-medium leading-snug">
        {section.key === "credit"
          ? `"${ACCOUNT_METRIC_UNAVAILABLE_LABEL}" indica que la cuenta no tiene dato canónico de crédito; no es cero ni se infiere del saldo contable, que vive en el detalle y el histórico.`
          : "Saldo actual e inicial registrados de la cuenta."}
      </p>
    </div>
  );
}
