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
  primary: "btn-primary-semantic disabled:border-[var(--color-border-strong)] disabled:bg-[var(--color-border-strong)]",
  secondary: "btn-secondary-semantic",
  ghost: "btn-ghost-semantic",
  danger: "btn-danger-semantic hover:brightness-95"
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
        "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-border-focus)] disabled:cursor-not-allowed disabled:opacity-80",
        "rounded-[var(--radius-sm)]",
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
