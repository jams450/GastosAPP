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

      <label className="grid gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
        Estado
        <select
          value={form.active ? "active" : "inactive"}
          onChange={(event) => onChange("active", event.target.value === "active")}
          className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        >
          <option value="active">Activa</option>
          <option value="inactive">Inactiva</option>
        </select>
      </label>
    </div>
  );
}
