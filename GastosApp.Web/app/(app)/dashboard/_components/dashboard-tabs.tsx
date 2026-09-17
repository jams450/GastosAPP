"use client";

import { useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/ui/cn";
import { DASHBOARD_TABS, type DashboardTab } from "@/app/(app)/dashboard/_lib/dashboard-tabs";

type DashboardTabsProps = {
  activeTab: DashboardTab;
  onChange: (tab: DashboardTab) => void;
};

export function DashboardTabs({ activeTab, onChange }: DashboardTabsProps) {
  const listRef = useRef<HTMLDivElement>(null);

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const currentIndex = DASHBOARD_TABS.findIndex((tab) => tab.id === activeTab);
    const lastIndex = DASHBOARD_TABS.length - 1;

    let nextIndex: number | null = null;
    switch (event.key) {
      case "ArrowRight":
        nextIndex = currentIndex >= lastIndex ? 0 : currentIndex + 1;
        break;
      case "ArrowLeft":
        nextIndex = currentIndex <= 0 ? lastIndex : currentIndex - 1;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = lastIndex;
        break;
      default:
        return;
    }

    event.preventDefault();
    const nextTab = DASHBOARD_TABS[nextIndex];
    onChange(nextTab.id);
    listRef.current?.querySelector<HTMLButtonElement>(`[data-dashboard-tab="${nextTab.id}"]`)?.focus();
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label="Secciones del dashboard"
      className="app-panel grid grid-cols-2 gap-1 p-1 sm:grid-cols-4"
    >
      {DASHBOARD_TABS.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`dashboard-tab-${tab.id}`}
            data-dashboard-tab={tab.id}
            aria-selected={isActive}
            aria-controls={`dashboard-panel-${tab.id}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={handleKeyDown}
            className={cn(
              "dashboard-touch-target grid gap-0.5 rounded-[var(--radius-sm)] px-3 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-border-focus)] sm:px-4",
              isActive
                ? "bg-[var(--color-accent-soft)] text-primary shadow-[var(--shadow-sm)]"
                : "text-muted hover:bg-[var(--color-surface-3)] hover:text-primary"
            )}
          >
            <span className="text-sm font-semibold">{tab.label}</span>
            <span className="hidden text-[11px] leading-tight text-muted sm:block">{tab.description}</span>
          </button>
        );
      })}
    </div>
  );
}
