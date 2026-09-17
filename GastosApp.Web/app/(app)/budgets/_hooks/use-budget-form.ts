"use client";

import { useCallback, useState } from "react";
import type { BudgetThresholdFormValue, BudgetFormErrors, BudgetFormValues } from "../_lib/budget-form-model";
import { createEmptyBudgetForm, toBudgetFormValues } from "../_lib/budget-form-model";
import type { BudgetRow } from "./use-budgets-admin";

export function useBudgetForm() {
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<BudgetRow | null>(null);
  const [form, setForm] = useState<BudgetFormValues>(() => createEmptyBudgetForm());
  const [formErrors, setFormErrors] = useState<BudgetFormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const openCreate = useCallback(() => {
    setEditing(null);
    setForm(createEmptyBudgetForm());
    setFormErrors({});
    setSubmitError(null);
    setOpenForm(true);
  }, []);

  const openEdit = useCallback((row: BudgetRow) => {
    setEditing(row);
    setForm(toBudgetFormValues(row.status, row.thresholds));
    setFormErrors({});
    setSubmitError(null);
    setOpenForm(true);
  }, []);

  const closeForm = useCallback(() => {
    setOpenForm(false);
  }, []);

  // Cambiar de alcance limpia la selección contraria: el API exige exactamente una.
  const onFormChange = useCallback((patch: Partial<BudgetFormValues>) => {
    setForm((current) => {
      const next = { ...current, ...patch };
      if (patch.scopeType !== undefined && patch.scopeType !== current.scopeType) {
        next.categoryId = null;
        next.subcategoryId = null;
      }
      return next;
    });
  }, []);

  const onThresholdsChange = useCallback(
    (updater: (current: BudgetThresholdFormValue[]) => BudgetThresholdFormValue[]) => {
      setForm((current) => ({ ...current, thresholds: updater(current.thresholds) }));
    },
    []
  );

  return {
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
  };
}
