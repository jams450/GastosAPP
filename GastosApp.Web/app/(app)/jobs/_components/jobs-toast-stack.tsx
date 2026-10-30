import { CheckCircle2, CircleAlert, Info, X } from "lucide-react";
import type { JobsToast } from "../_hooks/use-jobs-toasts";

type Props = {
  toasts: JobsToast[];
  onDismiss: (id: string) => void;
};

const VARIANT_CLASS: Record<JobsToast["variant"], string> = {
  success: "border-[var(--color-success)]/35 text-[var(--color-success)]",
  error: "border-[var(--color-danger)]/35 text-[var(--color-danger)]",
  info: "border-[var(--color-accent)]/35 text-[var(--color-accent)]"
};

const VARIANT_ICON: Record<JobsToast["variant"], typeof Info> = {
  success: CheckCircle2,
  error: CircleAlert,
  info: Info
};

/** Avisos con `aria-live="polite"`: el resultado de una corrida se anuncia sin robar el foco. */
export function JobsToastStack({ toasts, onDismiss }: Props) {
  return (
    <div className="pointer-events-none fixed right-3 top-3 z-[120] flex w-[min(92vw,380px)] flex-col gap-2 md:right-6 md:top-5" aria-live="polite">
      {toasts.map((toast) => {
        const Icon = VARIANT_ICON[toast.variant];
        return (
          <div
            key={toast.id}
            role="status"
            className={`tabler-panel pointer-events-auto flex items-start gap-2.5 border bg-[var(--color-surface-1)]/95 px-3 py-2.5 ${VARIANT_CLASS[toast.variant]}`}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p className="min-w-0 flex-1 text-sm font-medium">{toast.message}</p>
            <button
              type="button"
              className="text-muted hover:bg-[var(--color-accent-soft)] hover:text-primary rounded-md p-1 transition"
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
