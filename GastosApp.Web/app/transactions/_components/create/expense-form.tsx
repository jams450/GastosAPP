import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/format/currency";
import type { Account } from "@/lib/contracts/accounts";
import type { Category } from "@/lib/contracts/categories";
import type { Merchant } from "@/lib/contracts/merchants";
import type { Subcategory } from "@/lib/contracts/subcategories";
import type { Tag } from "@/lib/contracts/tags";
import type { BillableParty } from "@/lib/contracts/billable-parties";
import type { ExpenseAllocationFormState } from "../../_lib/transactions-types";

type Props = {
  accounts: Account[];
  merchants: Merchant[];
  tags: Tag[];
  billableParties: BillableParty[];
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
  msiMonths: number;
  onMsiMonthsChange: (value: number) => void;
  openingCreditCharge: boolean;
  onOpeningCreditChargeChange: (value: boolean) => void;
  expenseAllocations: ExpenseAllocationFormState[];
  onExpenseAllocationsChange: (value: ExpenseAllocationFormState[]) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  submitError: string | null;
  successMessage: string | null;
  submitLoading: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  parseSelectedNumber: (value: string) => number | null;
};

export function ExpenseForm({
  accounts,
  merchants,
  tags,
  billableParties,
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
  msiMonths,
  onMsiMonthsChange,
  openingCreditCharge,
  onOpeningCreditChargeChange,
  expenseAllocations,
  onExpenseAllocationsChange,
  description,
  onDescriptionChange,
  submitError,
  successMessage,
  submitLoading,
  onSubmit,
  parseSelectedNumber
}: Props) {
  const [showOptional, setShowOptional] = useState(true);

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
  const allocationType = expenseAllocations[0]?.type ?? "percentage";
  const assignedTotal = expenseAllocations.reduce((acc, row) => {
    const value = Number(row.value);
    if (!row.billablePartyId || !Number.isFinite(value) || value <= 0) {
      return acc;
    }
    return acc + value;
  }, 0);
  const allocationTarget = allocationType === "percentage" ? 100 : (amountIsValid ? amountNumber : 0);
  const remainingAllocation = Math.max(0, allocationTarget - assignedTotal);

  const descriptionPlaceholder = selectedCategoryName.includes("super")
    ? "Ej. Compra semanal supermercado"
    : selectedCategoryName.includes("gas")
      ? "Ej. Gasolina auto"
      : selectedCategoryName.includes("serv")
        ? "Ej. Pago de servicio"
        : "Ej. Gasto del día";

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
        <h3 className="text-base font-semibold text-primary">Nuevo gasto</h3>
        <p className="text-xs text-muted">Completa obligatorios primero. Detalles opcionales después.</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
      <section className="space-y-4 rounded-2xl border border-rose-200/70 bg-rose-50/40 p-4 dark:border-rose-900/60 dark:bg-rose-950/30">
        <p className="text-xs font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-300">Datos obligatorios</p>

        <label className="grid gap-1.5 text-sm font-medium text-secondary">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-medium text-secondary">
              Cuenta *
              <select
                value={accountId ?? ""}
                onChange={(event) => onAccountIdChange(parseSelectedNumber(event.target.value))}
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
          </div>
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
              rightSlot={<span className="text-xs font-semibold text-rose-700 dark:text-rose-300">MXN</span>}
              required
            />
            <p className="px-1 text-xs text-muted">
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
              <Button type="button" variant="secondary" className="btn-secondary-semantic h-8 rounded-lg px-2.5 text-xs font-semibold" onClick={setNowDateTime}>
                Ahora
              </Button>
              <Button type="button" variant="secondary" className="btn-secondary-semantic h-8 rounded-lg px-2.5 text-xs font-semibold" onClick={setYesterdayNight}>
                Ayer 21:00
              </Button>
            </div>
          </div>
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
        <p className="-mt-3 px-1 text-right text-xs text-slate-500 dark:text-slate-400">{description.trim().length}/120</p>

        {selectedAccount?.isCredit ? (
          <div className="space-y-3 rounded-xl border border-rose-300/60 bg-white/80 p-3 dark:border-rose-800/60 dark:bg-slate-950/60">
            <label className="grid gap-1.5 text-sm font-medium text-secondary">
              Meses sin interés
              <select
                value={msiMonths}
                onChange={(event) => onMsiMonthsChange(Number(event.target.value) || 1)}
                className="input-semantic h-11 rounded-xl px-3 text-sm"
              >
                <option value={1}>1 mensualidad (normal)</option>
                <option value={2}>2 MSI</option>
                <option value={3}>3 MSI</option>
                <option value={6}>6 MSI</option>
                <option value={9}>9 MSI</option>
                <option value={12}>12 MSI</option>
                <option value={15}>15 MSI</option>
                <option value={18}>18 MSI</option>
                <option value={24}>24 MSI</option>
              </select>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Selecciona 1 para compra normal o más de 1 para convertir cargo a MSI.
              </span>
            </label>

            <label className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
              <input
                type="checkbox"
                checked={openingCreditCharge}
                onChange={(event) => onOpeningCreditChargeChange(event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-amber-400 text-amber-600 focus:ring-amber-500"
              />
              <span>
                Registrar como <strong>cargo de apertura</strong> (deuda heredada). <strong>No afectará saldos/totales de cuentas</strong>; solo crea deuda en plan de crédito.
              </span>
            </label>
          </div>
        ) : null}
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
              placeholder="ej. despensa, gasolina, servicio"
              list="transaction-tag-suggestions-expense"
            />
            <datalist id="transaction-tag-suggestions-expense">
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

      <section className="space-y-2 rounded-2xl border border-sky-200 bg-sky-50 p-4 dark:border-sky-900/70 dark:bg-sky-950/20">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300">Asignación cobrable</p>
          <label className="flex items-center gap-2 text-xs text-secondary">
            Tipo general
            <select
              value={allocationType}
              onChange={(event) => {
                const nextType = event.target.value === "amount" ? "amount" : "percentage";
                onExpenseAllocationsChange(expenseAllocations.map((row) => ({ ...row, type: nextType })));
              }}
              className="input-semantic h-8 rounded-lg px-2 text-xs"
            >
              <option value="percentage">Porcentaje</option>
              <option value="amount">Monto</option>
            </select>
          </label>
          <Button
            type="button"
            variant="secondary"
            className="h-8 rounded-lg border-sky-300 px-2.5 text-xs text-sky-700 hover:bg-sky-100 dark:border-sky-800 dark:text-sky-200"
            onClick={() => onExpenseAllocationsChange([...expenseAllocations, { rowId: crypto.randomUUID(), billablePartyId: null, type: allocationType, value: "" }])}
          >
            <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            Agregar responsable
          </Button>
        </div>
        <p className="text-xs text-muted">
          Tipo general: <strong>{allocationType === "percentage" ? "Porcentaje" : "Monto"}</strong> · Asignado: <strong>{assignedTotal.toFixed(2)}</strong> · Restante: <strong>{remainingAllocation.toFixed(2)} {allocationType === "percentage" ? "%" : "MXN"}</strong>
        </p>

        <div className="space-y-2">
          {expenseAllocations.map((allocation, index) => (
            <div key={allocation.rowId} className="grid gap-2 md:grid-cols-[1fr_180px_auto]">
              <label className="grid gap-1 text-xs font-medium text-secondary">
                Responsable
                <select
                  value={allocation.billablePartyId ?? ""}
                  onChange={(event) => {
                    const next = [...expenseAllocations];
                    next[index] = { ...allocation, billablePartyId: parseSelectedNumber(event.target.value) };
                    onExpenseAllocationsChange(next);
                  }}
                  className="input-semantic h-10 rounded-lg px-2 text-sm"
                >
                  <option value="">Sin asignación</option>
                  {billableParties.map((party) => (
                    <option key={party.billablePartyId} value={party.billablePartyId}>{party.displayName}</option>
                  ))}
                </select>
              </label>

              <Input
                label={allocationType === "percentage" ? "Valor (%)" : "Valor ($)"}
                type="number"
                step="0.01"
                min="0.01"
                value={allocation.value}
                onChange={(event) => {
                  const next = [...expenseAllocations];
                  next[index] = { ...allocation, value: event.target.value };
                  onExpenseAllocationsChange(next);
                }}
                disabled={!allocation.billablePartyId}
              />

              <div className="flex items-end pb-1">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-10 rounded-lg border border-rose-200 px-2 text-xs text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/30"
                  onClick={() => onExpenseAllocationsChange(expenseAllocations.filter((item) => item.rowId !== allocation.rowId))}
                  disabled={expenseAllocations.length <= 1}
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                  Eliminar
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {submitError ? <Alert variant="danger">{submitError}</Alert> : null}
      {successMessage ? <Alert variant="info">{successMessage}</Alert> : null}

      <div className="app-panel sticky bottom-0 rounded-2xl border bg-[color-mix(in_srgb,var(--color-surface-1)_92%,transparent)] p-3 backdrop-blur">
        <div className="flex flex-col items-stretch justify-between gap-2 sm:flex-row sm:items-center">
          <p className="text-xs text-muted">Completa obligatorios para habilitar guardado.</p>
          <Button
            type="submit"
            loading={submitLoading}
            loadingText="Guardando gasto..."
            className="w-full border-rose-600 bg-rose-600 hover:border-rose-700 hover:bg-rose-700 sm:w-auto"
            disabled={!isSubmitEnabled}
          >
          Guardar gasto
          </Button>
        </div>
      </div>
    </form>
  );
}
