import { Input } from "@/components/ui/input";
import type { AccountFormErrors, AccountUpsertPayload } from "@/lib/contracts/accounts-admin";

type Props = {
  form: AccountUpsertPayload;
  errors: AccountFormErrors;
  onChange: <K extends keyof AccountUpsertPayload>(key: K, value: AccountUpsertPayload[K]) => void;
};

export function BalanceFields({ form, errors, onChange }: Props) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <Input
          label="Saldo inicial"
          type="number"
          step="0.01"
          value={form.initialBalance}
          error={errors.initialBalance}
          onChange={(event) => onChange("initialBalance", Number(event.target.value || 0))}
        />
        <Input
          label="Saldo actual"
          type="number"
          step="0.01"
          value={form.currentBalance}
          error={errors.currentBalance}
          onChange={(event) => onChange("currentBalance", Number(event.target.value || 0))}
        />
      </div>

      <label className="text-secondary flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={form.earnsInterest} onChange={(event) => onChange("earnsInterest", event.target.checked)} />
        Genera interés
      </label>

      {form.earnsInterest ? (
        <Input
          label="Tasa anual (%)"
          type="number"
          min="0"
          step="0.01"
          value={form.annualInterestRate}
          error={errors.annualInterestRate}
          onChange={(event) => onChange("annualInterestRate", Number(event.target.value || 0))}
        />
      ) : null}
    </div>
  );
}
