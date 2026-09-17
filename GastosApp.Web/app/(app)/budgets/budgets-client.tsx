"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/navigation/page-header";
import { currentBudgetPeriod } from "@/lib/contracts/budgets";
import {
  thresholdsChanged,
  toBudgetCreatePayload,
  toBudgetUpdatePayload,
  toThresholdPayload,
  validateBudgetForm
} from "./_lib/budget-form-model";
import { BUDGETS_MODULE_META, formatPeriodLabel, resolveBudgetsTab, summarizeBudgetStatuses, type BudgetsTab } from "./_lib/budgets-ui";
import { AlertsHistoryPanel } from "./_components/alerts-history-panel";
import { BudgetFormDrawer } from "./_components/budget-form-drawer";
import { BudgetsKpis } from "./_components/budgets-kpis";
import { BudgetsResults } from "./_components/budgets-results";
import { BudgetsToastStack } from "./_components/budgets-toast-stack";
import { BudgetsToolbar } from "./_components/budgets-toolbar";
import { useAlertsHistory } from "./_hooks/use-alerts-history";
import { useBudgetForm } from "./_hooks/use-budget-form";
import { useBudgetsAdmin, type BudgetRow } from "./_hooks/use-budgets-admin";
import { useBudgetsToasts } from "./_hooks/use-budgets-toasts";

export function BudgetsClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedPeriod = searchParams.get("period");
  const [period, setPeriod] = useState(requestedPeriod && /^\d{4}-(0[1-9]|1[0-2])$/.test(requestedPeriod) ? requestedPeriod : currentBudgetPeriod());
  const tab = resolveBudgetsTab(searchParams.get("tab"));

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

    // La pestaña de alertas es el único valor de query: el resumen es la URL limpia.
    router.replace(next === "alertas" ? `${pathname}?tab=alertas` : pathname, { scroll: false });
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
          canCreate={tab === "resumen"}
          onPeriodChange={setPeriod}
          onTabChange={onTabChange}
          onCreate={openCreate}
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
    </>
  );
}

function BudgetsKpisSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" role="status" aria-live="polite" aria-label="Cargando resumen del periodo">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="animate-pulse border border-default bg-[var(--color-surface-2)] p-4">
          <div className="h-2.5 w-28 rounded-none bg-[var(--color-surface-3)]" />
          <div className="mt-4 h-6 w-32 rounded-none bg-[var(--color-surface-3)]" />
        </div>
      ))}
    </div>
  );
}
