"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/navigation/page-header";
import { currentBudgetPeriod } from "@/lib/contracts/budgets";
import {
  thresholdsChanged,
  toBudgetCreatePayload,
  toBudgetUpdatePayload,
  toThresholdPayload,
  validateBudgetForm
} from "./_lib/budget-form-model";
import {
  BUDGETS_MODULE_META,
  budgetsTabQueryValue,
  formatPeriodLabel,
  resolveBudgetsTab,
  summarizeBudgetStatuses,
  type BudgetsTab
} from "./_lib/budgets-ui";
import {
  toBudgetItemWriteRequest,
  validateBudgetItemForm
} from "./_lib/budget-item-form-model";
import type { BudgetItemKindFilter } from "./_lib/budget-items-model";
import type { BudgetItem } from "@/lib/contracts/budget-items";
import { AlertsHistoryPanel } from "./_components/alerts-history-panel";
import { BudgetFormDrawer } from "./_components/budget-form-drawer";
import { BudgetItemFormDrawer } from "./_components/budget-item-form-drawer";
import { BudgetItemsPanel } from "./_components/budget-items-panel";
import { BudgetsKpis } from "./_components/budgets-kpis";
import { BudgetsResults } from "./_components/budgets-results";
import { BudgetsToastStack } from "./_components/budgets-toast-stack";
import { BudgetsToolbar } from "./_components/budgets-toolbar";
import { useAlertsHistory } from "./_hooks/use-alerts-history";
import { useBudgetForm } from "./_hooks/use-budget-form";
import { useBudgetItemForm } from "./_hooks/use-budget-item-form";
import { useBudgetItems } from "./_hooks/use-budget-items";
import { useBudgetsAdmin, type BudgetRow } from "./_hooks/use-budgets-admin";
import { useBudgetsToasts } from "./_hooks/use-budgets-toasts";

