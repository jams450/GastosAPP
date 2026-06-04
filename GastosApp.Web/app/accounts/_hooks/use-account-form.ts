"use client";

import { useState } from "react";
import type { Account } from "@/lib/contracts/accounts";
import { toAccountUpsertPayload, type AccountFormErrors, type AccountUpsertPayload } from "@/lib/contracts/accounts-admin";

export function useAccountForm() {
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [form, setForm] = useState<AccountUpsertPayload>(toAccountUpsertPayload());
  const [formErrors, setFormErrors] = useState<AccountFormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function openCreate() {
    setEditing(null);
    setForm(toAccountUpsertPayload());
    setFormErrors({});
    setSubmitError(null);
    setOpenForm(true);
  }

  function openEdit(account: Account) {
    setEditing(account);
    setForm(toAccountUpsertPayload(account));
    setFormErrors({});
    setSubmitError(null);
    setOpenForm(true);
  }

  function closeForm() {
    setOpenForm(false);
  }

  function onFormChange<K extends keyof AccountUpsertPayload>(key: K, value: AccountUpsertPayload[K]) {
    setForm((current) => ({
      ...current,
      [key]: value,
      ...(key === "isCredit" && value === false
        ? { dueDay: null, paymentDueDay: null, creditLimit: null }
        : {})
    }));
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
    setOpenForm,
    openCreate,
    openEdit,
    closeForm,
    onFormChange
  };
}
