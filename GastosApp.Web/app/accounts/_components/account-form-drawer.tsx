"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { Account } from "@/lib/contracts/accounts";
import type { AccountFormErrors, AccountUpsertPayload } from "@/lib/contracts/accounts-admin";
import { BalanceFields } from "./account-form-fields/balance-fields";
import { BaseFields } from "./account-form-fields/base-fields";
import { CreditFields } from "./account-form-fields/credit-fields";

type Props = {
  open: boolean;
  account: Account | null;
  form: AccountUpsertPayload;
  errors: AccountFormErrors;
  submitError: string | null;
  submitting: boolean;
  onClose: () => void;
  onChange: <K extends keyof AccountUpsertPayload>(key: K, value: AccountUpsertPayload[K]) => void;
  onSubmit: () => void;
};

export function AccountFormDrawer({ open, account, form, errors, submitError, submitting, onClose, onChange, onSubmit }: Props) {
  const titleId = useId();
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) {
      triggerRef.current?.focus();
      return;
    }

    triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const onKeyDown = (event: KeyboardEvent) => {
      const drawer = drawerRef.current;
      if (!drawer) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusableElements = drawer.querySelectorAll<HTMLElement>(
        "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
      );

      if (focusableElements.length === 0) {
        event.preventDefault();
        closeButtonRef.current?.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey) {
        if (activeElement === firstElement || !drawer.contains(activeElement)) {
          event.preventDefault();
          lastElement.focus();
        }
        return;
      }

      if (activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    const raf = window.requestAnimationFrame(() => {
      const drawer = drawerRef.current;
      if (!drawer) return;
      const autoFocusTarget = drawer.querySelector<HTMLElement>("[data-autofocus]");
      const firstInputTarget = drawer.querySelector<HTMLElement>("input:not([disabled]), select:not([disabled]), textarea:not([disabled])");
      if (autoFocusTarget) {
        autoFocusTarget.focus();
        return;
      }
      if (firstInputTarget) {
        firstInputTarget.focus();
        return;
      }
      closeButtonRef.current?.focus();
    });

    document.addEventListener("keydown", onKeyDown);

    return () => {
      window.cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-end bg-[var(--color-overlay)] backdrop-blur-sm sm:items-stretch" role="presentation" onClick={onClose}>
      <div
        ref={drawerRef}
        className="app-sidebar relative flex h-[100dvh] w-full flex-col border-l sm:h-full sm:max-w-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="drawer-header-semantic">
          <div className="mb-1 h-1 w-12 bg-[var(--color-accent)]/70 sm:hidden" />
          <div className="flex items-start justify-between gap-3">
            <h3 id={titleId} className="text-primary text-lg font-semibold">
            {account ? `Editar cuenta: ${account.name}` : "Nueva cuenta"}
            </h3>
            <Button ref={closeButtonRef} type="button" variant="ghost" className="btn-close-semantic" onClick={onClose}>
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Cerrar</span>
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          <div className="space-y-4">
          <section className="drawer-section-semantic">
            <h4 className="text-muted text-xs font-semibold uppercase tracking-wide">General</h4>
            <BaseFields form={form} errors={errors} onChange={onChange} />
          </section>

          <section className="drawer-section-semantic">
            <h4 className="text-muted text-xs font-semibold uppercase tracking-wide">Crédito</h4>
            <CreditFields form={form} errors={errors} onChange={onChange} />
          </section>

          <section className="drawer-section-semantic">
            <h4 className="text-muted text-xs font-semibold uppercase tracking-wide">Saldos e interés</h4>
            <BalanceFields form={form} errors={errors} onChange={onChange} />
          </section>

          {submitError ? <Alert variant="danger">{submitError}</Alert> : null}
          </div>
        </div>

          <div className="drawer-footer-semantic">
            <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" className="h-8 rounded-md border-[var(--color-danger)]/50 bg-[var(--color-danger)]/15 px-3 text-xs font-bold text-[var(--color-danger)] hover:border-[var(--color-danger)]/70 hover:bg-[var(--color-danger)]/25" onClick={onClose}>Cancelar</Button>
            <Button type="button" variant="ghost" loading={submitting} loadingText="Guardando..." className="h-8 rounded-md border-blue-400/60 bg-blue-500/15 px-3 text-xs font-bold text-blue-700 hover:border-blue-500/70 hover:bg-blue-500/25 hover:text-blue-800 dark:border-blue-700/60 dark:bg-blue-500/25 dark:text-blue-300 dark:hover:border-blue-500/70 dark:hover:bg-blue-500/35 dark:hover:text-blue-100" onClick={onSubmit}>
              {account ? "Guardar cambios" : "Crear cuenta"}
            </Button>
            </div>
          </div>
      </div>
    </div>
  );
}
