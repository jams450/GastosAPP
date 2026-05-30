import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowUpDown, RefreshCw } from "lucide-react";
import { formatCurrency } from "@/lib/format/currency";
import type { Account } from "@/lib/contracts/accounts";
import type { Category } from "@/lib/contracts/categories";
import type { Merchant } from "@/lib/contracts/merchants";
import type { Subcategory } from "@/lib/contracts/subcategories";
import type { Tag } from "@/lib/contracts/tags";

type Props = {
  accounts: Account[];
  merchants: Merchant[];
  tags: Tag[];
  sourceAccountId: number | null;
  onSourceAccountIdChange: (value: number | null) => void;
  destinationAccountId: number | null;
  onDestinationAccountIdChange: (value: number | null) => void;
  sourceAccountName: string | null;
  destinationAccountName: string | null;
  onSwapAccounts: () => void;
  categoryId: number | null;
  onCategoryIdChange: (value: number | null) => void;
  categoriesForKind: Category[];
  subcategoryId: number | null;
  onSubcategoryIdChange: (value: number | null) => void;
  subcategoriesForSelectedCategory: Subcategory[];
  merchantId: number | null;
  onMerchantIdChange: (value: number | null) => void;
  tagsText: string;
  onTagsTextChange: (value: string) => void;
  amount: string;
  onAmountChange: (value: string) => void;
  transactionDate: string;
  onTransactionDateChange: (value: string) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  submitError: string | null;
  successMessage: string | null;
  submitLoading: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  parseSelectedNumber: (value: string) => number | null;
  creditAllocationSection?: ReactNode;
};

