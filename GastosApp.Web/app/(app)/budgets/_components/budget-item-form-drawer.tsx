"use client";

import { X } from "lucide-react";
import { useEffect, useId, useMemo, useRef } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { Account } from "@/lib/contracts/accounts";
import type { BudgetItem } from "@/lib/contracts/budget-items";
import type { Category } from "@/lib/contracts/categories";
import type { Merchant } from "@/lib/contracts/merchants";
import type { Subcategory } from "@/lib/contracts/subcategories";
import { cn } from "@/lib/ui/cn";
import {
  MAX_BUDGET_ITEM_NAME_LENGTH,
  MAX_BUDGET_ITEM_NOTES_LENGTH,
  type BudgetItemFormErrors,
  type BudgetItemFormValues
} from "../_lib/budget-item-form-model";

type Props = {
  open: boolean;
  editing: BudgetItem | null;
  periodLabel: string;
  form: BudgetItemFormValues;
  errors: BudgetItemFormErrors;
  submitError: string | null;
  submitting: boolean;
  categories: Category[];
  subcategories: Subcategory[];
  accounts: Account[];
  merchants: Merchant[];
  onClose: () => void;
  onChange: (patch: Partial<BudgetItemFormValues>) => void;
  onSubmit: () => void;
};

const KIND_OPTIONS = [
  { value: "expense", label: "Gasto" },
  { value: "income", label: "Ingreso" }
] as const;

/**
 * Alta y edición de partidas. `kind` solo es editable en el alta: el backend lo trata como
 * inmutable y responde 400 si cambia, así que en edición se muestra como dato fijo.
 */
