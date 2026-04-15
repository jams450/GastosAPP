import { ComponentProps } from "react";
import { cn } from "@/lib/ui/cn";

type AlertVariant = "danger" | "info";

type AlertProps = ComponentProps<"div"> & {
  variant?: AlertVariant;
};

const variants: Record<AlertVariant, string> = {
  danger: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300",
  info: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-300"
};

export function Alert({ className, variant = "info", ...props }: AlertProps) {
  return <div className={cn("rounded-xl border px-3 py-2 text-sm", variants[variant], className)} role="alert" {...props} />;
}
