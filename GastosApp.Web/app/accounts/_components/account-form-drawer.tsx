"use client";

import { useEffect, useId, useRef } from "react";
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
        onClose();
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
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-end bg-black/70 backdrop-blur-sm sm:items-stretch" role="presentation" onClick={onClose}>
      <div
        ref={drawerRef}
        className="relative flex h-[100dvh] w-full flex-col border-l border-blue-500/40 bg-zinc-950 shadow-[0_0_40px_rgba(37,99,235,0.15)] sm:h-full sm:max-w-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 border-b border-blue-500/30 bg-zinc-950/95 px-4 py-3 backdrop-blur sm:px-5 sm:py-4">
          <div className="mb-1 h-1 w-12 bg-blue-500/80 sm:hidden" />
          <div className="flex items-start justify-between gap-3">
            <h3 id={titleId} className="text-lg font-semibold text-zinc-100">
            {account ? `Editar cuenta: ${account.name}` : "Nueva cuenta"}
            </h3>
            <Button ref={closeButtonRef} type="button" variant="ghost" className="h-8 rounded-md border border-zinc-700 bg-zinc-900 px-2.5 text-zinc-200 hover:bg-zinc-800" onClick={onClose}>Cerrar</Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          <div className="space-y-4">
          <section className="space-y-2 border border-zinc-800 p-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">General</h4>
            <BaseFields form={form} errors={errors} onChange={onChange} />
          </section>

          <section className="space-y-2 border border-zinc-800 p-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Crédito</h4>
            <CreditFields form={form} errors={errors} onChange={onChange} />
          </section>

          <section className="space-y-2 border border-zinc-800 p-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Saldos e interés</h4>
            <BalanceFields form={form} errors={errors} onChange={onChange} />
          </section>

          {submitError ? <Alert variant="danger">{submitError}</Alert> : null}
          </div>
        </div>

          <div className="border-t border-blue-500/30 bg-zinc-950/95 px-4 py-3 sm:px-5 sm:py-4">
            <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" className="h-8 rounded-md border-zinc-700 bg-zinc-900 px-3 text-xs font-bold" onClick={onClose}>Cancelar</Button>
            <Button type="button" loading={submitting} loadingText="Guardando..." className="h-8 rounded-md !border-[#0F3158] !bg-[#0F3158] px-3 text-xs font-bold text-white hover:!border-[#144277] hover:!bg-[#144277]" onClick={onSubmit}>
              {account ? "Guardar cambios" : "Crear cuenta"}
            </Button>
            </div>
          </div>
      </div>
    </div>
  );
}
