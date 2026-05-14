import type { FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export type ApplyCreditPaymentForm = {
  sourceTransactionId: number;
  creditAccountId: number;
  maxAmount: number;
  mode: "full" | "partial";
  amount: string;
};

type Props = {
  open: boolean;
  form: ApplyCreditPaymentForm | null;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onChange: (next: ApplyCreditPaymentForm | null) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function ApplyCreditPaymentModal({ open, form, saving, error, onClose, onChange, onSubmit }: Props) {
  if (!open || !form) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4">
      <Card className="w-full max-w-lg p-6">
        <form className="space-y-4" onSubmit={onSubmit}>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Aplicar pago a mensualidades</h3>

          <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-800 dark:bg-slate-900/50">
            <p className="text-slate-600 dark:text-slate-300">ID transacción origen: <span className="font-semibold">#{form.sourceTransactionId}</span></p>
            <p className="text-slate-600 dark:text-slate-300">Monto máximo aplicable: <span className="font-semibold">${form.maxAmount.toFixed(2)}</span></p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
              Tipo de aplicación
              <select
                value={form.mode}
                onChange={(event) => onChange({ ...form, mode: event.target.value === "partial" ? "partial" : "full" })}
                className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="full">Completo</option>
                <option value="partial">Parcial</option>
              </select>
            </label>

            <Input
              label="Monto parcial"
              type="number"
              min="0.01"
              step="0.01"
              value={form.amount}
              onChange={(event) => onChange({ ...form, amount: event.target.value })}
              disabled={form.mode !== "partial"}
              placeholder="0.00"
            />
          </div>

          {error ? <Alert variant="danger">{error}</Alert> : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
            <Button type="submit" loading={saving} loadingText="Aplicando...">Aplicar pago</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
