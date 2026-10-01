"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Uses the same drawer container and keyboard behavior as account and budget forms. */
export function InvestmentFormDrawer({ title, saving, onClose, onSubmit, children, footer }: {
  title: string;
  saving: boolean;
  onClose: () => void;
  onSubmit: () => void;
  children: ReactNode;
  footer: ReactNode;
}) {
  const titleId = useId();
  const drawerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const raf = window.requestAnimationFrame(() => drawerRef.current?.querySelector<HTMLElement>("input:not([disabled]), select:not([disabled])")?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      const drawer = drawerRef.current;
      if (!drawer) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
      }
      if (event.key !== "Tab") return;
      const elements = drawer.querySelectorAll<HTMLElement>("button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])");
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && (document.activeElement === first || !drawer.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !drawer.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKeyDown);
      triggerRef.current?.focus();
    };
  }, []);

  return (
    <div className="drawer-enter-backdrop fixed inset-0 z-[70] flex items-end justify-end bg-[var(--color-overlay)] backdrop-blur-sm sm:items-stretch" role="presentation" onClick={onClose}>
      <div ref={drawerRef} className="drawer-enter-panel app-sidebar relative flex h-[100dvh] w-full flex-col border-l sm:h-full sm:max-w-xl" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(event) => event.stopPropagation()}>
        <div className="drawer-header-semantic">
          <div className="mb-1 h-1 w-12 bg-[var(--color-accent)]/70 sm:hidden" />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="shell-page-kicker">Inversiones</p>
              <h2 id={titleId} className="text-primary mt-1 text-lg font-semibold">{title}</h2>
            </div>
            <Button type="button" variant="ghost" className="btn-close-semantic" disabled={saving} onClick={onClose}>
              <X className="h-3.5 w-3.5" aria-hidden="true" /><span>Cerrar</span>
            </Button>
          </div>
        </div>
        <form className="flex min-h-0 flex-1 flex-col" noValidate onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">{children}</div>
          <div className="drawer-footer-semantic">{footer}</div>
        </form>
      </div>
    </div>
  );
}
