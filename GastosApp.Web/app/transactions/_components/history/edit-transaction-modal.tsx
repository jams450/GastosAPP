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
    <div className="fixed inset-0 z-50 grid place-items-center bg-[var(--color-overlay)] p-4">
      <Card className="app-card w-full max-w-4xl max-h-[92vh] overflow-y-auto p-6">
        <form className="space-y-4" onSubmit={onSubmit}>
          <h3 className="text-lg font-semibold text-primary">Editar transacción</h3>

          <label className="grid gap-1.5 text-sm font-medium text-secondary">
            Categoría
            <select
              value={form.categoryId}
              onChange={(event) => {
                const nextCategoryId = parseSelectedNumber(event.target.value) ?? 0;
                onChange({ ...form, categoryId: nextCategoryId, subcategoryId: null });
              }}
              className="input-semantic h-11 rounded-xl px-3 text-sm"
              required
            >
              {(catalogs?.categoriesByType[form.type ?? "expense"] ?? catalogs?.categories ?? []).map((category) => (
                <option key={category.categoryId} value={category.categoryId}>{category.name}</option>
              ))}
            </select>
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-medium text-secondary">
              Subcategoría (opcional)
              <select
                value={form.subcategoryId ?? ""}
                onChange={(event) => onChange({ ...form, subcategoryId: parseSelectedNumber(event.target.value) })}
                className="input-semantic h-11 rounded-xl px-3 text-sm"
              >
                <option value="">Sin subcategoría</option>
                {subcategories.map((subcategory) => (
                  <option key={subcategory.subcategoryId} value={subcategory.subcategoryId}>{subcategory.name}</option>
                ))}
              </select>
            </label>

            <label className="grid gap-1.5 text-sm font-medium text-secondary">
              Comercio (opcional)
              <select
                value={form.merchantId ?? ""}
                onChange={(event) => onChange({ ...form, merchantId: parseSelectedNumber(event.target.value) })}
                className="input-semantic h-11 rounded-xl px-3 text-sm"
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
            <div className="app-panel space-y-2 rounded-xl border p-3">
              <div className="flex items-center justify-between">
                <p className="text-primary text-xs font-semibold uppercase tracking-wide">Responsables</p>
                <Button
                  type="button"
                  variant="secondary"
                  className="h-7 rounded-lg px-2 text-xs"
                  onClick={() => onChange({ ...form, allocations: [...form.allocations, { rowId: crypto.randomUUID(), billablePartyId: null, type: "percentage", value: "" }] })}
                >
                  Agregar responsable
                </Button>
              </div>
              <p className="text-xs text-muted">Total capturado: {allocationsTotal.toFixed(2)} {form.allocations[0]?.type === "amount" ? "MXN" : "%"}</p>
              {form.allocations.map((allocation, index) => (
                <div key={allocation.rowId} className="grid gap-2 md:grid-cols-[1fr_160px_160px_auto]">
                  <label className="grid gap-1 text-xs font-medium text-secondary">
                    Responsable
                    <select
                      value={allocation.billablePartyId ?? ""}
                      onChange={(event) => {
                        const next = [...form.allocations];
                        next[index] = { ...allocation, billablePartyId: parseSelectedNumber(event.target.value) };
                        onChange({ ...form, allocations: next });
                      }}
                      className="input-semantic h-10 rounded-lg px-2 text-sm"
                    >
                      <option value="">Sin asignación</option>
                      {(catalogs?.billableParties ?? []).map((party) => (
                        <option key={party.billablePartyId} value={party.billablePartyId}>{party.displayName}</option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs font-medium text-secondary">
                    Tipo
                    <select
                      value={allocation.type}
                      onChange={(event) => {
                        const next = [...form.allocations];
                        next[index] = { ...allocation, type: event.target.value === "amount" ? "amount" : "percentage" };
                        onChange({ ...form, allocations: next });
                      }}
                      className="input-semantic h-10 rounded-lg px-2 text-sm"
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
                      className="h-10 gap-1.5 rounded-lg border border-[var(--color-danger)]/35 bg-[var(--color-danger)]/12 px-3 text-xs font-semibold text-[var(--color-danger)] hover:bg-[var(--color-danger)]/18 disabled:opacity-50"
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
