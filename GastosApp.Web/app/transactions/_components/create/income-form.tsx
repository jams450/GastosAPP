import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  accountId: number | null;
  onAccountIdChange: (value: number | null) => void;
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
};

export function IncomeForm({
  accounts,
  merchants,
  tags,
  accountId,
  onAccountIdChange,
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
  parseSelectedNumber
}: Props) {
  const [showOptional, setShowOptional] = useState(false);

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.accountId === accountId) ?? null,
    [accounts, accountId]
  );

  const selectedCategoryName = useMemo(
    () => categoriesForKind.find((category) => category.categoryId === categoryId)?.name?.toLowerCase() ?? "",
    [categoriesForKind, categoryId]
  );

  const amountNumber = Number(amount);
  const amountIsValid = Number.isFinite(amountNumber) && amountNumber > 0;
  const isSubmitEnabled = Boolean(accountId && categoryId && transactionDate && description.trim() && amountIsValid);

  const descriptionPlaceholder = selectedCategoryName.includes("inter")
    ? "Ej. Interés mensual"
    : selectedCategoryName.includes("nom")
      ? "Ej. Nómina quincenal"
      : selectedCategoryName.includes("devol")
        ? "Ej. Devolución de compra"
        : "Ej. Ingreso adicional";

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
      <header className="space-y-1">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Nuevo ingreso</h3>
        <p className="text-xs text-slate-600 dark:text-slate-400">Completa obligatorios primero. Detalles opcionales después.</p>
      </header>

      <section className="space-y-4 rounded-2xl border border-emerald-200/70 bg-emerald-50/40 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/30">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Datos obligatorios</p>

        <label className="grid gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
          Cuenta *
          <select
            value={accountId ?? ""}
            onChange={(event) => onAccountIdChange(parseSelectedNumber(event.target.value))}
            className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            required
          >
            <option value="">Selecciona una cuenta</option>
            {accounts.map((account) => (
              <option key={account.accountId} value={account.accountId}>
                {account.name} · {formatCurrency(account.currentBalance)}
              </option>
            ))}
          </select>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {selectedAccount ? `Saldo actual: ${formatCurrency(selectedAccount.currentBalance)}` : "Elige cuenta para ver saldo"}
          </span>
        </label>

        <label className="grid gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
          Categoría *
          <select
            value={categoryId ?? ""}
            onChange={(event) => onCategoryIdChange(parseSelectedNumber(event.target.value))}
            className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
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

        <div className="grid gap-4 md:grid-cols-2">
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
              rightSlot={<span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">MXN</span>}
              required
            />
            <p className="px-1 text-xs text-slate-600 dark:text-slate-400">
              {amountIsValid ? `Vista previa: ${formatCurrency(amountNumber)}` : "Ingresa monto mayor a 0"}
            </p>
          </div>

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
              <Button type="button" variant="ghost" className="h-7 rounded-lg px-2 text-xs" onClick={setNowDateTime}>
                Ahora
              </Button>
              <Button type="button" variant="ghost" className="h-7 rounded-lg px-2 text-xs" onClick={setYesterdayNight}>
                Ayer 21:00
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-lg px-1 text-left"
          onClick={() => setShowOptional((value) => !value)}
          aria-expanded={showOptional}
        >
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">Más detalles (opcional)</span>
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{showOptional ? "Ocultar" : "Mostrar"}</span>
        </button>

        {showOptional ? (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                Subcategoría
                <select
                  value={subcategoryId ?? ""}
                  onChange={(event) => onSubcategoryIdChange(parseSelectedNumber(event.target.value))}
                  className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:opacity-70 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
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

              <label className="grid gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                Comercio
                <select
                  value={merchantId ?? ""}
                  onChange={(event) => onMerchantIdChange(parseSelectedNumber(event.target.value))}
                  className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
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
              placeholder="ej. nómina, interés, cashback"
              list="transaction-tag-suggestions-income"
            />
            <datalist id="transaction-tag-suggestions-income">
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

      <Input
        label="Descripción *"
        type="text"
        value={description}
        onChange={(event) => onDescriptionChange(event.target.value)}
        placeholder={descriptionPlaceholder}
        maxLength={120}
        required
      />
      <p className="-mt-3 px-1 text-right text-xs text-slate-500 dark:text-slate-400">{description.trim().length}/120</p>

      {submitError ? <Alert variant="danger">{submitError}</Alert> : null}
      {successMessage ? <Alert variant="info">{successMessage}</Alert> : null}

      <div className="sticky bottom-0 rounded-2xl border border-slate-200 bg-white/95 p-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <div className="flex flex-col items-stretch justify-between gap-2 sm:flex-row sm:items-center">
          <p className="text-xs text-slate-600 dark:text-slate-400">Completa obligatorios para habilitar guardado.</p>
          <Button
            type="submit"
            loading={submitLoading}
            loadingText="Guardando ingreso..."
            className="w-full border-emerald-600 bg-emerald-600 hover:border-emerald-700 hover:bg-emerald-700 sm:w-auto"
            disabled={!isSubmitEnabled}
          >
            Guardar ingreso
          </Button>
        </div>
      </div>
    </form>
  );
}
