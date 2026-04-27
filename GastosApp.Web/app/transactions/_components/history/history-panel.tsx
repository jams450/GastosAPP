import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataGrid } from "@/components/data-grid/data-grid";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

        <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
          <div className="grid gap-3 md:grid-cols-3">
            <label className="grid gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
              Tipo
              <select
                value={filters.type}
                onChange={(event) => updateType(event.target.value)}
                className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="all">Todos</option>
                <option value="income">Ingreso</option>
                <option value="expense">Gasto</option>
                <option value="transfer">Transferencia</option>
              </select>
            </label>

            <label className="grid gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
              Cuenta
              <select
                value={filters.accountId}
                onChange={(event) => updateAccount(event.target.value)}
                className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="all">Todas</option>
                {accountOptions.map((account) => (
                  <option key={account.value} value={account.value}>
                    {account.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
              Categoría
              <select
                value={filters.categoryId}
                onChange={(event) => updateCategory(event.target.value)}
                className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
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
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Mostrando {regularHistoryItems.length} normales · {transferGroups.length} transferencias
            </p>
            <Button
              type="button"
              variant="secondary"
              className="h-8 border border-slate-300 bg-slate-100 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
              onClick={onClearFilters}
            >
              Limpiar filtros
            </Button>
          </div>
        </div>
      </div>

      {historyError ? <Alert variant="danger">{historyError}</Alert> : null}
      {successMessage ? <Alert variant="info">{successMessage}</Alert> : null}

      <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-xl px-2 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-900"
          aria-expanded={isRegularOpen}
          onClick={() => setIsRegularOpen((current) => !current)}
        >
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            Transacciones normales ({regularHistoryItems.length})
          </span>
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">{isRegularOpen ? "Ocultar" : "Mostrar"}</span>
        </button>

        {isRegularOpen ? (
          <DataGrid
            columns={historyColumns}
            rows={regularHistoryItems}
            mode="client"
            density="compact"
            loading={historyLoading}
            emptyMessage={hasActiveFilters ? "Sin resultados con filtros actuales" : "No hay transacciones normales en este mes"}
          />
        ) : null}
      </div>

      <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-xl px-2 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-900"
          aria-expanded={isTransfersOpen}
          onClick={() => setIsTransfersOpen((current) => !current)}
        >
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            Transferencias por grupo ({transferGroups.length})
          </span>
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">{isTransfersOpen ? "Ocultar" : "Mostrar"}</span>
        </button>

        {isTransfersOpen ? (
          <DataGrid
            columns={transferColumns}
            rows={transferGroups}
            mode="client"
            density="compact"
            loading={historyLoading}
            emptyMessage={hasActiveFilters ? "Sin resultados con filtros actuales" : "No hay transferencias en este mes"}
          />
        ) : null}
      </div>
    </div>
  );
}
