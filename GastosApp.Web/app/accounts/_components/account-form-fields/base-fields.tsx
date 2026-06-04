import { Input } from "@/components/ui/input";
import type { AccountFormErrors, AccountUpsertPayload } from "@/lib/contracts/accounts-admin";

type Props = {
  form: AccountUpsertPayload;
  errors: AccountFormErrors;
  onChange: <K extends keyof AccountUpsertPayload>(key: K, value: AccountUpsertPayload[K]) => void;
};

export function BaseFields({ form, errors, onChange }: Props) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Input label="Nombre" value={form.name} error={errors.name} onChange={(event) => onChange("name", event.target.value)} required />
      <Input label="Fecha inicio" type="date" value={form.startDate} error={errors.startDate} onChange={(event) => onChange("startDate", event.target.value)} required />

      <Input label="Color" type="color" value={form.color} error={errors.color} onChange={(event) => onChange("color", event.target.value)} />

      <label className="text-secondary grid gap-1.5 text-sm font-medium">
        Estado
        <select
          value={form.active ? "active" : "inactive"}
          onChange={(event) => onChange("active", event.target.value === "active")}
          className="input-semantic h-11 rounded-xl px-3 text-sm"
        >
          <option value="active">Activa</option>
          <option value="inactive">Inactiva</option>
        </select>
      </label>
    </div>
  );
}
