import { useId, useState, type ReactNode } from "react";
import { flexRender, type ColumnDef } from "@tanstack/react-table";
import { DataGrid } from "@/components/data-grid/data-grid";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/format/currency";
import { dateTimeLocalDisplay } from "../../_lib/transactions-utils";
import { historyTypeLabel, type TransactionHistoryItem } from "../../_lib/transactions-types";
import type { CategoryType } from "@/lib/contracts/categories";

type FilterType = "all" | CategoryType;

type SelectOption = {
  value: number;
  label: string;
};

type HistoryFilters = {
  type: FilterType;
  accountId: number | "all";
  categoryId: number | "all";
};

function renderTransactionCard(item: TransactionHistoryItem, actions: ReactNode, columns: ColumnDef<unknown>[]) {
  const value = (id: string) => {
    const column = columns.find((candidate) => candidate.id === id || ("accessorKey" in candidate && candidate.accessorKey === id));
    const cell = column?.cell;
    if (!column || !cell || typeof cell !== "function") return "—";
    const context = {
      row: { original: item },
      getValue: () => (item as unknown as Record<string, unknown>)[id],
      renderValue: () => (item as unknown as Record<string, unknown>)[id]
    } as never;
    return flexRender(cell, context);
  };

  return (
    <article className="app-panel grid gap-2 rounded-xl p-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-primary">{item.description || historyTypeLabel[item.type]}</p>
          <p className="text-muted mt-1 text-xs">{dateTimeLocalDisplay(item.transactionDate)} · {item.accountName}</p>
        </div>
        <span className="shrink-0 font-semibold tabular-nums">{item.type === "income" ? "+" : item.type === "expense" || item.type === "opening_credit" ? "−" : ""}{formatCurrency(Math.abs(item.amount))}</span>
      </div>
      <p className="text-muted text-xs">{historyTypeLabel[item.type]} · {value("categoryId")} · {value("subcategoryId")} · {value("merchantId")}</p>
      {item.type === "expense" && item.allocations.length ? <p className="text-muted text-xs">¿Alguien más paga?: {value("sharedExpense")}</p> : null}
      {item.tags.length ? <p className="text-muted text-xs">Etiquetas: {item.tags.join(", ")}</p> : null}
      {item.type === "expense" && item.creditMonths !== null ? <p className="text-muted text-xs">{item.creditMonths} meses · {item.creditRemainingAmount === null ? "—" : `Pendiente ${formatCurrency(item.creditRemainingAmount)}`} · {item.creditStatus ?? "Pendiente"}</p> : null}
      {item.allocations.length ? <p className="text-muted text-xs">{item.allocations.map((allocation) => `${allocation.billablePartyName}: ${formatCurrency(allocation.calculatedAmount)}`).join(" · ")}</p> : null}
      <div className="flex flex-wrap gap-2 border-t border-[var(--color-border)] pt-2 [&_button]:min-h-9">{actions}</div>
    </article>
  );
}

type Props = {
  historyMonth: string;
  onHistoryMonthChange: (month: string) => void;
  onReload: () => void;
  filters: HistoryFilters;
  onFiltersChange: (filters: HistoryFilters) => void;
  onClearFilters: () => void;
  accountOptions: SelectOption[];
  categoryOptions: SelectOption[];
  historyLoading: boolean;
  historyError: string | null;
  successMessage: string | null;
  historyColumns: ColumnDef<unknown>[];
  transferColumns: ColumnDef<unknown>[];
  regularHistoryItems: unknown[];
  transferGroups: unknown[];
};

