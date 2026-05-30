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
    icon: Plus,
    className: "border-[#0F3158] bg-[#0F3158] text-white hover:border-[#144277] hover:bg-[#144277]"
  },
  edit: {
    variant: "ghost",
    icon: Pencil,
    className: "border-blue-400/45 bg-blue-500/12 text-blue-200 hover:border-blue-300/60 hover:bg-blue-500/22"
  },
  deactivate: {
    variant: "ghost",
    icon: Power,
    className: "border-amber-400/45 bg-amber-500/12 text-amber-200 hover:border-amber-300/60 hover:bg-amber-500/22"
  },
  activate: {
    variant: "ghost",
    icon: CheckCircle2,
    className: "border-emerald-400/45 bg-emerald-500/12 text-emerald-200 hover:border-emerald-300/60 hover:bg-emerald-500/22",
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
