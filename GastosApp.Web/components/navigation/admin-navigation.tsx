"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/ui/cn";
import { appNavItems, isRouteActive } from "./nav-config";

type AdminNavigationProps = {
  readonly pathname: string;
  readonly compact?: boolean;
  readonly mobile?: boolean;
  readonly onNavigate?: () => void;
};

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-border-focus)]";

/* Desktop sidebar and mobile drawer can be mounted at the same time, so every
   generated id carries a scope prefix to keep `aria-controls`/`aria-labelledby`
   pointing at a single element. */
function groupContentId(scope: string, href: string): string {
  return `${scope}-group-${href.replaceAll("/", "-").replaceAll("_", "-")}`;
}

export function AdminNavigation({ pathname, compact = false, mobile = false, onNavigate }: AdminNavigationProps) {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const isCompact = compact && !mobile;
  const scope = mobile ? "mobile-navigation" : "desktop-navigation";
  const labelId = `${scope}-nav-label`;
  const activeGroupHref = appNavItems.find((item) => item.children?.some((child) => isRouteActive(pathname, child.href)))?.href;

  // Route change drops manual open/close overrides, so the group holding the
  // active route returns to its default-open state.
  useEffect(() => {
    setOpenGroups({});
  }, [pathname]);

  return (
    <nav className="shell-nav" aria-label={mobile ? "Navegación móvil de Amitzi Finance" : "Navegación de Amitzi Finance"}>
      <p id={labelId} className="shell-nav-section-label p-3">
        Tu espacio
      </p>
      <ul className="shell-nav-list" aria-labelledby={labelId}>
        {appNavItems.map((item) => {
          const Icon = item.icon;
          const contentId = groupContentId(scope, item.href);

          if (item.children === undefined) {
            const itemActive = pathname === item.href;
            return (
              <li key={item.href} className="shell-nav-item">
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={itemActive ? "page" : undefined}
                  aria-label={isCompact ? item.label : undefined}
                  title={isCompact ? item.label : undefined}
                  className={cn("shell-nav-link", focusRing, isCompact ? "justify-center" : null, itemActive ? "border-accent text-primary" : "border-transparent text-secondary hover:border-accent hover:text-primary")}
                  data-active={itemActive}
                >
                  <Icon className="shell-nav-icon" aria-hidden="true" />
                  {isCompact ? null : <span className="shell-nav-label">{item.label}</span>}
                </Link>
              </li>
            );
          }

          const hasActiveChild = item.children.some((child) => isRouteActive(pathname, child.href));
          const isOpen = openGroups[item.href] ?? (mobile || (!isCompact && item.href === activeGroupHref));

          return (
            <li key={item.href} className="shell-nav-item">
              <button
                type="button"
                className={cn("shell-nav-group-toggle", focusRing, isCompact ? "justify-center" : null, hasActiveChild ? "border-accent text-primary" : "border-transparent text-secondary hover:border-accent hover:text-primary")}
                aria-expanded={isOpen}
                aria-controls={contentId}
                aria-label={isCompact ? item.label : undefined}
                title={isCompact ? item.label : undefined}
                data-active={hasActiveChild}
                onClick={() => setOpenGroups((groups) => ({ ...groups, [item.href]: !isOpen }))}
              >
                <Icon className="shell-nav-icon" aria-hidden="true" />
                {isCompact ? null : <span className="shell-nav-label">{item.label}</span>}
                <ChevronDown className="shell-nav-chevron" data-open={isOpen} aria-hidden="true" />
              </button>
              <ul id={contentId} className="shell-nav-children" hidden={!isOpen}>
                {item.children.map((child) => {
                  const childActive = isRouteActive(pathname, child.href);
                  return (
                    <li key={child.href}>
                      <Link
                        href={child.href}
                        onClick={onNavigate}
                        aria-current={childActive ? "page" : undefined}
                        className={cn("shell-subnav-link", focusRing, childActive ? "text-primary" : "text-muted")}
                        data-active={childActive}
                      >
                        {child.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
