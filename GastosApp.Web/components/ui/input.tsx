import { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/ui/cn";

type InputProps = ComponentProps<"input"> & {
  label: string;
  error?: string;
  rightSlot?: ReactNode;
};

export function Input({ label, className, error, rightSlot, id, ...props }: InputProps) {
  const inputId = id ?? props.name ?? label.toLowerCase().replace(/\s+/g, "-");

    return (
    <label htmlFor={inputId} className="grid gap-1.5 text-sm font-medium text-[var(--tabler-text)]">
      {label}
      <div className="relative">
        <input
          id={inputId}
          className={cn(
            "h-10 w-full rounded-[var(--tabler-radius-sm)] border bg-[var(--tabler-surface-1)] px-3 text-sm text-[var(--tabler-text)] outline-none transition placeholder:text-[var(--tabler-text-soft)] focus:border-[var(--tabler-primary)] focus:ring-2 focus:ring-sky-200 dark:focus:ring-sky-900",
            rightSlot && "pr-24",
            error && "border-rose-400 focus:border-rose-500 focus:ring-rose-200 dark:border-rose-600 dark:focus:ring-rose-900",
            className
          )}
          aria-invalid={Boolean(error)}
          {...props}
        />

        {rightSlot ? <div className="absolute right-2 top-1/2 -translate-y-1/2">{rightSlot}</div> : null}
      </div>

      {error ? <span className="text-xs text-[var(--tabler-danger)]">{error}</span> : null}
    </label>
  );
}
