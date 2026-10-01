"use client";

import { useState } from "react";
import type { BudgetItem } from "@/lib/contracts/budget-items";
import {
  createEmptyBudgetItemForm,
  toBudgetItemFormValues,
  type BudgetItemFormErrors,
  type BudgetItemFormValues
} from "../_lib/budget-item-form-model";

export function useBudgetItemForm() {
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<BudgetItem | null>(null);
  const [form, setForm] = useState<BudgetItemFormValues>(() => createEmptyBudgetItemForm(""));
  const [formErrors, setFormErrors] = useState<BudgetItemFormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function openCreate(defaultDate: string) {
    setEditing(null);
    setForm(createEmptyBudgetItemForm(defaultDate));
    setFormErrors({});
    setSubmitError(null);
    setOpenForm(true);
  }

  function openEdit(item: BudgetItem) {
    setEditing(item);
    setForm(toBudgetItemFormValues(item));
    setFormErrors({});
    setSubmitError(null);
    setOpenForm(true);
  }

  function closeForm() {
    setOpenForm(false);
  }

  function onFormChange(patch: Partial<BudgetItemFormValues>) {
    setForm((current) => ({ ...current, ...patch }));
  }

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
    onFormChange
  };
}