export function BudgetItemFormDrawer({
  open,
  editing,
  periodLabel,
  form,
  errors,
  submitError,
  submitting,
  categories,
  subcategories,
  accounts,
  merchants,
  onClose,
  onChange,
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

  const isIncome = form.kind === "income";

  // Un ingreso solo admite categoría de ingreso y nunca subcategoría: es la misma regla que
  // aplica el backend, así que el selector se restringe aquí en vez de dejar que falle.
  const categoryOptions = useMemo(
    () => categories.filter((category) => category.type === (isIncome ? "income" : "expense")),
    [categories, isIncome]
  );

  const allowedCategoryIds = useMemo(() => new Set(categoryOptions.map((category) => category.categoryId)), [categoryOptions]);
  const subcategoryOptions = useMemo(
    () => (isIncome ? [] : subcategories.filter((subcategory) => allowedCategoryIds.has(subcategory.categoryId))),
    [allowedCategoryIds, isIncome, subcategories]
  );

  if (!open) {
    return null;
  }

  const scopeMode = isIncome || form.categoryId !== null ? "category" : "subcategory";

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
              <p className="shell-page-kicker">Partidas planificadas</p>
              <h3 id={titleId} className="text-primary mt-1 text-lg font-semibold">
                {editing ? `Editar partida: ${editing.name}` : "Nueva partida"}
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
                  maxLength={MAX_BUDGET_ITEM_NAME_LENGTH}
                  onChange={(event) => onChange({ name: event.target.value })}
                  required
                />

                <div className="grid gap-1.5 text-sm font-medium text-primary">
                  <span>Tipo de partida</span>
                  <div className="flex flex-wrap gap-1.5">
                    {KIND_OPTIONS.map((option) => {
                      const isActive = form.kind === option.value;
                      return (
                        <label
                          key={option.value}
                          className={cn(
                            "focus-ring inline-flex h-10 items-center border px-3 text-xs font-bold transition",
                            isActive
                              ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-accent-contrast)]"
                              : "border-default bg-[var(--color-surface-1)] text-muted hover:bg-[var(--color-accent-soft)] hover:text-primary",
                            editing && "cursor-not-allowed opacity-60"
                          )}
                        >
                          <input
                            type="radio"
                            name="budget-item-kind"
                            value={option.value}
                            checked={isActive}
                            disabled={Boolean(editing)}
                            onChange={() =>
                              // Cambiar de tipo reencuadra el alcance: el ingreso no admite subcategoría.
                              onChange({ kind: option.value, subcategoryId: option.value === "income" ? null : form.subcategoryId })
                            }
                            className="sr-only"
                          />
                          {option.label}
                        </label>
                      );
                    })}
                  </div>
                  {editing ? <p className="m-0 text-[11px] font-medium text-muted">El tipo no se puede cambiar tras el alta.</p> : null}
                </div>

                <Input
                  label="Monto planificado (MXN)"
                  type="number"
                  inputMode="decimal"
                  min={0.01}
                  step={0.01}
                  value={form.plannedAmount}
                  error={errors.plannedAmount}
                  onChange={(event) => onChange({ plannedAmount: event.target.value })}
                  required
                />

                <Input
                  label="Fecha planificada"
                  type="date"
                  value={form.plannedDate}
                  error={errors.plannedDate}
                  onChange={(event) => onChange({ plannedDate: event.target.value })}
                  required
                />

                <div className="grid gap-1.5 text-sm font-medium text-primary">
                  <span>Periodo</span>
                  <p className="m-0 flex h-10 items-center border border-default bg-[var(--color-surface-3)] px-3 text-sm font-medium text-muted">
                    {editing ? editing.periodKey : periodLabel}
                  </p>
                </div>
              </div>
              <p className="m-0 text-[11px] font-medium text-muted">
                El periodo se deriva de la fecha planificada. Mover una partida ejecutada a otro mes no está permitido.
              </p>
            </section>

            <section className="drawer-section-semantic rounded-none border-[var(--color-border)] bg-[var(--color-surface-2)]">
              <h4 className="text-muted text-[11px] font-bold uppercase tracking-[0.14em]">Alcance</h4>
              <fieldset className="grid gap-2">
                <legend className="sr-only">Tipo de alcance</legend>

                {isIncome ? (
                  <p className="m-0 text-[11px] font-medium text-muted">Un ingreso solo se planifica por categoría de ingreso.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {(["category", "subcategory"] as const).map((option) => {
                      const isActive = scopeMode === option;
                      return (
                        <label
                          key={option}
                          className={cn(
                            "focus-ring inline-flex h-9 cursor-pointer items-center border px-3 text-xs font-bold transition",
                            isActive
                              ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-accent-contrast)]"
                              : "border-default bg-[var(--color-surface-1)] text-muted hover:bg-[var(--color-accent-soft)] hover:text-primary"
                          )}
                        >
                          <input
                            type="radio"
                            name="budget-item-scope"
                            value={option}
                            checked={isActive}
                            onChange={() =>
                              onChange(
                                option === "category"
                                  ? { categoryId: form.categoryId ?? categoryOptions[0]?.categoryId ?? null, subcategoryId: null }
                                  : { subcategoryId: form.subcategoryId ?? subcategoryOptions[0]?.subcategoryId ?? null, categoryId: null }
                              )
                            }
                            className="sr-only"
                          />
                          {option === "category" ? "Categoría" : "Subcategoría"}
                        </label>
                      );
                    })}
                  </div>
                )}

                {scopeMode === "category" ? (
                  <Select
                    label={isIncome ? "Categoría de ingreso" : "Categoría de gasto"}
                    value={form.categoryId ?? ""}
                    error={errors.scope}
                    onChange={(event) => onChange({ categoryId: event.target.value ? Number(event.target.value) : null })}
                    required
                  >
                    <option value="">Selecciona una categoría</option>
                    {categoryOptions.map((category) => (
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
                    {subcategoryOptions.map((subcategory) => (
                      <option key={subcategory.subcategoryId} value={subcategory.subcategoryId}>
                        {subcategory.name}
                        {subcategory.active ? "" : " (inactiva)"}
                      </option>
                    ))}
                  </Select>
                )}
              </fieldset>
            </section>

            <section className="drawer-section-semantic rounded-none border-[var(--color-border)] bg-[var(--color-surface-2)]">
              <h4 className="text-muted text-[11px] font-bold uppercase tracking-[0.14em]">Opcionales</h4>
              <div className="grid gap-3 md:grid-cols-2">
                <Select
                  label="Cuenta"
                  value={form.accountId ?? ""}
                  onChange={(event) => onChange({ accountId: event.target.value ? Number(event.target.value) : null })}
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
                  onChange={(event) => onChange({ merchantId: event.target.value ? Number(event.target.value) : null })}
                >
                  <option value="">Sin comercio</option>
                  {merchants.map((merchant) => (
                    <option key={merchant.merchantId} value={merchant.merchantId}>
                      {merchant.name}
                      {merchant.active ? "" : " (inactivo)"}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="grid gap-1.5 text-sm font-medium text-primary">
                <label htmlFor="budget-item-notes">Notas</label>
                <textarea
                  id="budget-item-notes"
                  value={form.notes}
                  maxLength={MAX_BUDGET_ITEM_NOTES_LENGTH}
                  rows={3}
                  onChange={(event) => onChange({ notes: event.target.value })}
                  className="input-semantic w-full px-3 py-2 text-sm"
                  aria-invalid={Boolean(errors.notes)}
                />
                {errors.notes ? <span className="text-xs text-[var(--color-danger)]">{errors.notes}</span> : null}
              </div>
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
              {editing ? "Guardar cambios" : "Crear partida"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