export function BudgetsClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedPeriod = searchParams.get("period");
  const [period, setPeriod] = useState(requestedPeriod && /^\d{4}-(0[1-9]|1[0-2])$/.test(requestedPeriod) ? requestedPeriod : currentBudgetPeriod());
  const tab = resolveBudgetsTab(searchParams.get("tab"));
  // El filtro por tipo es local: el mismo fetch del periodo sirve a las tres vistas.
  const [kindFilter, setKindFilter] = useState<BudgetItemKindFilter>("all");

  const {
    rows,
    catalogs,
    expenseCategories,
    expenseSubcategories,
    loading,
    error: loadError,
    setError: setLoadError,
    create,
    update,
    toggleActive
  } = useBudgetsAdmin(period);
  const { toasts, dismissToast, success, error: errorToast } = useBudgetsToasts();
  const {
    openForm,
    editing,
    form,
    formErrors,
    submitError,
    submitting,
    setFormErrors,
    setSubmitError,
    setSubmitting,
    openCreate,
    openEdit,
    closeForm,
    onFormChange,
    onThresholdsChange
  } = useBudgetForm();
  const {
    deliveries,
    failedByDeliveryId,
    loading: alertsLoading,
    error: alertsError,
    retryingId,
    retry
  } = useAlertsHistory(period, tab === "alertas");
  const {
    items,
    cancelledCount,
    catalogs: itemCatalogs,
    categories: itemCategories,
    subcategories: itemSubcategories,
    accounts: itemAccounts,
    merchants: itemMerchants,
    loading: itemsLoading,
    error: itemsError,
    busyItemId,
    create: createItem,
    update: updateItem,
    changeStatus: changeItemStatus,
    cancel: cancelItem,
    purge: purgeItems
  } = useBudgetItems(period, kindFilter);
  const {
    openForm: openItemForm,
    editing: editingItem,
    form: itemForm,
    formErrors: itemFormErrors,
    submitError: itemSubmitError,
    submitting: itemSubmitting,
    setFormErrors: setItemFormErrors,
    setSubmitError: setItemSubmitError,
    setSubmitting: setItemSubmitting,
    openCreate: openItemCreate,
    openEdit: openItemEdit,
    closeForm: closeItemForm,
    onFormChange: onItemFormChange
  } = useBudgetItemForm();

  const totals = useMemo(() => summarizeBudgetStatuses(rows.map((row) => row.status)), [rows]);
  const periodLabel = formatPeriodLabel(period);

  useEffect(() => {
    if (!loadError) {
      return;
    }

    errorToast(loadError);
    setLoadError(null);
  }, [loadError, errorToast, setLoadError]);

  function onTabChange(next: BudgetsTab) {
    if (next === tab) {
      return;
    }

    // La URL solo distingue las pestañas no predeterminadas: el resumen es la URL limpia.
    const query = budgetsTabQueryValue(next);
    router.replace(query ? `${pathname}?tab=${query}` : pathname, { scroll: false });
  }

  async function onSave() {
    const validation = validateBudgetForm(form);
    setFormErrors(validation);
    if (Object.keys(validation).length > 0) {
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      if (editing) {
        const thresholds = thresholdsChanged(editing.thresholds, form) ? toThresholdPayload(form) : null;
        await update(editing.status.budgetId, toBudgetUpdatePayload(form, editing.status.active), thresholds);
      } else {
        await create(toBudgetCreatePayload(form, period));
      }

      closeForm();
      success(editing ? "Presupuesto actualizado" : "Presupuesto creado");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "No se pudo guardar el presupuesto");
    } finally {
      setSubmitting(false);
    }
  }

  async function onToggleActive(row: BudgetRow) {
    try {
      await toggleActive(row);
      success(row.status.active ? "Presupuesto desactivado" : "Presupuesto activado");
    } catch (err) {
      errorToast(err instanceof Error ? err.message : "No se pudo actualizar el estado");
    }
  }

  async function onRetry(deliveryId: number) {
    try {
      const result = await retry(deliveryId);
      if (!result) {
        return;
      }

      if (result.success) {
        success("Alerta reencolada para envío");
      } else {
        errorToast("El reintento no pudo reencolar la alerta");
      }
    } catch (err) {
      errorToast(err instanceof Error ? err.message : "No se pudo reintentar la alerta");
    }
  }

  function onCreateItem() {
    // El alta parte del mes seleccionado en la barra de periodo.
    openItemCreate(period === currentBudgetPeriod() ? todayIso() : `${period}-01`);
  }

  async function onSaveItem() {
    const validation = validateBudgetItemForm(itemForm);
    setItemFormErrors(validation);
    if (Object.keys(validation).length > 0) {
      return;
    }

    setItemSubmitting(true);
    setItemSubmitError(null);

    try {
      const payload = toBudgetItemWriteRequest(itemForm);
      if (editingItem) {
        await updateItem(editingItem.itemId, payload);
      } else {
        await createItem(payload);
      }

      closeItemForm();
      success(editingItem ? "Partida actualizada" : "Partida creada");
    } catch (err) {
      setItemSubmitError(err instanceof Error ? err.message : "No se pudo guardar la partida");
    } finally {
      setItemSubmitting(false);
    }
  }

  async function onCancelItem(item: BudgetItem) {
    try {
      await cancelItem(item.itemId);
      success("Partida cancelada");
    } catch (err) {
      errorToast(err instanceof Error ? err.message : "No se pudo cancelar la partida");
    }
  }

  /** Volver a `pending` es la transición inversa de "Ignorar" y no está en el menú de estados. */
  async function onRestoreItem(item: BudgetItem) {
    try {
      await changeItemStatus(item.itemId, "pending");
      success("Partida reactivada");
    } catch (err) {
      errorToast(err instanceof Error ? err.message : "No se pudo reactivar la partida");
    }
  }

  async function onIgnoreItem(item: BudgetItem) {
    try {
      await changeItemStatus(item.itemId, "ignored");
      success("Partida ignorada: su monto deja de contar");
    } catch (err) {
      errorToast(err instanceof Error ? err.message : "No se pudo ignorar la partida");
    }
  }

  async function onPurgeItems() {
    // La purga borra de forma permanente: se confirma antes, como en el resto de la app.
    if (!window.confirm("¿Eliminar definitivamente las partidas canceladas de este periodo?")) {
      return;
    }

    try {
      const deleted = await purgeItems();
      success(typeof deleted === "number" ? `Partidas eliminadas: ${deleted}` : "Partidas canceladas eliminadas");
    } catch (err) {
      errorToast(err instanceof Error ? err.message : "No se pudieron eliminar las partidas canceladas");
    }
  }

  return (
    <>
      <PageHeader
        section={BUDGETS_MODULE_META.section}
        title={BUDGETS_MODULE_META.title}
        subtitle="Límites mensuales por categoría o subcategoría, gasto acumulado y alertas por Telegram."
        variant="plain"
      />
      <BudgetsToastStack toasts={toasts} onDismiss={dismissToast} />

      <section className="space-y-3">
        <BudgetsToolbar
          period={period}
          tab={tab}
          createLabel={
            tab === "partidas" ? "Nueva partida" : tab === "resumen" ? "Nuevo presupuesto" : null
          }
          onPeriodChange={setPeriod}
          onTabChange={onTabChange}
          onCreate={tab === "partidas" ? onCreateItem : openCreate}
        />

        {tab === "resumen" ? (
          <div id="budgets-panel-resumen" role="tabpanel" aria-labelledby="budgets-tab-resumen" className="space-y-3">
            {loading ? <BudgetsKpisSkeleton /> : <BudgetsKpis totals={totals} periodLabel={periodLabel} />}
            <BudgetsResults
              rows={rows}
              loading={loading}
              catalogs={catalogs}
              onCreate={openCreate}
              onEdit={openEdit}
              onToggleActive={onToggleActive}
            />
          </div>
        ) : tab === "partidas" ? (
          <div id="budgets-panel-partidas" role="tabpanel" aria-labelledby="budgets-tab-partidas" className="space-y-3">
            <BudgetItemsPanel
              items={items}
              loading={itemsLoading}
              errorMessage={itemsError}
              kindFilter={kindFilter}
              busyItemId={busyItemId}
              catalogs={itemCatalogs}
              onKindFilterChange={setKindFilter}
              onCreate={onCreateItem}
              onEdit={openItemEdit}
              onCancel={onCancelItem}
              onRestore={onRestoreItem}
              onIgnore={onIgnoreItem}
            />

            {cancelledCount > 0 ? (
              <div className="app-panel flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <p className="m-0 text-[11px] font-medium text-muted">
                  {cancelledCount === 1 ? "1 partida cancelada" : `${cancelledCount} partidas canceladas`} ocupan espacio de la lista.
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-8 rounded-none border px-2.5 text-[11px] font-bold border-red-400/60 bg-red-500/15 text-red-700 hover:border-red-500/70 hover:bg-red-500/25 dark:border-red-700/60 dark:bg-red-500/25 dark:text-red-300"
                  onClick={onPurgeItems}
                >
                  Eliminar canceladas
                </Button>
              </div>
            ) : null}
          </div>
        ) : (
          <div id="budgets-panel-alertas" role="tabpanel" aria-labelledby="budgets-tab-alertas">
            <AlertsHistoryPanel
              deliveries={deliveries}
              failedByDeliveryId={failedByDeliveryId}
              loading={alertsLoading}
              errorMessage={alertsError}
              retryingId={retryingId}
              periodLabel={periodLabel}
              onRetry={onRetry}
            />
          </div>
        )}
      </section>

      <BudgetFormDrawer
        open={openForm}
        editing={editing}
        periodLabel={periodLabel}
        form={form}
        errors={formErrors}
        submitError={submitError}
        submitting={submitting}
        categories={expenseCategories}
        subcategories={expenseSubcategories}
        onClose={closeForm}
        onChange={onFormChange}
        onThresholdsChange={onThresholdsChange}
        onSubmit={onSave}
      />

      <BudgetItemFormDrawer
        open={openItemForm}
        editing={editingItem}
        periodLabel={periodLabel}
        form={itemForm}
        errors={itemFormErrors}
        submitError={itemSubmitError}
        submitting={itemSubmitting}
        categories={itemCategories}
        subcategories={itemSubcategories}
        accounts={itemAccounts}
        merchants={itemMerchants}
        onClose={closeItemForm}
        onChange={onItemFormChange}
        onSubmit={onSaveItem}
      />
    </>
  );
}

function BudgetsKpisSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" role="status" aria-live="polite" aria-label="Cargando resumen del periodo">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="animate-pulse border border-default bg-[var(--color-surface-2)] p-4">
          <div className="h-2.5 w-28 rounded-none bg-[var(--color-surface-3)]" />
          <div className="mt-4 h-6 w-32 rounded-none bg-[var(--color-surface-3)]" />
        </div>
      ))}
    </div>
  );
}

/** Fecha de hoy en `yyyy-MM-dd` local: es la que espera el `<input type="date">` del alta. */
function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}
