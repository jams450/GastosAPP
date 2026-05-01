import type { FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { CatalogsResponse, TransferEditFormState } from "../../_lib/transactions-types";

type Props = {
  open: boolean;
  form: TransferEditFormState | null;
  catalogs: CatalogsResponse | null;
  subcategories: { subcategoryId: number; name: string }[];
  parseSelectedNumber: (value: string) => number | null;
  onChange: (next: TransferEditFormState | null) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  saving: boolean;
  error: string | null;
};

export function EditTransferModal({ open, form, catalogs, subcategories, parseSelectedNumber, onChange, onClose, onSubmit, saving, error }: Props) {
  if (!open || !form) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4">
      <Card className="w-full max-w-xl p-6">
        <form className="space-y-4" onSubmit={onSubmit}>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Editar transferencia (grupo)</h3>

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
              {(catalogs?.categoriesByType.transfer ?? catalogs?.categories ?? []).map((category) => (
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

          <Input label="Fecha" type="datetime-local" step="60" value={form.transactionDate} onChange={(e) => onChange({ ...form, transactionDate: e.target.value })} required />
          <Input label="Descripción" type="text" value={form.description} onChange={(e) => onChange({ ...form, description: e.target.value })} required />
          <Input label="Tags (opcional, separados por coma)" type="text" value={form.tagsText} onChange={(e) => onChange({ ...form, tagsText: e.target.value })} list="transaction-tag-suggestions" />

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
