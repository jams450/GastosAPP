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
    <div className="fixed inset-0 z-[70] flex items-end justify-end bg-black/70 backdrop-blur-sm sm:items-stretch" role="presentation" onClick={onClose}>
      <section
        className="relative flex h-[100dvh] w-full flex-col border-l border-blue-500/40 bg-zinc-950 shadow-[0_0_40px_rgba(37,99,235,0.15)] sm:h-full sm:max-w-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-drawer-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 border-b border-blue-500/30 bg-zinc-950/95 px-4 py-3 backdrop-blur sm:px-5 sm:py-4">
          <div className="mb-1 h-1 w-12 bg-blue-500/80 sm:hidden" />
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="user-drawer-title" className="text-lg font-semibold text-zinc-100">
                {isEdit ? "Editar usuario" : "Crear usuario"}
              </h2>
              <p className="text-xs text-zinc-400">Admin puede crear, editar, activar y desactivar usuarios.</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              className="h-8 border border-zinc-700 bg-zinc-900 px-2.5 text-[11px] font-semibold text-zinc-200 hover:bg-zinc-800"
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
            label={isEdit ? "Nueva contraseña (opcional)" : "Contraseña"}
            type="password"
            value={form.password}
            onChange={(event) => onChange("password", event.target.value)}
            error={errors.password}
          />

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="tabler-panel flex cursor-pointer items-center gap-2 border border-zinc-700 bg-zinc-900 p-3 text-sm text-zinc-200">
              <input type="checkbox" checked={form.active} onChange={(event) => onChange("active", event.target.checked)} className="h-4 w-4 border-zinc-500 bg-zinc-950 text-blue-500 focus:ring-blue-500" />
              Usuario activo
            </label>
            <label className="tabler-panel flex cursor-pointer items-center gap-2 border border-zinc-700 bg-zinc-900 p-3 text-sm text-zinc-200">
              <input type="checkbox" checked={form.admin} onChange={(event) => onChange("admin", event.target.checked)} className="h-4 w-4 border-zinc-500 bg-zinc-950 text-blue-500 focus:ring-blue-500" />
              Rol administrador
            </label>
          </div>

          {submitError ? <Alert variant="danger">{submitError}</Alert> : null}
        </div>

        <div className="border-t border-blue-500/30 bg-zinc-950/95 px-4 py-3 sm:px-5 sm:py-4">
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" className="h-10 border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="button" className="h-10 !border-[#0F3158] !bg-[#0F3158] text-white hover:!border-[#144277] hover:!bg-[#144277]" loading={submitting} loadingText="Guardando..." onClick={onSubmit}>
              {isEdit ? "Guardar cambios" : "Crear usuario"}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
