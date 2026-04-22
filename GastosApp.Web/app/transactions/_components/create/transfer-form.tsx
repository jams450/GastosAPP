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
  parseSelectedNumber
}: Props) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
          Cuenta origen
          <select
            value={sourceAccountId ?? ""}
            onChange={(event) => onSourceAccountIdChange(parseSelectedNumber(event.target.value))}
            className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
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

        <label className="grid gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
          Cuenta destino
          <select
            value={destinationAccountId ?? ""}
            onChange={(event) => onDestinationAccountIdChange(parseSelectedNumber(event.target.value))}
            className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
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

        <div className="md:col-span-2">
          <Button type="button" variant="ghost" className="h-9 px-0 text-sm" onClick={onSwapAccounts}>
            Intercambiar origen y destino
          </Button>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {sourceAccountName ? `Origen: ${sourceAccountName}` : "Origen sin seleccionar"} ·{" "}
            {destinationAccountName ? `Destino: ${destinationAccountName}` : "Destino sin seleccionar"}
          </p>
        </div>
      </div>

      <label className="grid gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
        Categoría
        <select
          value={categoryId ?? ""}
          onChange={(event) => onCategoryIdChange(parseSelectedNumber(event.target.value))}
          className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
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
        <label className="grid gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
          Subcategoría (opcional)
          <select
            value={subcategoryId ?? ""}
            onChange={(event) => onSubcategoryIdChange(parseSelectedNumber(event.target.value))}
            className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            <option value="">Sin subcategoría</option>
            {subcategoriesForSelectedCategory.map((subcategory) => (
              <option key={subcategory.subcategoryId} value={subcategory.subcategoryId}>
                {subcategory.name}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
          Comercio (opcional)
          <select
            value={merchantId ?? ""}
            onChange={(event) => onMerchantIdChange(parseSelectedNumber(event.target.value))}
            className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
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
        label="Tags (opcional, separados por coma)"
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

      <div className="grid gap-4 md:grid-cols-2">
        <Input
          label="Monto"
          type="number"
          step="0.01"
          min="0.01"
          value={amount}
          onChange={(event) => onAmountChange(event.target.value)}
          placeholder="0.00"
          required
        />

        <Input
          label="Fecha"
          type="date"
          value={transactionDate}
          onChange={(event) => onTransactionDateChange(event.target.value)}
          required
        />
      </div>

      <Input
        label="Descripción"
        type="text"
        value={description}
        onChange={(event) => onDescriptionChange(event.target.value)}
        placeholder="Ej. Traspaso a cuenta ahorro"
        required
      />

      {submitError ? <Alert variant="danger">{submitError}</Alert> : null}
      {successMessage ? <Alert variant="info">{successMessage}</Alert> : null}

      <div className="flex justify-end">
        <Button type="submit" loading={submitLoading} loadingText="Guardando...">
          Guardar transferencia
        </Button>
      </div>
    </form>
  );
}
