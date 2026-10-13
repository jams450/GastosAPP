"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { AlertCircle, ClipboardList, Link2, Plus, Receipt, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { DataGrid } from "@/components/data-grid/data-grid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { Account } from "@/lib/contracts/accounts";
import { toDateInputValue, type BudgetItem } from "@/lib/contracts/budget-items";
import { formatCurrency } from "@/lib/format/currency";
import { cn } from "@/lib/ui/cn";
import { tableActionStyles } from "@/lib/ui/table-action-styles";
import type { BudgetItemLinkCandidate } from "../_lib/budgets-api";
import {
  budgetItemKindBadgeClass,
  budgetItemKindLabel,
  budgetItemStatusBadgeClass,
  budgetItemStatusLabel,
  getItemActions,
  type BudgetItemKindFilter
} from "../_lib/budget-items-model";
import type { BudgetItemCatalogIndex } from "../_hooks/use-budget-items";

type Props = {
  items: BudgetItem[];
  loading: boolean;
  errorMessage: string | null;
  kindFilter: BudgetItemKindFilter;
  busyItemId: number | null;
  catalogs: BudgetItemCatalogIndex;
  onKindFilterChange: (filter: BudgetItemKindFilter) => void;
  onCreate: () => void;
  onEdit: (item: BudgetItem) => void;
  onCancel: (item: BudgetItem) => void;
  onRestore: (item: BudgetItem) => void;
  onIgnore: (item: BudgetItem) => void;
  onRequestLink: (item: BudgetItem) => void;
  onRequestExpense: (item: BudgetItem) => void;
};

const KIND_FILTERS: ReadonlyArray<{ id: BudgetItemKindFilter; label: string }> = [
  { id: "all", label: "Todas" },
  { id: "expense", label: "Gastos" },
  { id: "income", label: "Ingresos" }
];

function formatItemDate(value: string | null): string {
  const iso = toDateInputValue(value);
  if (!iso) {
    return "—";
  }

  // Se formatea en UTC para no correr el día: la fecha viene sin zona.
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeZone: "UTC" }).format(parsed);
}

function describeScope(item: BudgetItem, catalogs: BudgetItemCatalogIndex): { label: string; hint: string | null } {
  if (item.subcategoryId !== null) {
    const subcategory = catalogs.subcategoryById.get(item.subcategoryId);
    const parent = subcategory ? catalogs.categoryById.get(subcategory.categoryId) : undefined;
    return { label: subcategory?.name ?? `Subcategoría #${item.subcategoryId}`, hint: parent?.name ?? "Subcategoría" };
  }

  if (item.categoryId !== null) {
    const category = catalogs.categoryById.get(item.categoryId);
    return { label: category?.name ?? `Categoría #${item.categoryId}`, hint: "Categoría" };
  }

  return { label: "Sin alcance", hint: null };
}

