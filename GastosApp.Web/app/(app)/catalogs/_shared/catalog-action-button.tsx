import { CheckCircle2, Pencil, Plus, Power } from "lucide-react";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/ui/cn";
import { tableActionStyles } from "@/lib/ui/table-action-styles";

export type CatalogActionType = "create" | "edit" | "deactivate" | "activate";

type Props = Omit<ComponentProps<typeof Button>, "variant" | "children"> & {
  action: CatalogActionType;
  label: string;
  iconOnly?: boolean;
};

const actionStyleMap: Record<
  CatalogActionType,
  {
    variant: "primary" | "secondary" | "ghost" | "danger";
    icon: typeof Plus;
    className?: string;
    iconClassName?: string;
  }
> = {
  create: {
    variant: "ghost",
    icon: Plus,
    className: tableActionStyles.create
  },
  edit: {
    variant: "ghost",
    icon: Pencil,
    className: tableActionStyles.edit
  },
  deactivate: {
    variant: "ghost",
    icon: Power,
    className: tableActionStyles.deactivate
  },
  activate: {
    variant: "ghost",
    icon: CheckCircle2,
    className: tableActionStyles.activate,
    iconClassName: "text-emerald-300"
  }
};

export function CatalogActionButton({ action, label, iconOnly, className, ...props }: Props) {
  const config = actionStyleMap[action];
  const Icon = config.icon;
  const baseByAction = action === "create"
    ? "h-8 rounded-md px-3 text-xs font-bold"
    : "h-8 rounded-md px-2.5 text-[11px] font-semibold";

  return (
    <Button
      variant={config.variant}
      className={cn(baseByAction, iconOnly && "w-8 px-0", config.className, className)}
      aria-label={props["aria-label"] ?? label}
      {...props}
    >
      <Icon className={cn("h-3.5 w-3.5", config.iconClassName)} aria-hidden="true" />
      {iconOnly ? null : <span>{label}</span>}
    </Button>
  );
}
