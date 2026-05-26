import { ComponentProps } from "react";
import { cn } from "@/lib/ui/cn";

type AlertVariant = "danger" | "info";

type AlertProps = ComponentProps<"div"> & {
  variant?: AlertVariant;
};

const variants: Record<AlertVariant, string> = {
  danger: "border-[var(--tabler-danger)]/35 bg-[var(--tabler-danger)]/10 text-[var(--tabler-danger)]",
  info: "border-[var(--tabler-primary)]/35 bg-[var(--tabler-primary)]/10 text-[var(--tabler-primary)]"
};

export function Alert({ className, variant = "info", ...props }: AlertProps) {
  return <div className={cn("rounded-[var(--tabler-radius-md)] border px-3 py-2 text-sm", variants[variant], className)} role="alert" {...props} />;
}
