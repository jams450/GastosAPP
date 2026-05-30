import { Input } from "@/components/ui/input";
import type { AccountFormErrors, AccountUpsertPayload } from "@/lib/contracts/accounts-admin";

type Props = {
  form: AccountUpsertPayload;
  errors: AccountFormErrors;
  onChange: <K extends keyof AccountUpsertPayload>(key: K, value: AccountUpsertPayload[K]) => void;
};

export function CreditFields({ form, errors, onChange }: Props) {
  return (
    <div className="space-y-3">
      <label className="text-secondary flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={form.isCredit} onChange={(event) => onChange("isCredit", event.target.checked)} />
        Es cuenta de crédito
      </label>

      {form.isCredit ? (
        <div className="grid gap-3 md:grid-cols-3">
          <Input
            label="Día de corte"
            type="number"
            min="1"
            max="31"
            value={form.dueDay ?? ""}
            error={errors.dueDay}
            onChange={(event) => onChange("dueDay", event.target.value ? Number(event.target.value) : null)}
          />
          <Input
            label="Día pago límite"
            type="number"
            min="1"
            max="31"
            value={form.paymentDueDay ?? ""}
            error={errors.paymentDueDay}
            onChange={(event) => onChange("paymentDueDay", event.target.value ? Number(event.target.value) : null)}
          />
          <Input
            label="Límite de crédito"
            type="number"
            step="0.01"
            min="0"
            value={form.creditLimit ?? ""}
            error={errors.creditLimit}
            onChange={(event) => onChange("creditLimit", event.target.value ? Number(event.target.value) : null)}
          />
        </div>
      ) : null}
    </div>
  );
}
