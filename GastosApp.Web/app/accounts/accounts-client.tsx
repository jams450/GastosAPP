"use client";

import { useEffect } from "react";
import { AdminShell } from "@/components/navigation/admin-shell";
import type { Account } from "@/lib/contracts/accounts";
import { toAccountRequestPayload, validateAccountPayload } from "@/lib/contracts/accounts-admin";
import { AccountsResults } from "./_components/accounts-results";
import { AccountsToolbar } from "./_components/accounts-toolbar";
import { AccountFormDrawer } from "./_components/account-form-drawer";
import { AccountsToastStack } from "./_components/accounts-toast-stack";
import { useAccountForm } from "./_hooks/use-account-form";
import { useAccountsAdmin } from "./_hooks/use-accounts-admin";
import { useAccountsFilters } from "./_hooks/use-accounts-filters";
import { useAccountsToasts } from "./_hooks/use-accounts-toasts";
import { ACCOUNTS_MODULE_META } from "./_lib/accounts-module-definition";

type Props = { username: string };

export function AccountsClient({ username }: Props) {
  const { accounts, loading, error, setError, create, update, toggleActive: toggleAccountActive } = useAccountsAdmin();
  const { toasts, dismissToast, success, error: errorToast } = useAccountsToasts();

  const { search, status, type, setSearch, setStatus, setType, filteredAccounts, hasActiveFilters, resetFilters } = useAccountsFilters(accounts);
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
    onFormChange
  } = useAccountForm();

  useEffect(() => {
    if (!error) {
      return;
    }

    errorToast(error);
    setError(null);
  }, [error, errorToast, setError]);

  async function saveAccount() {
    const validation = validateAccountPayload(form);
    setFormErrors(validation);
    if (Object.keys(validation).length > 0) {
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    const payload = toAccountRequestPayload(form);

    try {
      if (editing) {
        await update(editing.accountId, payload);
      } else {
        await create(payload);
      }

      closeForm();
      success(editing ? "Cuenta actualizada" : "Cuenta creada");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "No se pudo guardar cuenta");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(account: Account) {
    try {
      await toggleAccountActive(account);
      success(account.active ? "Cuenta desactivada" : "Cuenta activada");
    } catch (err) {
      errorToast(err instanceof Error ? err.message : "No se pudo actualizar estado");
    }
  }

  return (
    <AdminShell
      username={username}
      section={ACCOUNTS_MODULE_META.section}
      title={ACCOUNTS_MODULE_META.title}
    >
      <AccountsToastStack toasts={toasts} onDismiss={dismissToast} />

      <section className="space-y-2 md:space-y-2">
        <section className="overflow-hidden px-4 py-3 sm:px-5">
          <AccountsToolbar
            total={accounts.length}
            filtered={filteredAccounts.length}
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

        <AccountsResults rows={filteredAccounts} loading={loading} errorMessage={error} onEdit={openEdit} onToggleActive={(account) => void toggleActive(account)} />

        <AccountFormDrawer
          open={openForm}
          account={editing}
          form={form}
          errors={formErrors}
          submitError={submitError}
          submitting={submitting}
          onClose={closeForm}
          onChange={onFormChange}
          onSubmit={() => void saveAccount()}
        />
      </section>
    </AdminShell>
  );
}
