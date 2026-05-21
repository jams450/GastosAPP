"use client";

import { useEffect, useState } from "react";
import { AppMenu } from "@/components/navigation/app-menu";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { type AdminUser, type UserCreatePayload, type UserUpdatePayload, validateUserForm } from "@/lib/contracts/users-admin";
import { useUserForm } from "./_hooks/use-user-form";
import { useUsersAdmin } from "./_hooks/use-users-admin";
import { useUsersFilters } from "./_hooks/use-users-filters";
import { UserFormDrawer } from "./_components/user-form-drawer";
import { UsersResults } from "./_components/users-results";
import { UsersToolbar } from "./_components/users-toolbar";

type Props = { username: string };

export function UsersClient({ username }: Props) {
  const { users, loading, error, setError, create, update, toggleActive: toggleUserActive, remove } = useUsersAdmin();
  const { search, status, role, setSearch, setStatus, setRole, filteredUsers } = useUsersFilters(users);
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
  } = useUserForm();

  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!success) return;
    const timeout = window.setTimeout(() => setSuccess(null), 2600);
    return () => window.clearTimeout(timeout);
  }, [success]);

  async function saveUser() {
    const validation = validateUserForm(form, Boolean(editing));
    setFormErrors(validation);
    if (Object.keys(validation).length > 0) return;

    setSubmitting(true);
    setSubmitError(null);

    const payload: UserCreatePayload | UserUpdatePayload = {
      name: form.name.trim(),
      email: form.email.trim().toLowerCase(),
      ...(form.password.trim() ? { password: form.password.trim() } : {}),
      active: form.active,
      admin: form.admin
    };

    try {
      if (editing) {
        await update(editing.userId, payload);
      } else {
        await create(payload as UserCreatePayload);
      }

      closeForm();
      setSuccess(editing ? "Usuario actualizado" : "Usuario creado");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "No se pudo guardar usuario");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(user: AdminUser) {
    try {
      await toggleUserActive(user);
      setSuccess(user.active ? "Usuario desactivado" : "Usuario activado");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar estado");
    }
  }

  async function deleteUser(user: AdminUser) {
    if (!window.confirm(`¿Seguro de borrar usuario ${user.email}?`)) return;

    try {
      await remove(user.userId);
      setSuccess("Usuario borrado");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo borrar usuario");
    }
  }

  return (
    <main className="relative min-h-dvh overflow-x-clip bg-slate-100 px-4 py-8 dark:bg-slate-900 md:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_0%_0%,rgba(14,165,233,0.18),transparent_30%),radial-gradient(circle_at_100%_0%,rgba(59,130,246,0.14),transparent_32%)] dark:bg-[radial-gradient(circle_at_0%_0%,rgba(14,165,233,0.14),transparent_30%),radial-gradient(circle_at_100%_0%,rgba(37,99,235,0.2),transparent_34%)]" />

      <section className="relative mx-auto w-full max-w-7xl space-y-4 md:space-y-5">
        <Card className="relative z-30 border-slate-300/70 bg-white/90 p-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-700 dark:text-sky-400">Admin</p>
              <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 md:text-2xl">Gestión de usuarios</h1>
              <p className="text-xs text-slate-600 dark:text-slate-400">Hola {username}. Crea, edita y administra accesos del sistema.</p>
            </div>

            <AppMenu username={username} compact />
          </div>
        </Card>

        {error ? <Alert variant="danger">{error}</Alert> : null}
        {success ? <Alert>{success}</Alert> : null}

        <div className="relative z-10">
          <UsersToolbar
            search={search}
            status={status}
            role={role}
            onSearchChange={setSearch}
            onStatusChange={setStatus}
            onRoleChange={setRole}
            onCreate={openCreate}
          />
        </div>

        <Card className="overflow-hidden border-slate-200/90 bg-white/95 p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/95">
          <UsersResults
            rows={filteredUsers}
            loading={loading}
            onEdit={openEdit}
            onToggleActive={(user) => void toggleActive(user)}
            onDelete={(user) => void deleteUser(user)}
          />
        </Card>

        <UserFormDrawer
          open={openForm}
          user={editing}
          form={form}
          errors={formErrors}
          submitError={submitError}
          submitting={submitting}
          onClose={closeForm}
          onChange={onFormChange}
          onSubmit={() => void saveUser()}
        />
      </section>
    </main>
  );
}
