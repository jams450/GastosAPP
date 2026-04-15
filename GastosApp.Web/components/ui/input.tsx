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
    <label htmlFor={inputId} className="grid gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
      {label}
      <div className="relative">
        <input
          id={inputId}
          className={cn(
            "h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-sky-500/80 dark:focus:ring-sky-900",
            rightSlot && "pr-24",
            error && "border-rose-400 focus:border-rose-500 focus:ring-rose-200 dark:border-rose-600 dark:focus:ring-rose-900",
            className
          )}
          aria-invalid={Boolean(error)}
          {...props}
        />

        {rightSlot ? <div className="absolute right-2 top-1/2 -translate-y-1/2">{rightSlot}</div> : null}
      </div>

      {error ? <span className="text-xs text-rose-600 dark:text-rose-400">{error}</span> : null}
    </label>
  );
}
