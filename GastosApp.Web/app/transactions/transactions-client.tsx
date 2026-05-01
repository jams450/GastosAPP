"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AppMenu } from "@/components/navigation/app-menu";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ExpenseForm } from "./_components/create/expense-form";
import { IncomeForm } from "./_components/create/income-form";
import { TransferForm } from "./_components/create/transfer-form";
import { HistoryPanel } from "./_components/history/history-panel";
import { CreditAllocationSelector } from "./_components/create/credit-allocation-selector";
import { EditTransactionModal } from "./_components/history/edit-transaction-modal";
import { EditTransferModal } from "./_components/history/edit-transfer-modal";
import { useCreditAllocation } from "./_hooks/use-credit-allocation";
import { useTransactionsHistory } from "./_hooks/use-transactions-history";
import { useHistoryColumns } from "./_hooks/use-history-columns";
import { useTransactionMutations } from "./_hooks/use-transaction-mutations";
import { currentLocalDateTimeInput, currentMonthInput, dateTimeLocalInputValue, parseSelectedNumber } from "./_lib/transactions-utils";
import { type CatalogsResponse, type EditFormState, type TransactionHistoryItem, type TransactionKind, type TransferEditFormState, type TransferGroupItem, type ViewMode, typeLabel } from "./_lib/transactions-types";
import type { Account } from "@/lib/contracts/accounts";
import type { Category } from "@/lib/contracts/categories";
import type { Subcategory } from "@/lib/contracts/subcategories";

type Props = {
  username: string;
};

