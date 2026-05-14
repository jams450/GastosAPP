import type { FormEvent } from "react";
import { Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { CatalogsResponse, EditFormState } from "../../_lib/transactions-types";

type Props = {
  open: boolean;
  form: EditFormState | null;
  catalogs: CatalogsResponse | null;
  subcategories: { subcategoryId: number; name: string }[];
  parseSelectedNumber: (value: string) => number | null;
  onChange: (next: EditFormState | null) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  saving: boolean;
  error: string | null;
};

export function EditTransactionModal({
  open,
  form,
  catalogs,
  subcategories,
  parseSelectedNumber,
  onChange,
  onClose,
  onSubmit,
  saving,
  error
}: Props) {
  if (!open || !form) return null;
  const allocationsTotal = form.allocations.reduce((acc, row) => {
    const value = Number(row.value);
    return acc + (Number.isFinite(value) ? value : 0);
  }, 0);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4">
      <Card className="w-full max-w-4xl max-h-[92vh] overflow-y-auto p-6">
        <form className="space-y-4" onSubmit={onSubmit}>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Editar transacción</h3>

          <label className="grid gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
            Categoría
            <select
              value={form.categoryId}
              onChange={(event) => {
                const nextCategoryId = parseSelectedNumber(event.target.value) ?? 0;
                onChange({ ...form, categoryId: nextCategoryId, subcategoryId: null });
              }}
              className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              required
            >
              {(catalogs?.categoriesByType[form.type ?? "expense"] ?? catalogs?.categories ?? []).map((category) => (
                <option key={category.categoryId} value={category.categoryId}>{category.name}</option>
              ))}
            </select>
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
              Subcategoría (opcional)
              <select
                value={form.subcategoryId ?? ""}
                onChange={(event) => onChange({ ...form, subcategoryId: parseSelectedNumber(event.target.value) })}
                className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="">Sin subcategoría</option>
                {subcategories.map((subcategory) => (
                  <option key={subcategory.subcategoryId} value={subcategory.subcategoryId}>{subcategory.name}</option>
                ))}
              </select>
            </label>

            <label className="grid gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
              Comercio (opcional)
              <select
                value={form.merchantId ?? ""}
                onChange={(event) => onChange({ ...form, merchantId: parseSelectedNumber(event.target.value) })}
                className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="">Sin comercio</option>
                {(catalogs?.merchants ?? []).map((merchant) => (
                  <option key={merchant.merchantId} value={merchant.merchantId}>{merchant.name}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Input label="Monto" type="number" step="0.01" min="0.01" value={form.amount} onChange={(e) => onChange({ ...form, amount: e.target.value })} required />
            <Input label="Fecha" type="datetime-local" step="60" value={form.transactionDate} onChange={(e) => onChange({ ...form, transactionDate: e.target.value })} required />
          </div>

          <Input label="Descripción" type="text" value={form.description} onChange={(e) => onChange({ ...form, description: e.target.value })} required />
          <Input label="Tags (opcional, separados por coma)" type="text" value={form.tagsText} onChange={(e) => onChange({ ...form, tagsText: e.target.value })} list="transaction-tag-suggestions" />

          {form.type === "expense" ? (
            <div className="space-y-2 rounded-xl border border-sky-200 bg-sky-50 p-3 dark:border-sky-900/70 dark:bg-sky-950/20">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300">Responsables</p>
                <Button
                  type="button"
                  variant="secondary"
                  className="h-7 rounded-lg px-2 text-xs"
                  onClick={() => onChange({ ...form, allocations: [...form.allocations, { rowId: crypto.randomUUID(), billablePartyId: null, type: "percentage", value: "" }] })}
                >
                  Agregar responsable
                </Button>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400">Total capturado: {allocationsTotal.toFixed(2)} {form.allocations[0]?.type === "amount" ? "MXN" : "%"}</p>
              {form.allocations.map((allocation, index) => (
                <div key={allocation.rowId} className="grid gap-2 md:grid-cols-[1fr_160px_160px_auto]">
                  <label className="grid gap-1 text-xs font-medium text-slate-700 dark:text-slate-300">
                    Responsable
                    <select
                      value={allocation.billablePartyId ?? ""}
                      onChange={(event) => {
                        const next = [...form.allocations];
                        next[index] = { ...allocation, billablePartyId: parseSelectedNumber(event.target.value) };
                        onChange({ ...form, allocations: next });
                      }}
                      className="h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                    >
                      <option value="">Sin asignación</option>
                      {(catalogs?.billableParties ?? []).map((party) => (
                        <option key={party.billablePartyId} value={party.billablePartyId}>{party.displayName}</option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs font-medium text-slate-700 dark:text-slate-300">
                    Tipo
                    <select
                      value={allocation.type}
                      onChange={(event) => {
                        const next = [...form.allocations];
                        next[index] = { ...allocation, type: event.target.value === "amount" ? "amount" : "percentage" };
                        onChange({ ...form, allocations: next });
                      }}
                      className="h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                    >
                      <option value="percentage">Porcentaje</option>
                      <option value="amount">Monto</option>
                    </select>
                  </label>
                  <Input
                    label={allocation.type === "percentage" ? "Valor (%)" : "Valor ($)"}
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={allocation.value}
                    onChange={(event) => {
                      const next = [...form.allocations];
                      next[index] = { ...allocation, value: event.target.value };
                      onChange({ ...form, allocations: next });
                    }}
                  />
                  <div className="flex items-end pb-1">
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-10 gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-700 hover:bg-rose-100 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-300 dark:hover:bg-rose-950/50 disabled:opacity-50"
                      onClick={() => onChange({ ...form, allocations: form.allocations.filter((item) => item.rowId !== allocation.rowId) })}
                      disabled={form.allocations.length <= 1}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Eliminar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {error ? <Alert variant="danger">{error}</Alert> : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
            <Button type="submit" loading={saving} loadingText="Guardando...">Guardar cambios</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