export function BudgetItemsPanel({
  items,
  loading,
  errorMessage,
  kindFilter,
  busyItemId,
  catalogs,
  onKindFilterChange,
  onCreate,
  onEdit,
  onCancel,
  onRestore,
  onIgnore,
  onRequestLink,
  onRequestExpense
}: Props) {
  const [showCancelled, setShowCancelled] = useState(false);

  const visibleItems = useMemo(
    () => (showCancelled ? items : items.filter((item) => item.status !== "cancelled")),
    [items, showCancelled]
  );

  const columns = useMemo<ColumnDef<BudgetItem>[]>(
    () => [
      {
        id: "name",
        header: "Partida",
        accessorFn: (row) => row.name,
        cell: ({ row }) => {
          const scope = describeScope(row.original, catalogs);
          return (
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="m-0 text-xs font-bold text-primary">{row.original.name}</p>
                {row.original.isProjected ? <span className="tabler-badge">Proyectada</span> : null}
                {row.original.source === "template" ? <span className="tabler-badge">Programada</span> : null}
              </div>
              <p className="m-0 text-[11px] text-muted">
                {scope.label}
                {scope.hint ? ` · ${scope.hint}` : ""}
              </p>
            </div>
          );
        }
      },
      {
        id: "kind",
        header: "Tipo",
        accessorFn: (row) => row.kind,
        cell: ({ row }) => <span className={budgetItemKindBadgeClass(row.original.kind)}>{budgetItemKindLabel(row.original.kind)}</span>
      },
      {
        id: "plannedAmount",
        header: "Planificado",
        accessorFn: (row) => row.plannedAmount,
        cell: ({ row }) => <span className="tabular-nums font-semibold">{formatCurrency(row.original.plannedAmount)}</span>
      },
      {
        id: "plannedDate",
        header: "Fecha",
        accessorFn: (row) => toDateInputValue(row.plannedDate),
        cell: ({ row }) => <span className="text-xs font-medium text-secondary">{formatItemDate(row.original.plannedDate)}</span>
      },
      {
        id: "status",
        header: "Estado",
        accessorFn: (row) => row.status,
        cell: ({ row }) => (
          <div className="flex flex-col items-start gap-1">
            <span className={budgetItemStatusBadgeClass(row.original.status)}>{budgetItemStatusLabel(row.original.status)}</span>
            {row.original.transactionId !== null ? <span className="text-[11px] font-medium text-muted">Con transacción</span> : null}
          </div>
        )
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <ItemActions
            item={row.original}
            busy={busyItemId === row.original.itemId}
            onEdit={onEdit}
            onCancel={onCancel}
            onRestore={onRestore}
            onIgnore={onIgnore}
            onRequestLink={onRequestLink}
            onRequestExpense={onRequestExpense}
          />
        )
      }
    ],
    [busyItemId, catalogs, onCancel, onEdit, onIgnore, onRequestExpense, onRequestLink, onRestore]
  );

  if (errorMessage) {
    return (
      <div className="border-[var(--color-danger)]/35 bg-[var(--color-danger)]/12 p-4 text-[var(--color-danger)]" role="alert" aria-live="assertive">
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="text-sm font-bold">Error al cargar partidas</p>
            <p className="mt-1 text-xs font-medium">{errorMessage}</p>
          </div>
        </div>
      </div>
    );
  }

  const isEmpty = !loading && visibleItems.length === 0 && !showCancelled;

  return (
    <section aria-busy={loading} className="space-y-3">
      <div className="app-panel flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filtrar partidas por tipo">
          {KIND_FILTERS.map((filter) => {
            const isActive = filter.id === kindFilter;
            return (
              <button
                key={filter.id}
                type="button"
                aria-pressed={isActive}
                onClick={() => onKindFilterChange(filter.id)}
                className={cn(
                  "focus-ring inline-flex h-7 items-center rounded-[var(--radius-sm)] border px-2.5 text-[11px] font-bold transition",
                  isActive
                    ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-accent-contrast)]"
                    : "border-default bg-[var(--color-surface-1)] text-muted hover:bg-[var(--color-accent-soft)] hover:text-primary"
                )}
              >
                {filter.label}
              </button>
            );
          })}
        </div>

        <label className="text-muted flex items-center gap-1.5 text-[11px] font-semibold">
          <input
            type="checkbox"
            checked={showCancelled}
            onChange={(event) => setShowCancelled(event.target.checked)}
            className="h-3.5 w-3.5 accent-[var(--color-accent)]"
          />
          Mostrar canceladas
        </label>
      </div>

      {isEmpty ? (
        <section className="app-panel flex flex-col items-center gap-3 border-dashed px-6 py-12 text-center">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
            <ClipboardList className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="space-y-1">
            <h2 className="m-0 text-base font-semibold text-primary">Sin partidas en este periodo</h2>
            <p className="m-0 max-w-md text-sm text-muted">
              Planifica gastos o ingresos con fecha y cuenta para verlos reflejados como comprometido en el límite del mes.
            </p>
          </div>
          <Button type="button" variant="ghost" className={`h-9 rounded-none px-3 text-xs font-bold ${tableActionStyles.create}`} onClick={onCreate}>
            <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Nueva partida
          </Button>
        </section>
      ) : (
        <>
          <ul className="space-y-2.5 md:hidden">
            {loading
              ? Array.from({ length: 3 }).map((_, index) => (
                  <li key={index} className="animate-pulse border border-default bg-[var(--color-surface-2)] p-3">
                    <div className="h-3 w-32 rounded-none bg-[var(--color-surface-3)]" />
                    <div className="mt-2 h-2.5 w-44 rounded-none bg-[var(--color-surface-3)]" />
                    <div className="mt-3 h-8 rounded-none bg-[var(--color-surface-3)]" />
                  </li>
                ))
              : visibleItems.map((item) => {
                  const scope = describeScope(item, catalogs);
                  return (
                    <li key={item.itemId}>
                      <article className="dashboard-card p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="m-0 truncate text-sm font-bold text-primary">{item.name}</h3>
                            <p className="m-0 text-[11px] font-medium text-muted">
                              {scope.label}
                              {scope.hint ? ` · ${scope.hint}` : ""}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <span className={budgetItemStatusBadgeClass(item.status)}>{budgetItemStatusLabel(item.status)}</span>
                            <span className={budgetItemKindBadgeClass(item.kind)}>{budgetItemKindLabel(item.kind)}</span>
                            {item.source === "template" ? <span className="tabler-badge">Programada</span> : null}
                          </div>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <div className="dashboard-subtle p-2">
                            <p className="m-0 text-[10px] font-semibold uppercase tracking-wide text-muted">Planificado</p>
                            <p className="m-0 text-sm font-bold tabular-nums text-primary">{formatCurrency(item.plannedAmount)}</p>
                          </div>
                          <div className="dashboard-subtle p-2">
                            <p className="m-0 text-[10px] font-semibold uppercase tracking-wide text-muted">Fecha</p>
                            <p className="m-0 text-sm font-bold text-primary">{formatItemDate(item.plannedDate)}</p>
                          </div>
                        </div>

                        <div className="mt-3">
                          <ItemActions
                            item={item}
                            busy={busyItemId === item.itemId}
                            onEdit={onEdit}
                            onCancel={onCancel}
                            onRestore={onRestore}
                            onIgnore={onIgnore}
                            onRequestLink={onRequestLink}
                            onRequestExpense={onRequestExpense}
                            mobile
                          />
                        </div>
                      </article>
                    </li>
                  );
                })}
          </ul>

          <div className="hidden md:block">
            <div className="app-grid-skin app-grid-skin-flat overflow-hidden rounded-none p-0">
              <DataGrid
                columns={columns}
                rows={visibleItems}
                loading={loading}
                mode="client"
                density="compact"
                emptyMessage="Sin partidas para el filtro"
                stickyHeader
                stickyActionsColumn
                initialSorting={[{ id: "plannedDate", desc: false }]}
              />
            </div>
          </div>
        </>
      )}
    </section>
  );
}

