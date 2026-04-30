"use client";

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
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/45 p-3 backdrop-blur-sm md:p-6">
      <div className="mx-auto max-h-[95vh] w-full max-w-3xl overflow-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-800 dark:bg-slate-950 md:p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {account ? `Editar cuenta: ${account.name}` : "Nueva cuenta"}
          </h3>
          <Button type="button" variant="ghost" className="h-8 px-2" onClick={onClose}>Cerrar</Button>
        </div>

        <div className="space-y-4">
          <section className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">General</h4>
            <BaseFields form={form} errors={errors} onChange={onChange} />
          </section>

          <section className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Crédito</h4>
            <CreditFields form={form} errors={errors} onChange={onChange} />
          </section>

          <section className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Saldos e interés</h4>
            <BalanceFields form={form} errors={errors} onChange={onChange} />
          </section>

          {submitError ? <Alert variant="danger">{submitError}</Alert> : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
            <Button type="button" loading={submitting} loadingText="Guardando..." onClick={onSubmit}>
              {account ? "Guardar cambios" : "Crear cuenta"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
