import type { ColumnDef } from "@tanstack/react-table";
import { X } from "lucide-react";
import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { DataGrid } from "@/components/data-grid/data-grid";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { Account } from "@/lib/contracts/accounts";
import type { Category } from "@/lib/contracts/categories";
import type { Merchant } from "@/lib/contracts/merchants";
import type { RecurringItem, RecurringItemConfig, RecurringItemWriteRequest } from "@/lib/contracts/recurring-items";
import type { Subcategory } from "@/lib/contracts/subcategories";
import { requestJson } from "../_shared/catalogs-api";
import { CatalogActionButton } from "../_shared/catalog-action-button";
import { SectionFilterBar } from "../_shared/section-filter-bar";
import { StatusBadge } from "../_shared/status-badge";
import { useCatalogSectionState } from "../_shared/use-catalog-section-state";
import {
  categoryTypeForKind,
  clampDayOfMonth,
  createEmptyRecurringItemForm,
  formatRecurringItemAmount,
  formatRecurringItemValidity,
  isAverageAmountMode,
  isCategoryOnlyKind,
  MAX_RECURRING_ITEM_NAME_LENGTH,
  MIN_DAY_OF_MONTH,
  MAX_DAY_OF_MONTH,
  recurringItemKindLabel,
  resolveAccountLabel,
  resolveScopeLabel,
  supportsAutoExecute,
  toRecurringItemFormValues,
  toRecurringItemWriteRequest,
  validateRecurringItemForm,
  type RecurringItemFormErrors,
  type RecurringItemFormValues
} from "./_lib/recurring-items-model";

type Props = {
  items: RecurringItem[];
  accounts: Account[];
  categories: Category[];
  subcategories: Subcategory[];
  merchants: Merchant[];
  config: RecurringItemConfig;
  onCatalogChanged: () => Promise<void>;
  onError: (message: string | null) => void;
  onSuccess: (message: string) => void;
};

const KIND_OPTIONS = [
  { value: "expense", label: "Gasto" },
  { value: "income", label: "Ingreso" }
] as const;

const AMOUNT_MODE_OPTIONS = [
  { value: "fixed", label: "Monto fijo" },
  { value: "average", label: "Promedio del historial" }
] as const;

async function createRecurringItem(payload: RecurringItemWriteRequest) {
  await requestJson(
    "/api/bff/catalogs/recurring-items",
    { method: "POST", body: JSON.stringify(payload) },
    "No se pudo crear la partida programada"
  );
}

async function updateRecurringItem(recurringItemId: number, payload: RecurringItemWriteRequest) {
  await requestJson(
    `/api/bff/catalogs/recurring-items/${recurringItemId}`,
    { method: "PUT", body: JSON.stringify(payload) },
    "No se pudo actualizar la partida programada"
  );
}

async function patchRecurringItemActive(recurringItemId: number, active: boolean) {
  await requestJson(
    `/api/bff/catalogs/recurring-items/${recurringItemId}/active`,
    { method: "PATCH", body: JSON.stringify({ active }) },
    "No se pudo actualizar el estado de la partida programada"
  );
}

