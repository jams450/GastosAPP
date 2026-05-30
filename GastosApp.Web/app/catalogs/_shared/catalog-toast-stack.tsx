import { CheckCircle2, CircleAlert, X } from "lucide-react";

export type CatalogToast = {
  id: string;
  message: string;
  variant: "success" | "error";
};

type Props = {
  toasts: CatalogToast[];
  onDismiss: (id: string) => void;
};

export function CatalogToastStack({ toasts, onDismiss }: Props) {
  return (
    <div className="pointer-events-none fixed right-3 top-3 z-[120] flex w-[min(92vw,360px)] flex-col gap-2 md:right-6 md:top-5" aria-live="polite">
      {toasts.map((toast) => {
        const isSuccess = toast.variant === "success";
        return (
          <div
            key={toast.id}
            role="status"
            className={isSuccess
              ? "tabler-panel pointer-events-auto flex items-start gap-2.5 border-emerald-200 bg-white/95 px-3 py-2.5 text-emerald-800 shadow-lg shadow-emerald-200/40 dark:border-emerald-900 dark:bg-slate-950/95 dark:text-emerald-300"
              : "tabler-panel pointer-events-auto flex items-start gap-2.5 border-rose-200 bg-white/95 px-3 py-2.5 text-rose-800 shadow-lg shadow-rose-200/30 dark:border-rose-900 dark:bg-slate-950/95 dark:text-rose-300"}
          >
            {isSuccess ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />}
            <p className="min-w-0 flex-1 text-sm font-medium">{toast.message}</p>
            <button
              type="button"
              className="rounded-md p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              onClick={() => onDismiss(toast.id)}
              aria-label="Cerrar notificación"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
