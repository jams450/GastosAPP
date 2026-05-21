"use client";

import { useEffect, useMemo, useState } from "react";
import { AppMenu } from "@/components/navigation/app-menu";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import type { Account } from "@/lib/contracts/accounts";
import { normalizeAccounts } from "@/lib/contracts/accounts";
import { toAccountUpsertPayload, type AccountFormErrors, type AccountUpsertPayload, validateAccountPayload } from "@/lib/contracts/accounts-admin";
import { csrfFetch } from "@/lib/security/csrf-client";
import { parseApiError } from "@/lib/bff/client-session";
import { AccountsTable } from "./_components/accounts-table";
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
    <main className="relative min-h-dvh overflow-x-clip bg-slate-100 px-4 py-8 dark:bg-slate-900 md:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_0%_0%,rgba(14,165,233,0.18),transparent_30%),radial-gradient(circle_at_100%_0%,rgba(59,130,246,0.14),transparent_32%)] dark:bg-[radial-gradient(circle_at_0%_0%,rgba(14,165,233,0.14),transparent_30%),radial-gradient(circle_at_100%_0%,rgba(37,99,235,0.2),transparent_34%)]" />

      <section className="relative mx-auto w-full max-w-7xl space-y-4">
        <Card className="border-slate-300/70 bg-white/90 p-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-700 dark:text-sky-400">Cuentas</p>
              <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 md:text-2xl">Gestión de cuentas</h1>
              <p className="text-xs text-slate-600 dark:text-slate-400">Hola {username}. Modifica todas propiedades desde página dedicada modular.</p>
            </div>

            <AppMenu username={username} compact />
          </div>
        </Card>

        {error ? <Alert variant="danger">{error}</Alert> : null}
        {success ? <Alert>{success}</Alert> : null}

        <AccountsToolbar
          search={search}
          status={status}
          type={type}
          onSearchChange={setSearch}
          onStatusChange={setStatus}
          onTypeChange={setType}
          onCreate={openCreate}
        />

        <Card className="p-3">
          <AccountsTable rows={filtered} loading={loading} onEdit={openEdit} onToggleActive={(account) => void toggleActive(account)} />
        </Card>

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
    </main>
  );
}
