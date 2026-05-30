import { ComponentProps } from "react";
import { cn } from "@/lib/ui/cn";

type AlertVariant = "danger" | "info";

type AlertProps = ComponentProps<"div"> & {
  variant?: AlertVariant;
};

const variants: Record<AlertVariant, string> = {
  danger: "border-[var(--color-danger)]/35 bg-[var(--color-danger)]/10 text-[var(--color-danger)]",
  info: "border-[var(--color-accent)]/35 bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
};

export function Alert({ className, variant = "info", ...props }: AlertProps) {
  return <div className={cn("rounded-[var(--tabler-radius-md)] border px-3 py-2 text-sm", variants[variant], className)} role="alert" {...props} />;
}
