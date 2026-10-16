import type { AccountFormErrors, AccountUpsertPayload } from "@/lib/contracts/accounts-admin";
import { DecimalInput } from "./decimal-input";

type Props = {
  form: AccountUpsertPayload;
  errors: AccountFormErrors;
  onChange: <K extends keyof AccountUpsertPayload>(key: K, value: AccountUpsertPayload[K]) => void;
};

export function BalanceFields({ form, errors, onChange }: Props) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <DecimalInput
          label="Saldo inicial"
          value={form.initialBalance}
          error={errors.initialBalance}
          onChange={(value) => onChange("initialBalance", value ?? 0)}
        />
        <DecimalInput
          label="Saldo actual"
          value={form.currentBalance}
          error={errors.currentBalance}
          onChange={(value) => onChange("currentBalance", value ?? 0)}
        />
      </div>

      <label className="text-secondary flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" className="h-4 w-4 accent-[var(--color-accent)]" checked={form.earnsInterest} onChange={(event) => onChange("earnsInterest", event.target.checked)} />
        Genera interés
      </label>

      {form.earnsInterest ? (
        <DecimalInput
          label="Tasa anual (%)"
          value={form.annualInterestRate}
          error={errors.annualInterestRate}
          onChange={(value) => onChange("annualInterestRate", value ?? 0)}
        />
      ) : null}
    </div>
  );
}