export function HistoryPanel({
  historyMonth,
  onHistoryMonthChange,
  onReload,
  filters,
  onFiltersChange,
  onClearFilters,
  accountOptions,
  categoryOptions,
  historyLoading,
  historyError,
  successMessage,
  historyColumns,
  transferColumns,
  regularHistoryItems,
  transferGroups
}: Props) {
  const hasActiveFilters = filters.type !== "all" || filters.accountId !== "all" || filters.categoryId !== "all";
  const [isRegularOpen, setIsRegularOpen] = useState(true);
  const [isTransfersOpen, setIsTransfersOpen] = useState(true);
  const regularSectionId = useId();
  const transfersSectionId = useId();

  function updateType(value: string) {
    onFiltersChange({
      ...filters,
      type: value as FilterType,
      categoryId: "all"
    });
  }

  function updateAccount(value: string) {
    onFiltersChange({
      ...filters,
      accountId: value === "all" ? "all" : Number(value)
    });
  }

  function updateCategory(value: string) {
    onFiltersChange({
      ...filters,
      categoryId: value === "all" ? "all" : Number(value)
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
        <div className="grid gap-3 sm:max-w-xs">
          <Input label="Mes" type="month" value={historyMonth} onChange={(event) => onHistoryMonthChange(event.target.value)} />
          <Button
            type="button"
            variant="secondary"
            className="h-9"
            loading={historyLoading}
            loadingText="Cargando..."
            onClick={onReload}
          >
            Recargar historial
          </Button>
        </div>

        <div className="app-panel grid gap-3 p-4">
          <div className="grid gap-3 md:grid-cols-3">
            <label className="text-muted grid gap-1 text-xs font-medium">
              Tipo
              <select
                value={filters.type}
                onChange={(event) => updateType(event.target.value)}
                className="input-semantic h-10 rounded-xl px-3 text-sm"
              >
                <option value="all">Todos</option>
                <option value="income">Ingreso</option>
                <option value="expense">Gasto</option>
                <option value="transfer">Transferencia</option>
              </select>
            </label>

            <label className="text-muted grid gap-1 text-xs font-medium">
              Cuenta
              <select
                value={filters.accountId}
                onChange={(event) => updateAccount(event.target.value)}
                className="input-semantic h-10 rounded-xl px-3 text-sm"
              >
                <option value="all">Todas</option>
                {accountOptions.map((account) => (
                  <option key={account.value} value={account.value}>
                    {account.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-muted grid gap-1 text-xs font-medium">
              Categoría
              <select
                value={filters.categoryId}
                onChange={(event) => updateCategory(event.target.value)}
                className="input-semantic h-10 rounded-xl px-3 text-sm"
              >
                <option value="all">Todas</option>
                {categoryOptions.map((category) => (
                  <option key={category.value} value={category.value}>
                    {category.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-muted text-xs">
              Mostrando {regularHistoryItems.length} normales · {transferGroups.length} transferencias
            </p>
            <Button
              type="button"
              variant="secondary"
              className="btn-secondary-semantic h-8 px-3 text-xs font-semibold"
              onClick={onClearFilters}
            >
              Limpiar filtros
            </Button>
          </div>
        </div>
      </div>

      {historyError ? <Alert variant="danger">{historyError}</Alert> : null}
      {successMessage ? <Alert variant="info">{successMessage}</Alert> : null}

      <div className="app-panel min-w-0 space-y-2 p-3">
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-xl px-2 py-1.5 text-left transition hover:bg-[var(--color-accent-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-border-focus)]"
          aria-expanded={isRegularOpen}
          aria-controls={regularSectionId}
          onClick={() => setIsRegularOpen((current) => !current)}
        >
          <span className="text-sm font-semibold text-primary">
            Transacciones normales ({regularHistoryItems.length})
          </span>
          <span className="text-xs font-semibold text-muted">{isRegularOpen ? "Ocultar" : "Mostrar"}</span>
        </button>

        <div id={regularSectionId} className="min-w-0">
          {isRegularOpen ? (
            <DataGrid
              columns={historyColumns}
              rows={regularHistoryItems}
              mode="client"
              density="compact"
              loading={historyLoading}
              stickyActionsColumn
              mobileCards={(item, actions) => renderTransactionCard(item as TransactionHistoryItem, actions, historyColumns)}
              enableGlobalFilter
              globalFilterPlaceholder="Buscar transacciones..."
              emptyMessage={hasActiveFilters ? "Sin resultados con filtros actuales" : "No hay transacciones normales en este mes"}
            />
          ) : null}
        </div>
      </div>

      <div className="app-panel min-w-0 space-y-2 p-3">
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-xl px-2 py-1.5 text-left transition hover:bg-[var(--color-accent-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-border-focus)]"
          aria-expanded={isTransfersOpen}
          aria-controls={transfersSectionId}
          onClick={() => setIsTransfersOpen((current) => !current)}
        >
          <span className="text-sm font-semibold text-primary">
            Transferencias por grupo ({transferGroups.length})
          </span>
          <span className="text-xs font-semibold text-muted">{isTransfersOpen ? "Ocultar" : "Mostrar"}</span>
        </button>

        <div id={transfersSectionId} className="min-w-0">
          {isTransfersOpen ? (
            <DataGrid
              columns={transferColumns}
              rows={transferGroups}
              mode="client"
              density="compact"
              loading={historyLoading}
              stickyActionsColumn
              enableGlobalFilter
              globalFilterPlaceholder="Buscar transferencias..."
              emptyMessage={hasActiveFilters ? "Sin resultados con filtros actuales" : "No hay transferencias en este mes"}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