export function RecurringItemsSection({
  items,
  accounts,
  categories,
  subcategories,
  merchants,
  config,
  onCatalogChanged,
  onError,
  onSuccess
}: Props) {
  const [saving, setSaving] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<RecurringItemFormValues>(() => createEmptyRecurringItemForm(new Date()));
  const [errors, setErrors] = useState<RecurringItemFormErrors>({});

  const initialSorting = useMemo(() => [{ id: "name", desc: false }], []);
  const {
    filteredRows,
    searchQuery,
    setSearchQuery,
    activeFilter,
    setActiveFilter,
    sorting,
    setSorting,
    clearFilters
  } = useCatalogSectionState({
    rows: items,
    initialSorting,
    searchPredicate: (row, normalizedQuery) => row.name.toLowerCase().includes(normalizedQuery),
    activePredicate: (row) => row.active
  });

  const isEditing = form.id !== null;
  const isIncome = isCategoryOnlyKind(form.kind);
  const isAverage = isAverageAmountMode(form.amountMode);
  const showAutoExecute = supportsAutoExecute(form.kind);

  // Un ingreso solo admite categorías de ingreso; un gasto, categorías de gasto. La lista de
  // subcategorías se acota a las categorías visibles para no ofrecer un alcance que no valida.
  const categoryOptions = useMemo(
    () => categories.filter((category) => category.type === categoryTypeForKind(form.kind)),
    [categories, form.kind]
  );
  const allowedCategoryIds = useMemo(() => new Set(categoryOptions.map((category) => category.categoryId)), [categoryOptions]);
  const subcategoryOptions = useMemo(
    () => (isIncome ? [] : subcategories.filter((subcategory) => allowedCategoryIds.has(subcategory.categoryId))),
    [allowedCategoryIds, isIncome, subcategories]
  );

  // Solo presentación: el backend ya ajusta el día al último día del mes que no tiene el 29/30/31.
  const clampedDay = clampDayOfMonth(Number(form.dayOfMonth), form.startsPeriod);

  function patchForm(patch: Partial<RecurringItemFormValues>) {
    setForm((current) => ({ ...current, ...patch }));
    setErrors({});
  }

  function openCreateDrawer() {
    setForm(createEmptyRecurringItemForm(new Date()));
    setErrors({});
    setDrawerOpen(true);
    onError(null);
  }

  function openEditDrawer(item: RecurringItem) {
    setForm(toRecurringItemFormValues(item));
    setErrors({});
    setDrawerOpen(true);
    onError(null);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setErrors({});
  }

  async function submitForm(event: FormEvent) {
    event.preventDefault();

    const validationErrors = validateRecurringItemForm(form, new Date());
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setErrors({});
    setSaving(true);
    onError(null);
    try {
      const payload = toRecurringItemWriteRequest(form);

      if (form.id !== null) {
        await updateRecurringItem(form.id, payload);
        onSuccess("Partida programada actualizada correctamente.");
      } else {
        await createRecurringItem(payload);
        onSuccess("Partida programada creada correctamente.");
      }

      setDrawerOpen(false);
      await onCatalogChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo guardar la partida programada");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(item: RecurringItem) {
    setSaving(true);
    onError(null);
    try {
      await patchRecurringItemActive(item.recurringItemId, !item.active);
      onSuccess(`Partida programada ${!item.active ? "activada" : "desactivada"}.`);
      await onCatalogChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo actualizar la partida programada");
    } finally {
      setSaving(false);
    }
  }

  const columns: ColumnDef<RecurringItem>[] = [
    { accessorKey: "name", header: "Nombre" },
    {
      accessorKey: "kind",
      header: "Tipo",
      cell: ({ row }) => recurringItemKindLabel(row.original.kind)
    },
    {
      id: "amount",
      header: "Monto",
      cell: ({ row }) => formatRecurringItemAmount(row.original.amountMxn, row.original.amountMode)
    },
    {
      accessorKey: "dayOfMonth",
      header: "Día",
      cell: ({ row }) => String(row.original.dayOfMonth)
    },
    {
      id: "effectiveFrom",
      header: "Efectiva",
      cell: ({ row }) => (row.original.effectiveFrom ? row.original.effectiveFrom.slice(0, 10) : "—")
    },
    {
      id: "account",
      header: "Cuenta",
      cell: ({ row }) => resolveAccountLabel(row.original.accountId, accounts)
    },
    {
      id: "scope",
      header: "Categoría",
      cell: ({ row }) => resolveScopeLabel(row.original.categoryId, row.original.subcategoryId, categories, subcategories)
    },
    {
      id: "validity",
      header: "Vigencia",
      cell: ({ row }) => formatRecurringItemValidity(row.original.startsPeriod, row.original.endsPeriod)
    },
    {
      accessorKey: "active",
      header: "Estado",
      cell: ({ row }) => <StatusBadge active={row.original.active} />
    },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => {
        const item = row.original;
        return (
          <div className="flex justify-end gap-1.5">
            <CatalogActionButton type="button" action="edit" label="Editar" onClick={() => openEditDrawer(item)} />
            <CatalogActionButton
              type="button"
              action={item.active ? "deactivate" : "activate"}
              label={item.active ? "Desactivar" : "Activar"}
              onClick={() => void toggleActive(item)}
              disabled={saving}
            />
          </div>
        );
      }
    }
  ];

  return (
    <>
      <section>
        <SectionFilterBar
          searchPlaceholder="Buscar partida programada"
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          activeFilter={activeFilter}
          onActiveFilterChange={setActiveFilter}
          onClearFilters={clearFilters}
          hideFeedback
          actions={
            <CatalogActionButton type="button" action="create" label="Nueva" onClick={openCreateDrawer} />
          }
        />
      </section>

      <section>
        <div className="app-grid-skin app-grid-skin-flat overflow-hidden rounded-none p-0">
          <DataGrid
            columns={columns}
            rows={filteredRows}
            sorting={sorting}
            onSortingChange={setSorting}
            emptyMessage="Sin partidas programadas"
          />
        </div>
      </section>

      {drawerOpen ? (
        <div
          className="drawer-enter-backdrop fixed inset-0 z-[70] flex items-end justify-end bg-[var(--color-overlay)] backdrop-blur-sm sm:items-stretch"
          role="presentation"
          onClick={closeDrawer}
        >
          <Card
            className="drawer-enter-panel relative flex h-[100dvh] w-full max-w-none flex-col app-sidebar border-l p-0 sm:h-full sm:max-w-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="drawer-header-semantic">
              <div className="mb-1 h-1 w-12 bg-[var(--color-accent)]/70 sm:hidden" />
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-primary mt-1 text-lg font-semibold">
                  {isEditing ? "Editar partida programada" : "Nueva partida programada"}
                </h3>
                <Button type="button" variant="ghost" className="btn-close-semantic" onClick={closeDrawer}>
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Cerrar</span>
                </Button>
              </div>
            </div>

            <form className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => void submitForm(event)}>
              <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
                <section className="drawer-section-semantic rounded-none border-[var(--color-border)] bg-[var(--color-surface-2)]">
                  <h4 className="text-muted text-[11px] font-bold uppercase tracking-[0.14em]">General</h4>
                  <div className="grid gap-3 md:grid-cols-2">
                    <Input
                      label="Nombre"
                      value={form.name}
                      error={errors.name}
                      maxLength={MAX_RECURRING_ITEM_NAME_LENGTH}
                      onChange={(event) => patchForm({ name: event.target.value })}
                      required
                    />

                    <Select
                      label="Tipo"
                      value={form.kind}
                      // `kind` es inmutable tras el alta: el backend lo trata como parte de la identidad.
                      disabled={isEditing}
                      onChange={(event) =>
                        patchForm({
                          kind: event.target.value,
                          // Cambiar de tipo reencuadra el alcance y la ejecución automática.
                          subcategoryId: event.target.value === "income" ? null : form.subcategoryId,
                          autoExecute: event.target.value === "expense" ? form.autoExecute : false
                        })
                      }
                      required
                    >
                      {KIND_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>

                    <Select
                      label="Modo de monto"
                      value={form.amountMode}
                      onChange={(event) => patchForm({ amountMode: event.target.value })}
                      required
                    >
                      {AMOUNT_MODE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>

                    {/* En modo promedio el monto lo deriva el backend del historial. */}
                    {isAverage ? (
                      <div className="grid gap-1.5 text-sm font-medium text-primary">
                        <span>Monto (MXN)</span>
                        <p className="m-0 flex h-10 items-center border border-default bg-[var(--color-surface-3)] px-3 text-sm font-medium text-muted">
                          Se calcula con el historial
                        </p>
                      </div>
                    ) : (
                      <Input
                        label="Monto (MXN)"
                        type="number"
                        inputMode="decimal"
                        min={0.01}
                        step={0.01}
                        value={form.amountMxn}
                        error={errors.amountMxn}
                        onChange={(event) => patchForm({ amountMxn: event.target.value })}
                        required
                      />
                    )}

                    <Input
                      label={`Día del mes (${MIN_DAY_OF_MONTH}-${MAX_DAY_OF_MONTH})`}
                      type="number"
                      inputMode="numeric"
                      min={MIN_DAY_OF_MONTH}
                      max={MAX_DAY_OF_MONTH}
                      step={1}
                      value={form.dayOfMonth}
                      error={errors.dayOfMonth}
                      onChange={(event) => patchForm({ dayOfMonth: event.target.value })}
                      required
                    />
                    <p className="text-muted m-0 text-[11px] font-medium md:col-span-2">
                      {clampedDay !== null && clampedDay !== Number(form.dayOfMonth)
                        ? `En ${form.startsPeriod} la ocurrencia cae el día ${clampedDay}, el último del mes.`
                        : "Si el mes no tiene el día indicado, la ocurrencia cae el último día."}
                    </p>
                  </div>
                </section>

                <section className="drawer-section-semantic rounded-none border-[var(--color-border)] bg-[var(--color-surface-2)]">
                  <h4 className="text-muted text-[11px] font-bold uppercase tracking-[0.14em]">Alcance</h4>
                  <div className="grid gap-3 md:grid-cols-2">
                    <Select
                      label={isIncome ? "Categoría de ingreso" : "Categoría de gasto"}
                      value={form.categoryId ?? ""}
                      error={errors.scope}
                      // Sin `required` nativo: el alcance es XOR y un gasto con solo subcategoría es
                      // válido. La regla la aplica el modelo (`errors.scope`), no el navegador.
                      onChange={(event) => patchForm({ categoryId: event.target.value ? Number(event.target.value) : null, subcategoryId: null })}
                    >
                      <option value="">Selecciona una categoría</option>
                      {categoryOptions.map((category) => (
                        <option key={category.categoryId} value={category.categoryId}>
                          {category.name}
                        </option>
                      ))}
                    </Select>

                    {/* El ingreso nunca se planifica por subcategoría: el selector se oculta. */}
                    {isIncome ? null : (
                      <Select
                        label="Subcategoría de gasto"
                        value={form.subcategoryId ?? ""}
                        error={errors.scope}
                        onChange={(event) => patchForm({ subcategoryId: event.target.value ? Number(event.target.value) : null, categoryId: null })}
                      >
                        <option value="">Sin subcategoría</option>
                        {subcategoryOptions.map((subcategory) => (
                          <option key={subcategory.subcategoryId} value={subcategory.subcategoryId}>
                            {subcategory.name}
                          </option>
                        ))}
                      </Select>
                    )}
                  </div>
                  <p className="text-muted m-0 text-[11px] font-medium">
                    Elige categoría o subcategoría, no ambas: el backend rechaza el alcance con ambos ids.
                  </p>
                </section>

                <section className="drawer-section-semantic rounded-none border-[var(--color-border)] bg-[var(--color-surface-2)]">
                  <h4 className="text-muted text-[11px] font-bold uppercase tracking-[0.14em]">Vigencia</h4>
                  <div className="grid gap-3 md:grid-cols-2">
                    <Input
                      label="Periodo inicial (aaaa-mm)"
                      type="month"
                      value={form.startsPeriod}
                      error={errors.startsPeriod}
                      onChange={(event) => patchForm({ startsPeriod: event.target.value })}
                      required
                    />

                    <Input
                      label="Periodo final (aaaa-mm)"
                      type="month"
                      value={form.endsPeriod}
                      error={errors.endsPeriod}
                      onChange={(event) => patchForm({ endsPeriod: event.target.value })}
                    />

                    <Input
                      label="Efectiva desde (aaaa-mm-dd)"
                      type="date"
                      value={form.effectiveFrom}
                      error={errors.effectiveFrom}
                      onChange={(event) => patchForm({ effectiveFrom: event.target.value })}
                    />
                  </div>
                  <p className="text-muted m-0 text-[11px] font-medium">
                    Deja el periodo final vacío para que la plantilla sea indefinida. La fecha efectiva solo gobierna el
                    primer periodo.
                  </p>
                </section>

                <section className="drawer-section-semantic rounded-none border-[var(--color-border)] bg-[var(--color-surface-2)]">
                  <h4 className="text-muted text-[11px] font-bold uppercase tracking-[0.14em]">Opcionales</h4>
                  <div className="grid gap-3 md:grid-cols-2">
                    <Select
                      label="Cuenta"
                      value={form.accountId ?? ""}
                      onChange={(event) => patchForm({ accountId: event.target.value ? Number(event.target.value) : null })}
                    >
                      <option value="">Sin cuenta</option>
                      {accounts.map((account) => (
                        <option key={account.accountId} value={account.accountId}>
                          {account.name}
                        </option>
                      ))}
                    </Select>

                    <Select
                      label="Comercio"
                      value={form.merchantId ?? ""}
                      onChange={(event) => patchForm({ merchantId: event.target.value ? Number(event.target.value) : null })}
                    >
                      <option value="">Sin comercio</option>
                      {merchants.map((merchant) => (
                        <option key={merchant.merchantId} value={merchant.merchantId}>
                          {merchant.name}
                        </option>
                      ))}
                    </Select>
                  </div>

                  {/* La ejecución automática solo existe para gasto y depende de la salida de Telegram. */}
                  {showAutoExecute ? (
                    <div className="grid gap-1.5">
                      <label className="text-secondary flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={form.autoExecute}
                          disabled={!config.autoExecuteAvailable}
                          onChange={(event) => patchForm({ autoExecute: event.target.checked })}
                        />
                        Ejecución automática
                      </label>
                      {!config.autoExecuteAvailable && config.reason ? (
                        <p className="text-muted m-0 text-[11px] font-medium">{config.reason}</p>
                      ) : null}
                    </div>
                  ) : null}
                </section>
              </div>

              <div className="drawer-footer-semantic">
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="secondary" className="h-8 rounded-none px-3 text-xs font-bold" onClick={closeDrawer}>
                    Cancelar
                  </Button>
                  <Button type="submit" variant="primary" loading={saving} loadingText="Guardando..." className="h-8 rounded-none px-3 text-xs font-bold">
                    {isEditing ? "Guardar cambios" : "Crear partida"}
                  </Button>
                </div>
              </div>
            </form>
          </Card>
        </div>
      ) : null}
    </>
  );
}
