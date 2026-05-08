import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import type { AdminUser, UserFormErrors, UserFormState } from "@/lib/contracts/users-admin";
import { X } from "lucide-react";

type Props = {
  open: boolean;
  user: AdminUser | null;
  form: UserFormState;
  errors: UserFormErrors;
  submitError: string | null;
  submitting: boolean;
  onClose: () => void;
  onChange: <K extends keyof UserFormState>(key: K, value: UserFormState[K]) => void;
  onSubmit: () => void;
};

export function UserFormDrawer({
  open,
  user,
  form,
  errors,
  submitError,
  submitting,
  onClose,
  onChange,
  onSubmit
}: Props) {
  if (!open) return null;

  const isEdit = Boolean(user);

  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-slate-900/50 backdrop-blur-sm">
      <section className="flex h-full w-full max-w-xl flex-col border-l border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{isEdit ? "Editar usuario" : "Crear usuario"}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Admin puede crear, editar, activar y desactivar usuarios.</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            className="h-8 rounded-lg border border-slate-300 bg-slate-100 px-2.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            onClick={onClose}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Cerrar</span>
          </Button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto pr-1">
          <Input label="Nombre" value={form.name} onChange={(event) => onChange("name", event.target.value)} error={errors.name} />
          <Input label="Correo" type="email" value={form.email} onChange={(event) => onChange("email", event.target.value)} error={errors.email} />
          <Input
            label={isEdit ? "Password (opcional)" : "Password"}
            type="password"
            value={form.password}
            onChange={(event) => onChange("password", event.target.value)}
            error={errors.password}
          />

          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input type="checkbox" checked={form.admin} onChange={(event) => onChange("admin", event.target.checked)} className="h-4 w-4" />
            Usuario administrador
          </label>

          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input type="checkbox" checked={form.active} onChange={(event) => onChange("active", event.target.checked)} className="h-4 w-4" />
            Usuario activo
          </label>

          {submitError ? <Alert variant="danger">{submitError}</Alert> : null}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="secondary" className="h-10" onClick={onClose}>Cancelar</Button>
          <Button type="button" className="h-10" loading={submitting} loadingText="Guardando..." onClick={onSubmit}>
            {isEdit ? "Guardar cambios" : "Crear usuario"}
          </Button>
        </div>
      </section>
    </div>
  );
}
