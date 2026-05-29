"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/navigation/admin-shell";
import { Alert } from "@/components/ui/alert";
import type { Account } from "@/lib/contracts/accounts";
import { normalizeAccounts } from "@/lib/contracts/accounts";
import { toAccountUpsertPayload, type AccountFormErrors, type AccountUpsertPayload, validateAccountPayload } from "@/lib/contracts/accounts-admin";
import { csrfFetch } from "@/lib/security/csrf-client";
import { parseApiError } from "@/lib/bff/client-session";
import { AccountsResults } from "./_components/accounts-results";
import { AccountsToolbar } from "./_components/accounts-toolbar";
import { AccountFormDrawer } from "./_components/account-form-drawer";

type Props = { username: string };

export function AccountsClient({ username }: Props) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [type, setType] = useState<"all" | "credit" | "cash">("all");

  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [form, setForm] = useState<AccountUpsertPayload>(toAccountUpsertPayload());
  const [formErrors, setFormErrors] = useState<AccountFormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function loadAccounts() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/bff/accounts", { cache: "no-store" });
      if (!response.ok) {
        throw await parseApiError(response, "No se pudieron cargar cuentas");
      }

      const payload = await response.json();
      setAccounts(normalizeAccounts(payload));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar cuentas");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAccounts();
  }, []);

  useEffect(() => {
    if (!success) return;
    const timeout = window.setTimeout(() => setSuccess(null), 2500);
    return () => window.clearTimeout(timeout);
  }, [success]);

  const filtered = useMemo(() => {
    return accounts.filter((account) => {
      if (status === "active" && !account.active) return false;
      if (status === "inactive" && account.active) return false;
      if (type === "credit" && !account.isCredit) return false;
      if (type === "cash" && account.isCredit) return false;
      if (search.trim() && !account.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
      return true;
    });
  }, [accounts, search, status, type]);

  const hasActiveFilters = status !== "all" || type !== "all" || search.trim().length > 0;

  function resetFilters() {
    setSearch("");
    setStatus("all");
    setType("all");
  }

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

  function onFormChange<K extends keyof AccountUpsertPayload>(key: K, value: AccountUpsertPayload[K]) {
    setForm((current) => ({
      ...current,
      [key]: value,
      ...(key === "isCredit" && value === false
        ? { dueDay: null, paymentDueDay: null, creditLimit: null }
        : {})
    }));
  }

  async function saveAccount() {
    const validation = validateAccountPayload(form);
    setFormErrors(validation);
    if (Object.keys(validation).length > 0) {
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    const payload = {
      name: form.name.trim(),
      color: form.color,
      active: form.active,
      startDate: form.startDate,
      isCredit: form.isCredit,
      dueDay: form.isCredit ? form.dueDay : null,
      paymentDueDay: form.isCredit ? form.paymentDueDay : null,
      earnsInterest: form.earnsInterest,
      annualInterestRate: form.earnsInterest ? form.annualInterestRate : 0,
      initialBalance: form.initialBalance,
      currentBalance: form.currentBalance,
      creditLimit: form.isCredit ? form.creditLimit : null
    };

    try {
      const url = editing ? `/api/bff/accounts/${editing.accountId}` : "/api/bff/accounts";
      const method = editing ? "PUT" : "POST";
      const response = await csrfFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw await parseApiError(response, "No se pudo guardar cuenta");
      }

      setOpenForm(false);
      setSuccess(editing ? "Cuenta actualizada" : "Cuenta creada");
      await loadAccounts();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "No se pudo guardar cuenta");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(account: Account) {
    setError(null);
    try {
      const response = await csrfFetch(`/api/bff/accounts/${account.accountId}/active`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !account.active })
      });

      if (!response.ok) {
        throw await parseApiError(response, "No se pudo actualizar estado");
      }

      setSuccess(account.active ? "Cuenta desactivada" : "Cuenta activada");
      await loadAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar estado");
    }
  }

  return (
    <AdminShell
      username={username}
      section="Administración"
      title="Cuentas"
    >
      <section className="space-y-2 md:space-y-2">
        {error ? <Alert variant="danger">{error}</Alert> : null}
        {success ? <Alert>{success}</Alert> : null}

        <section className="overflow-hidden px-4 py-3 sm:px-5">
          <AccountsToolbar
            total={accounts.length}
            filtered={filtered.length}
            search={search}
            status={status}
            type={type}
            hasActiveFilters={hasActiveFilters}
            onSearchChange={setSearch}
            onStatusChange={setStatus}
            onTypeChange={setType}
            onResetFilters={resetFilters}
            onCreate={openCreate}
          />
        </section>

        <AccountsResults rows={filtered} loading={loading} errorMessage={error} onEdit={openEdit} onToggleActive={(account) => void toggleActive(account)} />

        <AccountFormDrawer
          open={openForm}
          account={editing}
          form={form}
          errors={formErrors}
          submitError={submitError}
          submitting={submitting}
          onClose={() => setOpenForm(false)}
          onChange={onFormChange}
          onSubmit={() => void saveAccount()}
        />
      </section>
    </AdminShell>
  );
}
