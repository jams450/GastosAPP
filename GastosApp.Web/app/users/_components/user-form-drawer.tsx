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
    <div className="fixed inset-0 z-[70] flex items-end justify-end bg-slate-900/50 backdrop-blur-sm sm:items-stretch">
      <section className="flex h-[100dvh] w-full flex-col rounded-t-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 sm:h-full sm:max-w-xl sm:rounded-none sm:border-y-0 sm:border-r-0 sm:border-l">
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 sm:px-5 sm:py-4">
          <div className="mb-1 h-1 w-12 rounded-full bg-slate-300/80 dark:bg-slate-700 sm:hidden" />
          <div className="flex items-start justify-between gap-3">
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
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
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

        <div className="sticky bottom-0 z-10 mt-auto border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 sm:px-5 sm:py-4">
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" className="h-10" onClick={onClose}>Cancelar</Button>
            <Button type="button" className="h-10" loading={submitting} loadingText="Guardando..." onClick={onSubmit}>
            {isEdit ? "Guardar cambios" : "Crear usuario"}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