export function TransferForm({
  accounts,
  merchants,
  tags,
  sourceAccountId,
  onSourceAccountIdChange,
  destinationAccountId,
  onDestinationAccountIdChange,
  sourceAccountName,
  destinationAccountName,
  onSwapAccounts,
  categoryId,
  onCategoryIdChange,
  categoriesForKind,
  subcategoryId,
  onSubcategoryIdChange,
  subcategoriesForSelectedCategory,
  merchantId,
  onMerchantIdChange,
  tagsText,
  onTagsTextChange,
  amount,
  onAmountChange,
  transactionDate,
  onTransactionDateChange,
  description,
  onDescriptionChange,
  submitError,
  successMessage,
  submitLoading,
  onSubmit,
  parseSelectedNumber,
  creditAllocationSection
}: Props) {
  const [showOptional, setShowOptional] = useState(true);

  const selectedCategoryName = useMemo(
    () => categoriesForKind.find((category) => category.categoryId === categoryId)?.name?.toLowerCase() ?? "",
    [categoriesForKind, categoryId]
  );

  const amountNumber = Number(amount);
  const amountIsValid = Number.isFinite(amountNumber) && amountNumber > 0;
  const differentAccounts = Boolean(sourceAccountId && destinationAccountId && sourceAccountId !== destinationAccountId);
  const isSubmitEnabled = Boolean(differentAccounts && categoryId && transactionDate && description.trim() && amountIsValid);

  const descriptionPlaceholder = selectedCategoryName.includes("ahorro")
    ? "Ej. Traspaso a cuenta de ahorro"
    : selectedCategoryName.includes("inver")
      ? "Ej. Movimiento a inversión"
      : "Ej. Traspaso entre cuentas";

  function toLocalDateTimeInput(value: Date): string {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    const hour = String(value.getHours()).padStart(2, "0");
    const minutes = String(value.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hour}:${minutes}`;
  }

  function setNowDateTime() {
    onTransactionDateChange(toLocalDateTimeInput(new Date()));
  }

  function setYesterdayNight() {
    const value = new Date();
    value.setDate(value.getDate() - 1);
    value.setHours(21, 0, 0, 0);
    onTransactionDateChange(toLocalDateTimeInput(value));
  }

  function addSuggestedTag(tagName: string) {
    const current = tagsText
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);

    if (current.some((tag) => tag.toLowerCase() === tagName.toLowerCase())) {
      return;
    }

    onTagsTextChange([...current, tagName].join(", "));
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-primary">Nueva transferencia</h3>
          <Button type="button" variant="secondary" className="btn-secondary-semantic h-8 rounded-lg px-2.5 text-xs font-semibold" onClick={onSwapAccounts}>
            <ArrowUpDown className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            Intercambiar origen y destino
          </Button>
        </div>
        <p className="text-xs text-muted">Selecciona origen y destino. Completa obligatorios primero.</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
      <section className="space-y-4 rounded-2xl border border-indigo-200/70 bg-indigo-50/40 p-4 dark:border-indigo-900/60 dark:bg-indigo-950/30">
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">Datos obligatorios</p>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-medium text-secondary">
            Cuenta origen *
            <select
              value={sourceAccountId ?? ""}
              onChange={(event) => onSourceAccountIdChange(parseSelectedNumber(event.target.value))}
              className="input-semantic h-11 rounded-xl px-3 text-sm"
              required
            >
              <option value="">Selecciona una cuenta</option>
              {accounts.map((account) => (
                <option key={account.accountId} value={account.accountId}>
                  {account.name} · {formatCurrency(account.currentBalance)}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1.5 text-sm font-medium text-secondary">
            Cuenta destino *
            <select
              value={destinationAccountId ?? ""}
              onChange={(event) => onDestinationAccountIdChange(parseSelectedNumber(event.target.value))}
              className="input-semantic h-11 rounded-xl px-3 text-sm"
              required
            >
              <option value="">Selecciona una cuenta</option>
              {accounts.map((account) => (
                <option key={account.accountId} value={account.accountId}>
                  {account.name} · {formatCurrency(account.currentBalance)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="rounded-xl border border-indigo-200 bg-white/80 p-3 dark:border-indigo-800 dark:bg-slate-950/60">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {sourceAccountName ? `Origen: ${sourceAccountName}` : "Origen sin seleccionar"} · {" "}
            {destinationAccountName ? `Destino: ${destinationAccountName}` : "Destino sin seleccionar"}
          </p>
          {sourceAccountId && destinationAccountId && sourceAccountId === destinationAccountId ? (
            <p className="mt-1 text-xs font-medium text-rose-600 dark:text-rose-400">Origen y destino deben ser diferentes.</p>
          ) : null}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-medium text-secondary">
            Categoría *
            <select
              value={categoryId ?? ""}
              onChange={(event) => onCategoryIdChange(parseSelectedNumber(event.target.value))}
              className="input-semantic h-11 rounded-xl px-3 text-sm"
              required
            >
              <option value="">Selecciona una categoría</option>
              {categoriesForKind.map((category) => (
                <option key={category.categoryId} value={category.categoryId}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          <div className="space-y-1">
            <Input
              label="Monto *"
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(event) => onAmountChange(event.target.value)}
              placeholder="0.00"
              className="text-right"
              rightSlot={<span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">MXN</span>}
              required
            />
            <p className="px-1 text-xs text-muted">
              {amountIsValid ? `Vista previa: ${formatCurrency(amountNumber)}` : "Ingresa monto mayor a 0"}
            </p>
          </div>

          <Input
            label="Descripción *"
            type="text"
            value={description}
            onChange={(event) => onDescriptionChange(event.target.value)}
            placeholder={descriptionPlaceholder}
            maxLength={120}
            required
          />

          <div className="space-y-1">
            <Input
              label="Fecha y hora *"
              type="datetime-local"
              step="60"
              value={transactionDate}
              onChange={(event) => onTransactionDateChange(event.target.value)}
              required
            />
            <div className="flex flex-wrap gap-2 px-1">
              <Button type="button" variant="secondary" className="btn-secondary-semantic h-8 rounded-lg px-2.5 text-xs font-semibold" onClick={setNowDateTime}>
                Ahora
              </Button>
              <Button type="button" variant="secondary" className="btn-secondary-semantic h-8 rounded-lg px-2.5 text-xs font-semibold" onClick={setYesterdayNight}>
                Ayer 21:00
              </Button>
            </div>
          </div>
        </div>

        <p className="-mt-3 px-1 text-right text-xs text-slate-500 dark:text-slate-400">{description.trim().length}/120</p>
      </section>

      <section className="app-panel space-y-3 rounded-2xl border p-4">
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-lg px-1 text-left"
          onClick={() => setShowOptional((value) => !value)}
          aria-expanded={showOptional}
        >
          <span className="text-primary text-sm font-semibold">Más detalles (opcional)</span>
          <span className="text-muted text-xs font-semibold">{showOptional ? "Ocultar" : "Mostrar"}</span>
        </button>

        {showOptional ? (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium text-secondary">
                Subcategoría
                <select
                  value={subcategoryId ?? ""}
                  onChange={(event) => onSubcategoryIdChange(parseSelectedNumber(event.target.value))}
                  className="input-semantic h-11 rounded-xl px-3 text-sm disabled:cursor-not-allowed disabled:opacity-70"
                  disabled={!categoryId}
                >
                  <option value="">Sin subcategoría</option>
                  {subcategoriesForSelectedCategory.map((subcategory) => (
                    <option key={subcategory.subcategoryId} value={subcategory.subcategoryId}>
                      {subcategory.name}
                    </option>
                  ))}
                </select>
                {!categoryId ? <span className="text-xs text-slate-500 dark:text-slate-400">Primero selecciona categoría</span> : null}
              </label>

              <label className="grid gap-1.5 text-sm font-medium text-secondary">
                Comercio
                <select
                  value={merchantId ?? ""}
                  onChange={(event) => onMerchantIdChange(parseSelectedNumber(event.target.value))}
                  className="input-semantic h-11 rounded-xl px-3 text-sm"
                >
                  <option value="">Sin comercio</option>
                  {merchants.map((merchant) => (
                    <option key={merchant.merchantId} value={merchant.merchantId}>
                      {merchant.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <Input
              label="Tags (separados por coma)"
              type="text"
              value={tagsText}
              onChange={(event) => onTagsTextChange(event.target.value)}
              placeholder="ej. ajuste, inversión, ahorro"
              list="transaction-tag-suggestions-transfer"
            />
            <datalist id="transaction-tag-suggestions-transfer">
              {tags.map((tag) => (
                <option key={tag.tagId} value={tag.name} />
              ))}
            </datalist>
            {tags.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {tags.slice(0, 6).map((tag) => (
                  <Button
                    key={tag.tagId}
                    type="button"
                    variant="secondary"
                    className="h-7 rounded-lg px-2 text-xs"
                    onClick={() => addSuggestedTag(tag.name)}
                  >
                    + {tag.name}
                  </Button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
      </div>

      {creditAllocationSection}

      {submitError ? <Alert variant="danger">{submitError}</Alert> : null}
      {successMessage ? <Alert variant="info">{successMessage}</Alert> : null}

      <div className="app-panel mt-6 rounded-2xl border p-3">
        <div className="flex flex-col items-stretch justify-between gap-2 sm:flex-row sm:items-center">
          <p className="text-xs text-muted">Completa obligatorios para habilitar guardado.</p>
          <Button
            type="submit"
            loading={submitLoading}
            loadingText="Guardando transferencia..."
            className="w-full border-indigo-600 bg-indigo-600 hover:border-indigo-700 hover:bg-indigo-700 sm:w-auto"
            disabled={!isSubmitEnabled}
          >
          <RefreshCw className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
          Guardar transferencia
          </Button>
        </div>
      </div>
    </form>
  );
}