/**
 * Acciones permitidas por estado. En `executed` y `cancelled` no se ofrece nada destructivo:
 * el backend responde 409 y la UI no debe dejar que el usuario choque con el conflicto.
 */
function ItemActions({
  item,
  busy,
  mobile = false,
  onEdit,
  onCancel,
  onRestore,
  onIgnore,
  onRequestLink,
  onRequestExpense
}: {
  item: BudgetItem;
  busy: boolean;
  mobile?: boolean;
  onEdit: (item: BudgetItem) => void;
  onCancel: (item: BudgetItem) => void;
  onRestore: (item: BudgetItem) => void;
  onIgnore: (item: BudgetItem) => void;
  onRequestLink: (item: BudgetItem) => void;
  onRequestExpense: (item: BudgetItem) => void;
}) {
  const actions = getItemActions(item.status);

  if (actions.terminalReason) {
    return <p className="m-0 text-[11px] font-medium text-muted">{actions.terminalReason}</p>;
  }

  // Enlazar y registrar gasto solo tienen sentido sobre una partida "pending": una ejecutada ya
  // tiene su transacción y una ignorada liberó su monto.
  const isPending = item.status === "pending";

  return (
    <div className={cn("flex justify-end gap-1.5", mobile && "grid grid-cols-2 gap-1.5")} role="group" aria-label={`Acciones para la partida ${item.name}`}>
      {isPending ? (
        <Button
          type="button"
          variant="ghost"
          className="h-8 border px-2 text-[11px] font-semibold border-emerald-400/50 bg-emerald-500/15 text-emerald-700 hover:border-emerald-500/70 hover:bg-emerald-500/25 dark:border-emerald-700/60 dark:bg-emerald-500/25 dark:text-emerald-300"
          onClick={() => onRequestLink(item)}
          aria-label={`Enlazar un movimiento existente a la partida ${item.name}`}
        >
          <Link2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
          <span>Enlazar</span>
        </Button>
      ) : null}

      {isPending && item.kind === "expense" ? (
        <Button
          type="button"
          variant="ghost"
          className={`h-8 border px-2 text-[11px] font-semibold ${tableActionStyles.create}`}
          onClick={() => onRequestExpense(item)}
          aria-label={`Registrar el gasto de la partida ${item.name}`}
        >
          <Receipt className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
          <span>Registrar gasto</span>
        </Button>
      ) : null}

      {actions.canEdit ? (
        <Button
          type="button"
          variant="ghost"
          className="h-8 border px-2 text-[11px] font-semibold border-blue-400/60 bg-blue-500/15 text-blue-700 hover:border-blue-500/70 hover:bg-blue-500/25 dark:border-blue-700/60 dark:bg-blue-500/25 dark:text-blue-300"
          onClick={() => onEdit(item)}
          aria-label={`Editar la partida ${item.name}`}
        >
          <span>Editar</span>
        </Button>
      ) : null}

      {item.status === "pending" ? (
        <Button
          type="button"
          variant="ghost"
          className="h-8 border px-2 text-[11px] font-semibold border-[var(--color-warning)]/50 bg-[var(--color-warning)]/15 text-[var(--color-warning)] hover:bg-[var(--color-warning)]/25"
          loading={busy}
          loadingText="Guardando..."
          disabled={!actions.canChangeStatus}
          onClick={() => onIgnore(item)}
          aria-label={`Ignorar la partida ${item.name}`}
        >
          <span>Ignorar</span>
        </Button>
      ) : null}

      {item.status === "ignored" ? (
        <Button
          type="button"
          variant="ghost"
          className="h-8 border px-2 text-[11px] font-semibold border-emerald-400/50 bg-emerald-500/15 text-emerald-200 hover:border-emerald-300/70 hover:bg-emerald-500/25"
          loading={busy}
          loadingText="Guardando..."
          disabled={!actions.canChangeStatus}
          onClick={() => onRestore(item)}
          aria-label={`Devolver a pendiente la partida ${item.name}`}
        >
          <span>Reactivar</span>
        </Button>
      ) : null}

      {actions.canCancel ? (
        <Button
          type="button"
          variant="ghost"
          className="h-8 border px-2 text-[11px] font-semibold border-[var(--color-danger)]/50 bg-[var(--color-danger)]/15 text-[var(--color-danger)] hover:border-[var(--color-danger)]/70 hover:bg-[var(--color-danger)]/25"
          loading={busy}
          loadingText="Cancelando..."
          onClick={() => onCancel(item)}
          aria-label={`Cancelar la partida ${item.name}`}
        >
          <span>Cancelar</span>
        </Button>
      ) : null}
    </div>
  );
}

