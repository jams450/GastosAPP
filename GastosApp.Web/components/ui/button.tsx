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
    "border border-sky-600 bg-sky-600 text-white hover:border-sky-700 hover:bg-sky-700 disabled:border-sky-400 disabled:bg-sky-400",
  secondary:
    "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800",
  ghost:
    "border border-transparent bg-transparent text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800",
  danger:
    "border border-rose-600 bg-rose-600 text-white hover:bg-rose-700"
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
        "inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-80",
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
