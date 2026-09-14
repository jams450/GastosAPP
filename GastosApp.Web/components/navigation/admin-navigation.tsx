import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/ui/cn";
import { appNavItems, isRouteActive } from "./nav-config";

type AdminNavigationProps = {
  readonly pathname: string;
  readonly mobile?: boolean;
  readonly onNavigate?: () => void;
};

export function AdminNavigation({ pathname, mobile = false, onNavigate }: AdminNavigationProps) {
  return <nav className={cn("space-y-1.5", mobile && "grid gap-1 sm:grid-cols-2")} aria-label={mobile ? "Navegación móvil administrativa" : "Navegación administrativa"}>
    {appNavItems.map((item) => {
      const Icon = item.icon;
      return <div key={item.href} className="space-y-1">
        <Link href={item.href} onClick={onNavigate} className={cn("shell-nav-link flex items-center rounded-[var(--radius-sm)] border px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-border-focus)]", isRouteActive(pathname, item.href) ? "border-accent text-primary" : "border-transparent text-secondary hover:border-accent hover:text-primary")} data-active={isRouteActive(pathname, item.href)}><Icon className="mr-2.5 h-4 w-4 shrink-0" aria-hidden="true" />{item.label}{item.children ? <ChevronDown className="ml-auto h-4 w-4 opacity-60" aria-hidden="true" /> : null}</Link>
        {item.children ? <div className="space-y-1 pl-5">{item.children.map((child) => <Link key={child.href} href={child.href} onClick={onNavigate} className={cn("shell-subnav-link block rounded-md px-3 py-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-border-focus)]", isRouteActive(pathname, child.href) ? "text-primary" : "text-muted")} data-active={isRouteActive(pathname, child.href)}>{child.label}</Link>)}</div> : null}
      </div>;
    })}
  </nav>;
}