export function TransactionsClient({ username }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const urlKind = useMemo<TransactionKind>(() => {
    const value = searchParams.get("kind");
    if (value === "income" || value === "expense" || value === "transfer") {
      return value;
    }
    return "expense";
  }, [searchParams]);

  const urlViewMode = useMemo<ViewMode>(() => {
    const value = searchParams.get("view");
    if (value === "create" || value === "history") {
      return value;
    }
    return "create";
  }, [searchParams]);

  const [kind, setKind] = useState<TransactionKind>(urlKind);
  const [viewMode, setViewMode] = useState<ViewMode>(urlViewMode);
  const [catalogs, setCatalogs] = useState<CatalogsResponse | null>(null);
  const [catalogsLoading, setCatalogsLoading] = useState(true);
  const [catalogsError, setCatalogsError] = useState<string | null>(null);

  const [accountId, setAccountId] = useState<number | null>(null);
  const [sourceAccountId, setSourceAccountId] = useState<number | null>(null);
  const [destinationAccountId, setDestinationAccountId] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [subcategoryId, setSubcategoryId] = useState<number | null>(null);
  const [merchantId, setMerchantId] = useState<number | null>(null);
  const [tagsText, setTagsText] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [transactionDate, setTransactionDate] = useState<string>(currentLocalDateTimeInput());
  const [msiMonths, setMsiMonths] = useState<number>(1);
  const [openingCreditCharge, setOpeningCreditCharge] = useState<boolean>(false);

  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [historyMonth, setHistoryMonth] = useState<string>(currentMonthInput());

  const [editForm, setEditForm] = useState<EditFormState | null>(null);
  const [transferEditForm, setTransferEditForm] = useState<TransferEditFormState | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteLoadingId, setDeleteLoadingId] = useState<number | null>(null);
  const [deleteTransferGroupId, setDeleteTransferGroupId] = useState<string | null>(null);

  useEffect(() => {
    if (kind !== urlKind) {
      setKind(urlKind);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlKind]);

  useEffect(() => {
    if (viewMode !== urlViewMode) {
      setViewMode(urlViewMode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlViewMode]);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    const currentView = params.get("view");
    const currentKind = params.get("kind");
    if (currentView === viewMode && currentKind === kind) {
      return;
    }

    params.set("view", viewMode);
    params.set("kind", kind);
    const nextUrl = `${pathname}?${params.toString()}`;
    router.replace(nextUrl, { scroll: false });
  }, [kind, pathname, router, searchParams, viewMode]);

  useEffect(() => {
    let isMounted = true;

    async function loadCatalogs() {
      setCatalogsLoading(true);
      setCatalogsError(null);

      try {
        const response = await fetch("/api/bff/transactions/catalogs", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("No fue posible cargar catálogos");
        }

        const data = (await response.json()) as CatalogsResponse;
        if (!isMounted) {
          return;
        }

        setCatalogs(data);

        const firstAccountId = data.accounts[0]?.accountId ?? null;
        const secondAccountId = data.accounts.find((account) => account.accountId !== firstAccountId)?.accountId ?? firstAccountId;

        setAccountId(firstAccountId);
        setSourceAccountId(firstAccountId);
        setDestinationAccountId(secondAccountId);
      } catch {
        if (isMounted) {
          setCatalogsError("No se pudieron cargar cuentas y categorías.");
        }
      } finally {
        if (isMounted) {
          setCatalogsLoading(false);
        }
      }
    }

    void loadCatalogs();
    return () => {
      isMounted = false;
    };
  }, []);

  const categoriesForKind = useMemo(() => {
    if (!catalogs) {
      return [] as Category[];
    }

    return catalogs.categoriesByType[kind] ?? [];
  }, [catalogs, kind]);

  useEffect(() => {
    if (categoriesForKind.length === 0) {
      setCategoryId(null);
      return;
    }

    const hasSelected = categoryId !== null && categoriesForKind.some((category) => category.categoryId === categoryId);
    if (!hasSelected) {
      setCategoryId(categoriesForKind[0].categoryId);
    }
  }, [categoriesForKind, categoryId]);

  const subcategoriesForSelectedCategory = useMemo(() => {
    if (!catalogs || !categoryId) {
      return [] as Subcategory[];
    }

    return catalogs.subcategories.filter((subcategory) => subcategory.categoryId === categoryId);
  }, [catalogs, categoryId]);

  useEffect(() => {
    if (!subcategoryId) {
      return;
    }

    const selectedStillValid = subcategoriesForSelectedCategory.some((subcategory) => subcategory.subcategoryId === subcategoryId);
    if (!selectedStillValid) {
      setSubcategoryId(null);
    }
  }, [subcategoryId, subcategoriesForSelectedCategory]);

  const sourceAccount = useMemo(
    () => catalogs?.accounts.find((account) => account.accountId === sourceAccountId) ?? null,
    [catalogs, sourceAccountId]
  );

  const destinationAccount = useMemo(
    () => catalogs?.accounts.find((account) => account.accountId === destinationAccountId) ?? null,
    [catalogs, destinationAccountId]
  );

  const categoryNameById = useMemo(() => {
    const map = new Map<number, string>();
    catalogs?.categories.forEach((category) => map.set(category.categoryId, category.name));
    return map;
  }, [catalogs]);

  const subcategoryNameById = useMemo(() => {
    const map = new Map<number, string>();
    catalogs?.subcategories.forEach((subcategory) => map.set(subcategory.subcategoryId, subcategory.name));
    return map;
  }, [catalogs]);

  const merchantNameById = useMemo(() => {
    const map = new Map<number, string>();
    catalogs?.merchants.forEach((merchant) => map.set(merchant.merchantId, merchant.name));
    return map;
  }, [catalogs]);

  const accountById = useMemo(() => {
    const map = new Map<number, Account>();
    catalogs?.accounts.forEach((account) => map.set(account.accountId, account));
    return map;
  }, [catalogs]);

  useEffect(() => {
    if (!accountId || !accountById.get(accountId)?.isCredit) {
      setOpeningCreditCharge(false);
    }
  }, [accountById, accountId]);

  const {
    historyLoading,
    historyError,
    setHistoryError,
    historyFilters,
    setHistoryFilters,
    historyAccountOptions,
    historyCategoryOptions,
    filteredRegularHistoryItems,
    filteredTransferGroups,
    loadHistory
  } = useTransactionsHistory({ catalogs, historyMonth });

  const {
    allocationMode,
    setAllocationMode,
    openInstallments,
    openInstallmentsLoading,
    openInstallmentsError,
    selectedInstallmentAmounts,
    selectedAllocations,
    selectedAllocationTotal,
    targetCreditAccountId,
    isCreditPaymentFlow,
    reloadOpenInstallments,
    setAllocationAmount,
    clearAllocations,
    autoDistributeAllocationsByAmount,
    useSelectedTotalAsAmount
  } = useCreditAllocation({
    kind,
    viewMode,
    accountId,
    destinationAccountId,
    accountById,
    amount,
    onAmountChange: setAmount,
    setSubmitError
  });

  useEffect(() => {
    if (viewMode === "history") {
      void loadHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode]);

  const editSubcategories = useMemo(() => {
    if (!editForm || !catalogs) {
      return [] as Subcategory[];
    }

    return catalogs.subcategories.filter((subcategory) => subcategory.categoryId === editForm.categoryId);
  }, [editForm, catalogs]);

  const transferEditSubcategories = useMemo(() => {
    if (!transferEditForm || !catalogs) {
      return [] as Subcategory[];
    }

    return catalogs.subcategories.filter((subcategory) => subcategory.categoryId === transferEditForm.categoryId);
  }, [transferEditForm, catalogs]);

  function swapTransferAccounts() {
    setSourceAccountId(destinationAccountId);
    setDestinationAccountId(sourceAccountId);
  }

  const openEditModal = useCallback((item: TransactionHistoryItem) => {
    setEditError(null);
    setEditForm({
      transactionId: item.transactionId,
      type: item.type,
      accountId: item.accountId,
      categoryId: item.categoryId ?? 0,
      subcategoryId: item.subcategoryId,
      merchantId: item.merchantId,
      amount: item.amount.toString(),
      description: item.description,
      transactionDate: dateTimeLocalInputValue(item.transactionDate),
      tagsText: item.tags.join(", ")
    });
  }, []);

  const openTransferEditModal = useCallback((item: TransferGroupItem) => {
    const defaultTransferCategoryId = catalogs?.categoriesByType.transfer[0]?.categoryId ?? catalogs?.categories[0]?.categoryId ?? 0;

    setEditError(null);
    setTransferEditForm({
      transferGroupId: item.transferGroupId,
      categoryId: item.categoryId ?? defaultTransferCategoryId,
      subcategoryId: item.subcategoryId,
      merchantId: item.merchantId,
      description: item.description,
      transactionDate: dateTimeLocalInputValue(item.transactionDate),
      tagsText: item.tags.join(", ")
    });
  }, [catalogs]);

  const {
    onSubmit,
    onSaveEdit,
    onSaveTransferEdit,
    onDelete,
    onDeleteTransferGroup,
    onConvertChargeToMsi,
    onApplyExistingPayment
  } = useTransactionMutations({
    createState: {
      kind,
      accountId,
      sourceAccountId,
      destinationAccountId,
      categoryId,
      subcategoryId,
      merchantId,
      tagsText,
      amount,
      description,
      transactionDate,
      msiMonths,
      openingCreditCharge
    },
    selectedAllocations,
    selectedAllocationTotal,
    allocationMode,
    isCreditPaymentFlow,
    reloadOpenInstallments,
    loadHistory,
    setSubmitLoading,
    setSubmitError,
    setSuccessMessage,
    setAmount,
    setDescription,
    setSubcategoryId,
    setMerchantId,
    setTagsText,
    setTransactionDate,
    setMsiMonths,
    setOpeningCreditCharge,
    clearAllocations,
    editForm,
    setEditSaving,
    setEditError,
    setEditForm,
    transferEditForm,
    setTransferEditForm,
    setDeleteLoadingId,
    setDeleteTransferGroupId,
    setHistoryError
  });

  const { historyColumns, transferColumns } = useHistoryColumns({
    accountById,
    categoryNameById,
    subcategoryNameById,
    merchantNameById,
    deleteLoadingId,
    deleteTransferGroupId,
    onEdit: openEditModal,
    onDelete,
    onConvertToMsi: onConvertChargeToMsi,
    onApplyExistingPayment,
    onEditTransfer: openTransferEditModal,
    onDeleteTransfer: onDeleteTransferGroup
  });

  return (
    <main className="relative min-h-dvh w-full overflow-x-clip bg-slate-100 px-4 py-8 dark:bg-slate-900 md:px-6 xl:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_0%_0%,rgba(14,165,233,0.18),transparent_30%),radial-gradient(circle_at_100%_0%,rgba(59,130,246,0.14),transparent_32%)] dark:bg-[radial-gradient(circle_at_0%_0%,rgba(14,165,233,0.14),transparent_30%),radial-gradient(circle_at_100%_0%,rgba(37,99,235,0.2),transparent_34%)]" />

      <section className="relative w-full space-y-6">
        <Card className="p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-400">Movimientos</p>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 md:text-3xl">Nueva transacción</h1>
              <p className="text-sm text-slate-600 dark:text-slate-400">Hola {username}, registra ingresos, gastos o transferencias en segundos.</p>
            </div>

            <AppMenu username={username} />
          </div>
        </Card>

        <Card className="space-y-5 p-6">
          <div className="grid grid-cols-2 gap-2 sm:w-[360px]">
            <Button type="button" variant={viewMode === "create" ? "primary" : "secondary"} className="h-9" onClick={() => setViewMode("create")}>
              Nueva
            </Button>
            <Button type="button" variant={viewMode === "history" ? "primary" : "secondary"} className="h-9" onClick={() => setViewMode("history")}>
              Historial
            </Button>
          </div>

          {viewMode === "create" ? (
            <>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {(["income", "expense", "transfer"] as TransactionKind[]).map((item) => (
                  <Button
                    key={item}
                    type="button"
                    variant={kind === item ? "primary" : "secondary"}
                    onClick={() => {
                      setKind(item);
                      setSubmitError(null);
                      setSuccessMessage(null);
                      setOpeningCreditCharge(false);
                    }}
                    className="h-10"
                  >
                    {typeLabel[item]}
                  </Button>
                ))}
              </div>

              {catalogsLoading ? (
                <p className="text-sm text-slate-600 dark:text-slate-400">Cargando catálogos...</p>
              ) : catalogsError ? (
                <Alert variant="danger">{catalogsError}</Alert>
              ) : (
                kind === "income" ? (
                  <IncomeForm
                    accounts={catalogs?.accounts ?? []}
                    merchants={catalogs?.merchants ?? []}
                    tags={catalogs?.tags ?? []}
                    accountId={accountId}
                    onAccountIdChange={setAccountId}
                    categoryId={categoryId}
                    onCategoryIdChange={setCategoryId}
                    categoriesForKind={categoriesForKind}
                    subcategoryId={subcategoryId}
                    onSubcategoryIdChange={setSubcategoryId}
                    subcategoriesForSelectedCategory={subcategoriesForSelectedCategory}
                    merchantId={merchantId}
                    onMerchantIdChange={setMerchantId}
                    tagsText={tagsText}
                    onTagsTextChange={setTagsText}
                    amount={amount}
                    onAmountChange={setAmount}
                    transactionDate={transactionDate}
                    onTransactionDateChange={setTransactionDate}
                    description={description}
                    onDescriptionChange={setDescription}
                    submitError={submitError}
                    successMessage={successMessage}
                    submitLoading={submitLoading}
                    onSubmit={onSubmit}
                    parseSelectedNumber={parseSelectedNumber}
                  />
                ) : kind === "expense" ? (
                  <ExpenseForm
                    accounts={catalogs?.accounts ?? []}
                    merchants={catalogs?.merchants ?? []}
                    tags={catalogs?.tags ?? []}
                    accountId={accountId}
                    onAccountIdChange={setAccountId}
                    categoryId={categoryId}
                    onCategoryIdChange={setCategoryId}
                    categoriesForKind={categoriesForKind}
                    subcategoryId={subcategoryId}
                    onSubcategoryIdChange={setSubcategoryId}
                    subcategoriesForSelectedCategory={subcategoriesForSelectedCategory}
                    merchantId={merchantId}
                    onMerchantIdChange={setMerchantId}
                    tagsText={tagsText}
                    onTagsTextChange={setTagsText}
                    amount={amount}
                    onAmountChange={setAmount}
                    transactionDate={transactionDate}
                    onTransactionDateChange={setTransactionDate}
                    msiMonths={msiMonths}
                    onMsiMonthsChange={setMsiMonths}
                    openingCreditCharge={openingCreditCharge}
                    onOpeningCreditChargeChange={setOpeningCreditCharge}
                    description={description}
                    onDescriptionChange={setDescription}
                    submitError={submitError}
                    successMessage={successMessage}
                    submitLoading={submitLoading}
                    onSubmit={onSubmit}
                    parseSelectedNumber={parseSelectedNumber}
                  />
                ) : (
                  <TransferForm
                    accounts={catalogs?.accounts ?? []}
                    merchants={catalogs?.merchants ?? []}
                    tags={catalogs?.tags ?? []}
                    sourceAccountId={sourceAccountId}
                    onSourceAccountIdChange={setSourceAccountId}
                    destinationAccountId={destinationAccountId}
                    onDestinationAccountIdChange={setDestinationAccountId}
                    sourceAccountName={sourceAccount?.name ?? null}
                    destinationAccountName={destinationAccount?.name ?? null}
                    onSwapAccounts={swapTransferAccounts}
                    categoryId={categoryId}
                    onCategoryIdChange={setCategoryId}
                    categoriesForKind={categoriesForKind}
                    subcategoryId={subcategoryId}
                    onSubcategoryIdChange={setSubcategoryId}
                    subcategoriesForSelectedCategory={subcategoriesForSelectedCategory}
                    merchantId={merchantId}
                    onMerchantIdChange={setMerchantId}
                    tagsText={tagsText}
                    onTagsTextChange={setTagsText}
                    amount={amount}
                    onAmountChange={setAmount}
                    transactionDate={transactionDate}
                    onTransactionDateChange={setTransactionDate}
                    description={description}
                    onDescriptionChange={setDescription}
                    submitError={submitError}
                    successMessage={successMessage}
                    submitLoading={submitLoading}
                    onSubmit={onSubmit}
                    parseSelectedNumber={parseSelectedNumber}
                  />
                )
              )}

              {viewMode === "create" && (kind === "income" || kind === "transfer") && targetCreditAccountId ? (
                <CreditAllocationSelector
                  items={openInstallments}
                  loading={openInstallmentsLoading}
                  error={openInstallmentsError}
                  mode={allocationMode}
                  onModeChange={setAllocationMode}
                  selectedByInstallment={selectedInstallmentAmounts}
                  onSelectedAmountChange={setAllocationAmount}
                  enteredAmount={amount}
                  selectedTotal={selectedAllocationTotal}
                  onAutoDistributeFromAmount={autoDistributeAllocationsByAmount}
                  onUseSelectedAsAmount={useSelectedTotalAsAmount}
                  onClear={clearAllocations}
                />
              ) : null}
            </>
          ) : (
            <HistoryPanel
              historyMonth={historyMonth}
              onHistoryMonthChange={setHistoryMonth}
              onReload={() => void loadHistory(historyMonth)}
              filters={historyFilters}
              onFiltersChange={setHistoryFilters}
              onClearFilters={() =>
                setHistoryFilters({
                  type: "all",
                  accountId: "all",
                  categoryId: "all"
                })
              }
              accountOptions={historyAccountOptions}
              categoryOptions={historyCategoryOptions}
              historyLoading={historyLoading}
              historyError={historyError}
              successMessage={successMessage}
              historyColumns={historyColumns as ColumnDef<unknown>[]}
              transferColumns={transferColumns as ColumnDef<unknown>[]}
              regularHistoryItems={filteredRegularHistoryItems}
              transferGroups={filteredTransferGroups}
            />
          )}
        </Card>

        <EditTransactionModal
          open={Boolean(editForm)}
          form={editForm}
          catalogs={catalogs}
          subcategories={editSubcategories}
          parseSelectedNumber={parseSelectedNumber}
          onChange={setEditForm}
          onClose={() => setEditForm(null)}
          onSubmit={(event) => void onSaveEdit(event)}
          saving={editSaving}
          error={editError}
        />

        <EditTransferModal
          open={Boolean(transferEditForm)}
          form={transferEditForm}
          catalogs={catalogs}
          subcategories={transferEditSubcategories}
          parseSelectedNumber={parseSelectedNumber}
          onChange={setTransferEditForm}
          onClose={() => setTransferEditForm(null)}
          onSubmit={(event) => void onSaveTransferEdit(event)}
          saving={editSaving}
          error={editError}
        />
      </section>
    </main>
  );
}
