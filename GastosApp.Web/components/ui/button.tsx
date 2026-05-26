import { ComponentProps } from "react";
import { cn } from "@/lib/ui/cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

type ButtonProps = ComponentProps<"button"> & {
  variant?: ButtonVariant;
  fullWidth?: boolean;
  loading?: boolean;
  loadingText?: string;
};

const variantClass: Record<ButtonVariant, string> = {
  primary:
    "border border-[var(--tabler-primary)] bg-[var(--tabler-primary)] text-white shadow-sm hover:border-[var(--tabler-primary-hover)] hover:bg-[var(--tabler-primary-hover)] disabled:border-slate-400 disabled:bg-slate-400",
  secondary:
    "border bg-[var(--tabler-surface-1)] text-[var(--tabler-text)] hover:bg-[var(--tabler-surface-2)]",
  ghost:
    "border border-transparent bg-transparent text-[var(--tabler-text)] hover:bg-[var(--tabler-surface-2)]",
  danger:
    "border border-[var(--tabler-danger)] bg-[var(--tabler-danger)] text-white hover:brightness-95"
};

export function Button({
  className,
  variant = "primary",
  fullWidth,
  loading,
  loadingText,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:cursor-not-allowed disabled:opacity-80 dark:focus-visible:ring-zinc-700",
        "rounded-[var(--tabler-radius-sm)]",
        fullWidth && "w-full",
        variantClass[variant],
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <>
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="9" className="fill-none stroke-current/30" strokeWidth="3" />
            <path d="M21 12a9 9 0 0 0-9-9" className="fill-none stroke-current" strokeWidth="3" strokeLinecap="round" />
          </svg>
          {loadingText ?? "Cargando..."}
        </>
      ) : (
        children
      )}
    </button>
  );
}
