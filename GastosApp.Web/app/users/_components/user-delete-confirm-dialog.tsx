import { Button } from "@/components/ui/button";
import type { AdminUser } from "@/lib/contracts/users-admin";

type Props = {
  user: AdminUser | null;
  open: boolean;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function UserDeleteConfirmDialog({ user, open, loading, onCancel, onConfirm }: Props) {
  if (!open || !user) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-800 dark:bg-slate-950">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">¿Borrar usuario?</p>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Esta acción desactiva el usuario <span className="font-semibold">{user.email}</span> y no se puede revertir desde esta vista.
        </p>

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="secondary" className="h-9" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="button" variant="danger" className="h-9" loading={loading} loadingText="Borrando..." onClick={onConfirm}>
            Borrar usuario
          </Button>
        </div>
      </section>
    </div>
  );
}
