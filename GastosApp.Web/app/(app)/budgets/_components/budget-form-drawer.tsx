"use client";

import { Trash2, X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { Category } from "@/lib/contracts/categories";
import type { Subcategory } from "@/lib/contracts/subcategories";
import { formatCurrency } from "@/lib/format/currency";
import { cn } from "@/lib/ui/cn";
import { tableActionBaseClass, tableActionStyles } from "@/lib/ui/table-action-styles";
import {
  addThresholdRow,
  MAX_BUDGET_THRESHOLDS,
  patchThresholdRow,
  removeThresholdRow,
  type BudgetFormErrors,
  type BudgetFormValues,
  type BudgetThresholdFormValue
} from "../_lib/budget-form-model";
import { BUDGETS_MODULE_META, formatPercent } from "../_lib/budgets-ui";
import type { BudgetRow } from "../_hooks/use-budgets-admin";

type Props = {
  open: boolean;
  editing: BudgetRow | null;
  periodLabel: string;
  form: BudgetFormValues;
  errors: BudgetFormErrors;
  submitError: string | null;
  submitting: boolean;
  categories: Category[];
  subcategories: Subcategory[];
  onClose: () => void;
  onChange: (patch: Partial<BudgetFormValues>) => void;
  onThresholdsChange: (updater: (current: BudgetThresholdFormValue[]) => BudgetThresholdFormValue[]) => void;
  onSubmit: () => void;
};

const SCOPE_OPTIONS = [
  { value: "category", label: "Categoría" },
  { value: "subcategory", label: "Subcategoría" }
] as const;

export function BudgetFormDrawer({
  open,
  editing,
  periodLabel,
  form,
  errors,
  submitError,
  submitting,
  categories,
  subcategories,
  onClose,
  onChange,
  onThresholdsChange,
  onSubmit
}: Props) {
  const titleId = useId();
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) {
      triggerRef.current?.focus();
      return;
    }

    triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const onKeyDown = (event: KeyboardEvent) => {
      const drawer = drawerRef.current;
      if (!drawer) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusableElements = drawer.querySelectorAll<HTMLElement>(
        "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
      );

      if (focusableElements.length === 0) {
        event.preventDefault();
        closeButtonRef.current?.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey) {
        if (activeElement === firstElement || !drawer.contains(activeElement)) {
          event.preventDefault();
          lastElement.focus();
        }
        return;
      }

      if (activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    const raf = window.requestAnimationFrame(() => {
      const drawer = drawerRef.current;
      if (!drawer) {
        return;
      }

      const autoFocusTarget = drawer.querySelector<HTMLElement>("[data-autofocus]");
      const firstInputTarget = drawer.querySelector<HTMLElement>("input:not([disabled]), select:not([disabled]), textarea:not([disabled])");
      if (autoFocusTarget) {
        autoFocusTarget.focus();
        return;
      }

      if (firstInputTarget) {
        firstInputTarget.focus();
        return;
      }

      closeButtonRef.current?.focus();
    });

    document.addEventListener("keydown", onKeyDown);

    return () => {
      window.cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!open) {
    return null;
  }

  const canAddThreshold = form.thresholds.length < MAX_BUDGET_THRESHOLDS;

  return (
    <div
      className="drawer-enter-backdrop fixed inset-0 z-[70] flex items-end justify-end bg-[var(--color-overlay)] backdrop-blur-sm sm:items-stretch"
      role="presentation"
      onClick={onClose}
    >
      <div
        ref={drawerRef}
        className="drawer-enter-panel app-sidebar relative flex h-[100dvh] w-full flex-col border-l sm:h-full sm:max-w-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="drawer-header-semantic">
          <div className="mb-1 h-1 w-12 bg-[var(--color-accent)]/70 sm:hidden" />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="shell-page-kicker">{BUDGETS_MODULE_META.title}</p>
              <h3 id={titleId} className="text-primary mt-1 text-lg font-semibold">
                {editing ? `Editar presupuesto: ${editing.status.name}` : "Nuevo presupuesto"}
              </h3>
            </div>
            <Button ref={closeButtonRef} type="button" variant="ghost" className="btn-close-semantic" onClick={onClose}>
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Cerrar</span>
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          <div className="space-y-4">
            <section className="drawer-section-semantic rounded-none border-[var(--color-border)] bg-[var(--color-surface-2)]">
              <h4 className="text-muted text-[11px] font-bold uppercase tracking-[0.14em]">General</h4>
              <div className="grid gap-3 md:grid-cols-2">
                <Input
                  data-autofocus
                  label="Nombre"
                  value={form.name}
                  error={errors.name}
                  onChange={(event) => onChange({ name: event.target.value })}
                  required
                />

                <div className="grid gap-1.5 text-sm font-medium text-primary">
                  <span>Periodo</span>
                  <p className="m-0 flex h-10 items-center border border-default bg-[var(--color-surface-3)] px-3 text-sm font-medium text-muted">
                    {periodLabel}
                  </p>
                </div>

                <Input
                  label="Monto mensual (MXN)"
                  type="number"
                  inputMode="decimal"
                  min={0.01}
                  step={0.01}
                  value={form.amountMxn}
                  error={errors.amountMxn}
                  onChange={(event) => onChange({ amountMxn: event.target.value })}
                  required
                />

                {editing ? (
                  <div className="grid gap-1.5 text-sm font-medium text-primary">
                    <span>Avance actual</span>
                    <p className="m-0 flex h-10 items-center border border-default bg-[var(--color-surface-3)] px-3 text-sm font-medium text-muted">
                      {formatCurrency(editing.status.spent)} de {formatCurrency(editing.status.amountMxn)} ·{" "}
                      {formatPercent(editing.status.percentUsed)}
                    </p>
                  </div>
                ) : null}
              </div>
            </section>

            <section className="drawer-section-semantic rounded-none border-[var(--color-border)] bg-[var(--color-surface-2)]">
              <h4 className="text-muted text-[11px] font-bold uppercase tracking-[0.14em]">Alcance</h4>
              <fieldset className="grid gap-2">
                <legend className="sr-only">Tipo de alcance</legend>
                <div className="flex flex-wrap gap-1.5">
                  {SCOPE_OPTIONS.map((option) => {
                    const isActive = form.scopeType === option.value;
                    return (
                      <label
                        key={option.value}
                        className={cn(
                          "focus-ring inline-flex h-9 cursor-pointer items-center border px-3 text-xs font-bold transition",
                          isActive
                            ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-accent-contrast)]"
                            : "border-default bg-[var(--color-surface-1)] text-muted hover:bg-[var(--color-accent-soft)] hover:text-primary"
                        )}
                      >
                        <input
                          type="radio"
                          name="budget-scope"
                          value={option.value}
                          checked={isActive}
                          onChange={() => onChange({ scopeType: option.value })}
                          className="sr-only"
                        />
                        {option.label}
                      </label>
                    );
                  })}
                </div>

                {form.scopeType === "category" ? (
                  <Select
                    label="Categoría de gasto"
                    value={form.categoryId ?? ""}
                    error={errors.scope}
                    onChange={(event) => onChange({ categoryId: event.target.value ? Number(event.target.value) : null })}
                    required
                  >
                    <option value="">Selecciona una categoría</option>
                    {categories.map((category) => (
                      <option key={category.categoryId} value={category.categoryId}>
                        {category.name}
                        {category.active ? "" : " (inactiva)"}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Select
                    label="Subcategoría de gasto"
                    value={form.subcategoryId ?? ""}
                    error={errors.scope}
                    onChange={(event) => onChange({ subcategoryId: event.target.value ? Number(event.target.value) : null })}
                    required
                  >
                    <option value="">Selecciona una subcategoría</option>
                    {subcategories.map((subcategory) => (
                      <option key={subcategory.subcategoryId} value={subcategory.subcategoryId}>
                        {subcategory.name}
                        {subcategory.active ? "" : " (inactiva)"}
                      </option>
                    ))}
                  </Select>
                )}

                <p className="m-0 text-[11px] font-medium text-muted">
                  Un presupuesto por categoría incluye el gasto de sus subcategorías. Un alcance no se puede repetir dentro del mismo periodo.
                </p>
              </fieldset>
            </section>

            <section className="drawer-section-semantic rounded-none border-[var(--color-border)] bg-[var(--color-surface-2)]">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-muted text-[11px] font-bold uppercase tracking-[0.14em]">Umbrales de alerta</h4>
                <span className="text-muted text-[11px] font-medium">
                  {form.thresholds.length}/{MAX_BUDGET_THRESHOLDS}
                </span>
              </div>

              {form.thresholds.length === 0 ? null : (
                <div className="grid grid-cols-[minmax(0,1fr)_6.5rem_5.5rem_auto] items-center gap-1.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
                  <span>Nombre</span>
                  <span>Porcentaje</span>
                  <span>Activo</span>
                  <span className="sr-only">Acciones</span>
                </div>
              )}

              <ul className="grid gap-2">
                {form.thresholds.map((threshold, index) => (
                  <li key={threshold.key} className="grid grid-cols-[minmax(0,1fr)_6.5rem_5.5rem_auto] items-center gap-1.5">
                    <Input
                      id={`threshold-name-${threshold.key}`}
                      aria-label={`Nombre del umbral ${index + 1}`}
                      placeholder="Aviso"
                      value={threshold.name}
                      onChange={(event) => onThresholdsChange((current) => patchThresholdRow(current, threshold.key, { name: event.target.value }))}
                    />
                    <Input
                      id={`threshold-percent-${threshold.key}`}
                      aria-label={`Porcentaje del umbral ${index + 1}`}
                      type="number"
                      inputMode="decimal"
                      min={0.01}
                      max={999.99}
                      step={0.01}
                      placeholder="80"
                      value={threshold.percent}
                      onChange={(event) => onThresholdsChange((current) => patchThresholdRow(current, threshold.key, { percent: event.target.value }))}
                    />
                    <label className="flex h-10 items-center gap-1.5 text-xs font-semibold text-muted">
                      <input
                        type="checkbox"
                        checked={threshold.active}
                        onChange={(event) => onThresholdsChange((current) => patchThresholdRow(current, threshold.key, { active: event.target.checked }))}
                        className="h-4 w-4 accent-[var(--color-accent)]"
                        aria-label={`Umbral ${index + 1} activo`}
                      />
                      Activo
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      className={cn(tableActionBaseClass, tableActionStyles.delete)}
                      onClick={() => onThresholdsChange((current) => removeThresholdRow(current, threshold.key))}
                      aria-label={`Quitar umbral ${index + 1}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </li>
                ))}
              </ul>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="h-8 rounded-none px-3 text-xs font-bold"
                  disabled={!canAddThreshold}
                  onClick={() => onThresholdsChange((current) => addThresholdRow(current))}
                >
                  Agregar umbral
                </Button>
                <p className="m-0 text-[11px] font-medium text-muted">Las alertas se envían por Telegram cuando el gasto del mes cruza el porcentaje.</p>
              </div>

              {errors.thresholds ? <p className="m-0 text-xs font-medium text-[var(--color-danger)]">{errors.thresholds}</p> : null}
            </section>

            {submitError ? <Alert variant="danger">{submitError}</Alert> : null}
          </div>
        </div>

        <div className="drawer-footer-semantic">
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" className="h-8 rounded-none px-3 text-xs font-bold" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="primary"
              loading={submitting}
              loadingText="Guardando..."
              className="h-8 rounded-none px-3 text-xs font-bold"
              onClick={onSubmit}
            >
              {editing ? "Guardar cambios" : "Crear presupuesto"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
