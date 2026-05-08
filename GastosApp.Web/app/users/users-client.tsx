"use client";

import { useEffect, useMemo, useState } from "react";
import { AppMenu } from "@/components/navigation/app-menu";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { type AdminUser, type UserFormErrors, type UserFormState, normalizeUsers, toUserFormState, validateUserForm } from "@/lib/contracts/users-admin";
import { UserFormDrawer } from "./_components/user-form-drawer";
import { UsersTable } from "./_components/users-table";
import { UsersToolbar } from "./_components/users-toolbar";

type Props = { username: string };

export function UsersClient({ username }: Props) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [role, setRole] = useState<"all" | "admin" | "user">("all");

  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [form, setForm] = useState<UserFormState>(toUserFormState());
  const [formErrors, setFormErrors] = useState<UserFormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function loadUsers() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/bff/users", { cache: "no-store" });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "No se pudieron cargar usuarios");
      }

      const payload = await response.json();
      setUsers(normalizeUsers(payload));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar usuarios");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  useEffect(() => {
    if (!success) return;
    const timeout = window.setTimeout(() => setSuccess(null), 2600);
    return () => window.clearTimeout(timeout);
  }, [success]);

  const filtered = useMemo(() => {
    return users.filter((user) => {
      const query = search.trim().toLowerCase();
      if (query && !user.name.toLowerCase().includes(query) && !user.email.toLowerCase().includes(query)) return false;
      if (status === "active" && !user.active) return false;
      if (status === "inactive" && user.active) return false;
      if (role === "admin" && !user.admin) return false;
      if (role === "user" && user.admin) return false;
      return true;
    });
  }, [role, search, status, users]);

  function openCreate() {
    setEditing(null);
    setForm(toUserFormState());
    setFormErrors({});
    setSubmitError(null);
    setOpenForm(true);
  }

  function openEdit(user: AdminUser) {
    setEditing(user);
    setForm(toUserFormState(user));
    setFormErrors({});
    setSubmitError(null);
    setOpenForm(true);
  }

  function onFormChange<K extends keyof UserFormState>(key: K, value: UserFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function saveUser() {
    const validation = validateUserForm(form, Boolean(editing));
    setFormErrors(validation);
    if (Object.keys(validation).length > 0) return;

    setSubmitting(true);
    setSubmitError(null);

    const payload = {
      name: form.name.trim(),
      email: form.email.trim().toLowerCase(),
      ...(form.password.trim() ? { password: form.password.trim() } : {}),
      active: form.active,
      admin: form.admin
    };

    try {
      const url = editing ? `/api/bff/users/${editing.userId}` : "/api/bff/users";
      const method = editing ? "PUT" : "POST";
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string; Message?: string } | null;
        throw new Error(body?.message ?? body?.Message ?? "No se pudo guardar usuario");
      }

      setOpenForm(false);
      setSuccess(editing ? "Usuario actualizado" : "Usuario creado");
      await loadUsers();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "No se pudo guardar usuario");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(user: AdminUser) {
    setError(null);
    try {
      const response = await fetch(`/api/bff/users/${user.userId}/active`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !user.active })
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string; Message?: string } | null;
        throw new Error(body?.message ?? body?.Message ?? "No se pudo actualizar estado");
      }

      setSuccess(user.active ? "Usuario desactivado" : "Usuario activado");
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar estado");
    }
  }

  async function deleteUser(user: AdminUser) {
    if (!window.confirm(`¿Seguro de borrar usuario ${user.email}?`)) return;

    setError(null);
    try {
      const response = await fetch(`/api/bff/users/${user.userId}`, { method: "DELETE" });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string; Message?: string } | null;
        throw new Error(body?.message ?? body?.Message ?? "No se pudo borrar usuario");
      }

      setSuccess("Usuario borrado");
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo borrar usuario");
    }
  }

  return (
    <main className="relative min-h-dvh overflow-x-clip bg-slate-100 px-4 py-8 dark:bg-slate-900 md:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_0%_0%,rgba(14,165,233,0.18),transparent_30%),radial-gradient(circle_at_100%_0%,rgba(59,130,246,0.14),transparent_32%)] dark:bg-[radial-gradient(circle_at_0%_0%,rgba(14,165,233,0.14),transparent_30%),radial-gradient(circle_at_100%_0%,rgba(37,99,235,0.2),transparent_34%)]" />

      <section className="relative mx-auto w-full max-w-7xl space-y-4">
        <Card className="border-slate-300/70 bg-white/90 p-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
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

        <UsersToolbar
          search={search}
          status={status}
          role={role}
          onSearchChange={setSearch}
          onStatusChange={setStatus}
          onRoleChange={setRole}
          onCreate={openCreate}
        />

        <Card className="p-3">
          <UsersTable
            rows={filtered}
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
          onClose={() => setOpenForm(false)}
          onChange={onFormChange}
          onSubmit={() => void saveUser()}
        />
      </section>
    </main>
  );
}