/** Borrador del alta de gasto desde una partida: la categoría/alcance los fija la partida. */
export type BudgetItemExpenseDraft = {
  accountId: number;
  amount: number;
  description: string;
  transactionDate: string;
};

/** Fecha local `yyyy-MM-ddTHH:mm` a mediodía de la fecha planificada, para no correr el día. */
function toDateTimeLocalValue(value: string | null): string {
  const iso = toDateInputValue(value);
  return iso ? `${iso}T12:00` : "";
}

function formatCandidateDate(value: string | null): string {
  if (!value) {
    return "Sin fecha";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Sin fecha";
  }

  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeZone: "America/Mexico_City" }).format(parsed);
}

/**
 * Selección de un movimiento existente para enlazarlo a la partida. La lista la resuelve el API
 * (mismo mes y mismo alcance, cualquier monto) y el monto mostrado es el real de la transacción.
 */
export function BudgetItemLinkDialog({
  item,
  candidates,
  loading,
  errorMessage,
  submittingTransactionId,
  onSelect,
  onClose,
  onRetry
}: {
  item: BudgetItem;
  candidates: BudgetItemLinkCandidate[];
  loading: boolean;
  errorMessage: string | null;
  submittingTransactionId: number | null;
  onSelect: (transactionId: number) => void;
  onClose: () => void;
  onRetry: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="budget-item-link-title">
      <div className="dashboard-card max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-none p-4 sm:rounded-2xl">
        <header className="flex items-start justify-between gap-2">
          <div>
            <h2 id="budget-item-link-title" className="m-0 text-base font-semibold text-primary">Enlazar movimiento a {item.name}</h2>
            <p className="m-0 mt-1 text-xs text-muted">Mismo mes y misma categoría/subcategoría. El monto real del movimiento es el que manda.</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            className="h-8 w-8 shrink-0 p-0"
            onClick={onClose}
            aria-label="Cerrar el enlazado de movimientos"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </header>

        {loading ? (
          <p className="mt-4 text-sm text-muted" role="status">Cargando movimientos…</p>
        ) : errorMessage ? (
          <div className="mt-4 space-y-2" role="alert">
            <p className="m-0 text-sm text-[var(--color-danger)]">{errorMessage}</p>
            <Button type="button" variant="ghost" className="h-8 border px-2 text-[11px] font-semibold" onClick={onRetry}>
              Reintentar
            </Button>
          </div>
        ) : candidates.length === 0 ? (
          <p className="mt-4 text-sm text-muted">
            No hay movimientos del mismo mes con la misma categoría o subcategoría, o ya están enlazados a otra partida.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {candidates.map((candidate) => (
              <li key={candidate.transactionId} className="dashboard-subtle flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="m-0 text-sm font-bold tabular-nums text-primary">{formatCurrency(candidate.amount)}</p>
                  <p className="m-0 text-[11px] font-medium text-muted">
                    {formatCandidateDate(candidate.transactionDate)} · #{candidate.transactionId}
                  </p>
                  <p className="m-0 truncate text-[11px] text-muted">{candidate.description ?? "Sin descripción"}</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-8 shrink-0 border px-2 text-[11px] font-semibold border-emerald-400/50 bg-emerald-500/15 text-emerald-700 hover:border-emerald-500/70 hover:bg-emerald-500/25 dark:border-emerald-700/60 dark:bg-emerald-500/25 dark:text-emerald-300"
                  loading={submittingTransactionId === candidate.transactionId}
                  disabled={submittingTransactionId !== null}
                  onClick={() => onSelect(candidate.transactionId)}
                  aria-label={`Enlazar el movimiento ${candidate.transactionId} a la partida ${item.name}`}
                >
                  <span>Enlazar</span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * Alta de gasto desde la partida: el monto planificado llega precargado y es editable; el alcance
 * lo fija la partida (lo muestra como contexto) y la fecha se valida contra su mes. Al confirmar,
 * el API enlaza la transacción a la partida.
 */
export function BudgetItemExpenseDialog({
  item,
  accounts,
  catalogs,
  submitting,
  errorMessage,
  onSubmit,
  onClose
}: {
  item: BudgetItem;
  accounts: Account[];
  catalogs: BudgetItemCatalogIndex;
  submitting: boolean;
  errorMessage: string | null;
  onSubmit: (draft: BudgetItemExpenseDraft) => void;
  onClose: () => void;
}) {
  const [accountId, setAccountId] = useState<number | null>(null);
  const [amount, setAmount] = useState(item.plannedAmount.toFixed(2));
  const [description, setDescription] = useState(item.name);
  const [transactionDate, setTransactionDate] = useState(toDateTimeLocalValue(item.plannedDate));
  const scope = describeScope(item, catalogs);
  const amountNumber = Number(amount);
  const canSubmit =
    accountId !== null &&
    Number.isFinite(amountNumber) &&
    amountNumber > 0 &&
    description.trim().length > 0 &&
    transactionDate.length > 0;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || accountId === null) {
      return;
    }

    onSubmit({ accountId, amount: amountNumber, description: description.trim(), transactionDate });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="budget-item-expense-title">
      <form onSubmit={handleSubmit} className="dashboard-card max-h-[85vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-none p-4 sm:rounded-2xl">
        <header className="flex items-start justify-between gap-2">
          <div>
            <h2 id="budget-item-expense-title" className="m-0 text-base font-semibold text-primary">Registrar gasto de {item.name}</h2>
            <p className="m-0 mt-1 text-xs text-muted">
              {scope.label}
              {scope.hint ? ` · ${scope.hint}` : ""} · Planificado {formatCurrency(item.plannedAmount)}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            className="h-8 w-8 shrink-0 p-0"
            onClick={onClose}
            aria-label="Cerrar el registro de gasto de la partida"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </header>

        <Select label="Cuenta *" value={accountId ?? ""} onChange={(event) => setAccountId(Number(event.target.value) || null)} required>
          <option value="">Selecciona una cuenta</option>
          {accounts.map((account) => (
            <option key={account.accountId} value={account.accountId}>
              {account.name}
            </option>
          ))}
        </Select>

        <Input
          label="Monto real *"
          type="number"
          step="0.01"
          min="0.01"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          className="text-right"
          required
        />
        <p className="-mt-2 px-1 text-[11px] text-muted">Precargado con lo planificado; puedes editarlo: el monto real es el que cuenta.</p>

        <Input
          label="Fecha y hora *"
          type="datetime-local"
          step="60"
          value={transactionDate}
          onChange={(event) => setTransactionDate(event.target.value)}
          required
        />
        <p className="-mt-2 px-1 text-[11px] text-muted">Debe caer en {item.periodKey} para poder enlazarla a la partida.</p>

        <Input
          label="Descripción *"
          type="text"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={120}
          required
        />

        {errorMessage ? (
          <p className="m-0 text-sm text-[var(--color-danger)]" role="alert">{errorMessage}</p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" className="h-9 border px-3 text-xs font-semibold" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="submit"
            loading={submitting}
            loadingText="Registrando..."
            disabled={!canSubmit}
            className={`h-9 px-3 text-xs font-bold ${tableActionStyles.create}`}
          >
            Registrar y enlazar
          </Button>
        </div>
      </form>
    </div>
  );
}
