"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/navigation/admin-shell";
import { type AdminUser, type UserCreatePayload, type UserUpdatePayload, validateUserForm } from "@/lib/contracts/users-admin";
import { UserDeleteConfirmDialog } from "./_components/user-delete-confirm-dialog";
import { useUserForm } from "./_hooks/use-user-form";
import { useUsersAdmin } from "./_hooks/use-users-admin";
import { useUsersFilters } from "./_hooks/use-users-filters";
import { UsersToastStack } from "./_components/users-toast-stack";
import { UserFormDrawer } from "./_components/user-form-drawer";
import { UsersResults } from "./_components/users-results";
import { UsersToolbar } from "./_components/users-toolbar";
import { useUsersToasts } from "./_hooks/use-users-toasts";
import { ChevronRight } from "lucide-react";

type Props = { username: string };

export function UsersClient({ username }: Props) {
  const { users, loading, error, setError, create, update, toggleActive: toggleUserActive, remove } = useUsersAdmin();
  const { search, status, role, setSearch, setStatus, setRole, filteredUsers, hasActiveFilters, resetFilters } = useUsersFilters(users);
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

  const { toasts, dismissToast, success, error: errorToast } = useUsersToasts();
  const [pendingDeleteUser, setPendingDeleteUser] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!error) {
      return;
    }

    errorToast(error);
    setError(null);
  }, [error, errorToast, setError]);

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
      success(editing ? "Usuario actualizado" : "Usuario creado");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "No se pudo guardar usuario");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(user: AdminUser) {
    try {
      await toggleUserActive(user);
      success(user.active ? "Usuario desactivado" : "Usuario activado");
    } catch (err) {
      errorToast(err instanceof Error ? err.message : "No se pudo actualizar estado");
    }
  }

  function askDeleteUser(user: AdminUser) {
    setPendingDeleteUser(user);
  }

  async function confirmDeleteUser() {
    if (!pendingDeleteUser) {
      return;
    }

    setDeleting(true);
    try {
      await remove(pendingDeleteUser.userId);
      success("Usuario borrado");
      setPendingDeleteUser(null);
    } catch (err) {
      errorToast(err instanceof Error ? err.message : "No se pudo borrar usuario");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AdminShell
      username={username}
      section="Admin"
      title="Gestión de usuarios"
      subtitle="Crea, edita y administra accesos del sistema."
      meta={
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="tabler-badge tabler-badge-muted tabler-badge-solid">{filteredUsers.length} visibles</span>
          <span className="tabler-badge tabler-badge-muted">{users.length} totales</span>
        </div>
      }
    >
      <UsersToastStack toasts={toasts} onDismiss={dismissToast} />

      <section className="space-y-4 md:space-y-5">
        <section className="tabler-card overflow-hidden border-zinc-700/90 bg-zinc-950 p-0">
          <div className="border-b border-zinc-800 bg-gradient-to-r from-zinc-950 to-zinc-900 px-4 py-4 sm:px-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <nav aria-label="Breadcrumb" className="mb-2 flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500">
                  <span>Dashboard</span>
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Administración</span>
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="text-zinc-200">Usuarios</span>
                </nav>
                <h1 className="pt-3 text-2xl font-extrabold tracking-tight text-zinc-100">Panel de usuarios</h1>
                <p className="mt-1 text-sm font-medium text-zinc-400">Control total de altas, edición, activación y baja administrativa.</p>
              </div>
              <span className="inline-flex items-center gap-1.5 border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs font-semibold text-zinc-300">
                Módulo activo
              </span>
            </div>

            <div className="mt-4 border-t border-zinc-800 pt-4">
              <UsersToolbar
                total={users.length}
                filtered={filteredUsers.length}
                search={search}
                status={status}
                role={role}
                hasActiveFilters={hasActiveFilters}
                onSearchChange={setSearch}
                onStatusChange={setStatus}
                onRoleChange={setRole}
                onResetFilters={resetFilters}
                onCreate={openCreate}
              />
            </div>
          </div>
        </section>

        <UsersResults rows={filteredUsers} loading={loading} errorMessage={error} onEdit={openEdit} onToggleActive={(user) => void toggleActive(user)} onDelete={askDeleteUser} />

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

        <UserDeleteConfirmDialog
          user={pendingDeleteUser}
          open={Boolean(pendingDeleteUser)}
          loading={deleting}
          onCancel={() => setPendingDeleteUser(null)}
          onConfirm={() => void confirmDeleteUser()}
        />
      </section>
    </AdminShell>
  );
}
