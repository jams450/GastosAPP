import { CheckCircle2, Pencil, Plus, Power } from "lucide-react";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/ui/cn";

export type CatalogActionType = "create" | "edit" | "deactivate" | "activate";

type Props = Omit<ComponentProps<typeof Button>, "variant" | "children"> & {
  action: CatalogActionType;
  label: string;
  iconOnly?: boolean;
};

const actionStyleMap: Record<
  CatalogActionType,
  {
    variant: "primary" | "secondary" | "danger";
    icon: typeof Plus;
    className?: string;
    iconClassName?: string;
  }
> = {
  create: {
    variant: "primary",
    icon: Plus
  },
  edit: {
    variant: "secondary",
    icon: Pencil
  },
  deactivate: {
    variant: "danger",
    icon: Power,
    className: "border-rose-500 bg-rose-500 hover:border-rose-600 hover:bg-rose-600"
  },
  activate: {
    variant: "secondary",
    icon: CheckCircle2,
    className:
      "border-emerald-300 bg-emerald-50 text-emerald-700 hover:border-emerald-400 hover:bg-emerald-100 dark:border-emerald-900/80 dark:bg-emerald-900/30 dark:text-emerald-300 dark:hover:bg-emerald-900/40",
    iconClassName: "text-emerald-600 dark:text-emerald-300"
  }
};

export function CatalogActionButton({ action, label, iconOnly, className, ...props }: Props) {
  const config = actionStyleMap[action];
  const Icon = config.icon;

  return (
    <Button
      variant={config.variant}
      className={cn("h-8 rounded-lg px-2.5 text-[11px] font-semibold", iconOnly && "w-8 px-0", config.className, className)}
      aria-label={props["aria-label"] ?? label}
      {...props}
    >
      <Icon className={cn("h-3.5 w-3.5", config.iconClassName)} aria-hidden="true" />
      {iconOnly ? null : <span>{label}</span>}
    </Button>
  );
}
