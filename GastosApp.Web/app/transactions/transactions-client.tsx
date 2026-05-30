"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AdminShell } from "@/components/navigation/admin-shell";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { IncomeSection } from "./_components/sections/income-section";
import { ExpenseSection } from "./_components/sections/expense-section";
import { TransferSection } from "./_components/sections/transfer-section";
import { HistorySection } from "./_components/sections/history-section";
import { EditTransactionModal } from "./_components/history/edit-transaction-modal";
import { EditTransferModal } from "./_components/history/edit-transfer-modal";
import { ApplyCreditPaymentModal, type ApplyCreditPaymentForm } from "./_components/history/apply-credit-payment-modal";
import { useCreditAllocation } from "./_hooks/use-credit-allocation";
import { useTransactionsHistory } from "./_hooks/use-transactions-history";
import { useHistoryColumns } from "./_hooks/use-history-columns";
import { useTransactionMutations } from "./_hooks/use-transaction-mutations";
import { currentLocalDateTimeInput, currentMonthInput, dateTimeLocalInputValue, parseSelectedNumber } from "./_lib/transactions-utils";
import { type CatalogsResponse, type EditFormState, type ExpenseAllocationFormState, type TransactionHistoryItem, type TransactionKind, type TransferEditFormState, type TransferGroupItem, type ViewMode, typeLabel } from "./_lib/transactions-types";
import type { Account } from "@/lib/contracts/accounts";
import type { Category } from "@/lib/contracts/categories";
import type { Subcategory } from "@/lib/contracts/subcategories";
import { parseApiError } from "@/lib/bff/client-session";

type Props = {
  username: string;
  fixedKind?: TransactionKind;
  fixedViewMode?: ViewMode;
};

export function TransactionsClient({ username, fixedKind, fixedViewMode }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const urlKind = useMemo<TransactionKind>(() => {
    if (fixedKind) {
      return fixedKind;
    }

    const value = searchParams.get("kind");
    if (value === "income" || value === "expense" || value === "transfer") {
      return value;
    }
    return "expense";
  }, [fixedKind, searchParams]);

  const urlViewMode = useMemo<ViewMode>(() => {
    if (fixedViewMode) {
      return fixedViewMode;
    }

    const value = searchParams.get("view");
    if (value === "create" || value === "history") {
      return value;
    }
    return "create";
  }, [fixedViewMode, searchParams]);

  function createAllocationRow(billablePartyId: number | null = null, value = ""): ExpenseAllocationFormState {
    return {
      rowId: crypto.randomUUID(),
      billablePartyId,
      type: "percentage",
      value
    };
  }

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
  const [expenseAllocations, setExpenseAllocations] = useState<ExpenseAllocationFormState[]>([]);

  const defaultSelfBillablePartyId = useMemo(() => {
    if (!catalogs) return null;
    return catalogs.billableParties.find((party) => party.type === "self")?.billablePartyId
      ?? catalogs.billableParties.find((party) => party.displayName.trim().toLowerCase() === "yo")?.billablePartyId
      ?? null;
  }, [catalogs]);

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
  const [applyPaymentForm, setApplyPaymentForm] = useState<ApplyCreditPaymentForm | null>(null);
  const [applyPaymentSaving, setApplyPaymentSaving] = useState(false);
  const [applyPaymentError, setApplyPaymentError] = useState<string | null>(null);

  useEffect(() => {
    if (fixedKind) {
      return;
    }

    if (kind !== urlKind) {
      setKind(urlKind);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixedKind, urlKind]);

  useEffect(() => {
    if (fixedViewMode) {
      return;
    }

    if (viewMode !== urlViewMode) {
      setViewMode(urlViewMode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixedViewMode, urlViewMode]);

  useEffect(() => {
    if (fixedKind || fixedViewMode) {
      return;
    }

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
  }, [fixedKind, fixedViewMode, kind, pathname, router, searchParams, viewMode]);

  const loadCatalogs = useCallback(async () => {
    setCatalogsLoading(true);
    setCatalogsError(null);

    try {
      const response = await fetch("/api/bff/transactions/catalogs", { cache: "no-store" });
      if (!response.ok) {
        throw await parseApiError(response, "No fue posible cargar catálogos");
      }

      const data = (await response.json()) as CatalogsResponse;
      setCatalogs(data);

      const firstAccountId = data.accounts[0]?.accountId ?? null;
      const secondAccountId = data.accounts.find((account) => account.accountId !== firstAccountId)?.accountId ?? firstAccountId;

      setAccountId(firstAccountId);
      setSourceAccountId(firstAccountId);
      setDestinationAccountId(secondAccountId);

      const selfParty = data.billableParties.find((party) => party.type === "self")
        ?? data.billableParties.find((party) => party.displayName.trim().toLowerCase() === "yo")
        ?? null;
      setExpenseAllocations([createAllocationRow(selfParty?.billablePartyId ?? null, "100")]);
    } catch {
      setCatalogsError("No se pudieron cargar cuentas y categorías.");
    } finally {
      setCatalogsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalogs();
  }, [loadCatalogs]);

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
    if (item.type === "opening_credit") {
      return;
    }

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
      ,
      allocations: item.allocations.length > 0
        ? item.allocations.map((allocation) => ({
            rowId: crypto.randomUUID(),
            billablePartyId: allocation.billablePartyId,
            type: allocation.allocationMode,
            value: allocation.allocationValue.toString()
          }))
        : [createAllocationRow(defaultSelfBillablePartyId, "100")]
    });
  }, [defaultSelfBillablePartyId]);

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

  const openApplyPaymentModal = useCallback((sourceTransactionId: number, creditAccountId: number, maxAmount: number) => {
    setApplyPaymentError(null);
    setApplyPaymentForm({
      sourceTransactionId,
      creditAccountId,
      maxAmount,
      mode: "full",
      amount: maxAmount.toFixed(2)
    });
  }, []);

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
      openingCreditCharge,
      expenseAllocations
    },
    selectedAllocations,
    selectedAllocationTotal,
    allocationMode,
    isCreditPaymentFlow,
    reloadOpenInstallments,
    refreshCatalogs: loadCatalogs,
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
    setExpenseAllocations,
    defaultSelfBillablePartyId,
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
    onApplyExistingPayment: openApplyPaymentModal,
    onEditTransfer: openTransferEditModal,
    onDeleteTransfer: onDeleteTransferGroup
  });

  const onConfirmApplyPayment = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!applyPaymentForm) return;

    setApplyPaymentSaving(true);
    setApplyPaymentError(null);
    try {
      if (applyPaymentForm.mode === "full") {
        await onApplyExistingPayment(applyPaymentForm.sourceTransactionId, applyPaymentForm.creditAccountId);
      } else {
        const amount = Number(applyPaymentForm.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
          setApplyPaymentError("Monto parcial inválido.");
          return;
        }
        if (amount > applyPaymentForm.maxAmount) {
          setApplyPaymentError("Monto parcial no puede exceder monto de transacción.");
          return;
        }
        await onApplyExistingPayment(applyPaymentForm.sourceTransactionId, applyPaymentForm.creditAccountId, amount);
      }

      setApplyPaymentForm(null);
    } finally {
      setApplyPaymentSaving(false);
    }
  }, [applyPaymentForm, onApplyExistingPayment]);

  return (
    <AdminShell
      username={username}
      section="Operación"
      title="Transacciones"
      subtitle="Registra ingresos, gastos o transferencias en segundos."
    >
      <section className="space-y-2 md:space-y-2">
        <Card className="space-y-5 p-5 md:p-6">
          {!fixedViewMode ? (
            <div className="grid grid-cols-2 gap-2 sm:w-[360px]">
              <Button type="button" variant={viewMode === "create" ? "primary" : "secondary"} className="h-9" onClick={() => setViewMode("create")}>
                Nueva
              </Button>
              <Button type="button" variant={viewMode === "history" ? "primary" : "secondary"} className="h-9" onClick={() => setViewMode("history")}>
                Historial
              </Button>
            </div>
          ) : null}

          {viewMode === "create" ? (
            <>
               {!fixedKind ? (
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
               ) : null}


              {catalogsLoading ? (
                <p className="text-sm text-slate-600 dark:text-slate-400">Cargando catálogos...</p>
              ) : catalogsError ? (
                <Alert variant="danger">{catalogsError}</Alert>
              ) : kind === "income" ? (
                <IncomeSection
                  formProps={{
                    accounts: catalogs?.accounts ?? [],
                    merchants: catalogs?.merchants ?? [],
                    tags: catalogs?.tags ?? [],
                    accountId,
                    onAccountIdChange: setAccountId,
                    categoryId,
                    onCategoryIdChange: setCategoryId,
                    categoriesForKind,
                    subcategoryId,
                    onSubcategoryIdChange: setSubcategoryId,
                    subcategoriesForSelectedCategory,
                    merchantId,
                    onMerchantIdChange: setMerchantId,
                    tagsText,
                    onTagsTextChange: setTagsText,
                    amount,
                    onAmountChange: setAmount,
                    transactionDate,
                    onTransactionDateChange: setTransactionDate,
                    description,
                    onDescriptionChange: setDescription,
                    submitError,
                    successMessage,
                    submitLoading,
                    onSubmit,
                    parseSelectedNumber
                  }}
                  showCreditAllocation={Boolean(targetCreditAccountId)}
                  creditAllocationProps={{
                    items: openInstallments,
                    loading: openInstallmentsLoading,
                    error: openInstallmentsError,
                    mode: allocationMode,
                    onModeChange: setAllocationMode,
                    selectedByInstallment: selectedInstallmentAmounts,
                    onSelectedAmountChange: setAllocationAmount,
                    enteredAmount: amount,
                    selectedTotal: selectedAllocationTotal,
                    onAutoDistributeFromAmount: autoDistributeAllocationsByAmount,
                    onUseSelectedAsAmount: useSelectedTotalAsAmount,
                    onClear: clearAllocations
                  }}
                />
              ) : kind === "expense" ? (
                <ExpenseSection
                  formProps={{
                    accounts: catalogs?.accounts ?? [],
                    merchants: catalogs?.merchants ?? [],
                    tags: catalogs?.tags ?? [],
                    accountId,
                    onAccountIdChange: setAccountId,
                    categoryId,
                    onCategoryIdChange: setCategoryId,
                    categoriesForKind,
                    subcategoryId,
                    onSubcategoryIdChange: setSubcategoryId,
                    subcategoriesForSelectedCategory,
                    merchantId,
                    onMerchantIdChange: setMerchantId,
                    tagsText,
                    onTagsTextChange: setTagsText,
                    amount,
                    onAmountChange: setAmount,
                    transactionDate,
                    onTransactionDateChange: setTransactionDate,
                    msiMonths,
                    onMsiMonthsChange: setMsiMonths,
                    openingCreditCharge,
                    onOpeningCreditChargeChange: setOpeningCreditCharge,
                    billableParties: catalogs?.billableParties ?? [],
                    expenseAllocations,
                    onExpenseAllocationsChange: setExpenseAllocations,
                    description,
                    onDescriptionChange: setDescription,
                    submitError,
                    successMessage,
                    submitLoading,
                    onSubmit,
                    parseSelectedNumber
                  }}
                />
              ) : (
                <TransferSection
                  formProps={{
                    accounts: catalogs?.accounts ?? [],
                    merchants: catalogs?.merchants ?? [],
                    tags: catalogs?.tags ?? [],
                    sourceAccountId,
                    onSourceAccountIdChange: setSourceAccountId,
                    destinationAccountId,
                    onDestinationAccountIdChange: setDestinationAccountId,
                    sourceAccountName: sourceAccount?.name ?? null,
                    destinationAccountName: destinationAccount?.name ?? null,
                    onSwapAccounts: swapTransferAccounts,
                    categoryId,
                    onCategoryIdChange: setCategoryId,
                    categoriesForKind,
                    subcategoryId,
                    onSubcategoryIdChange: setSubcategoryId,
                    subcategoriesForSelectedCategory,
                    merchantId,
                    onMerchantIdChange: setMerchantId,
                    tagsText,
                    onTagsTextChange: setTagsText,
                    amount,
                    onAmountChange: setAmount,
                    transactionDate,
                    onTransactionDateChange: setTransactionDate,
                    description,
                    onDescriptionChange: setDescription,
                    submitError,
                    successMessage,
                    submitLoading,
                    onSubmit,
                    parseSelectedNumber
                  }}
                  showCreditAllocation={Boolean(targetCreditAccountId)}
                  creditAllocationProps={{
                    items: openInstallments,
                    loading: openInstallmentsLoading,
                    error: openInstallmentsError,
                    mode: allocationMode,
                    onModeChange: setAllocationMode,
                    selectedByInstallment: selectedInstallmentAmounts,
                    onSelectedAmountChange: setAllocationAmount,
                    enteredAmount: amount,
                    selectedTotal: selectedAllocationTotal,
                    onAutoDistributeFromAmount: autoDistributeAllocationsByAmount,
                    onUseSelectedAsAmount: useSelectedTotalAsAmount,
                    onClear: clearAllocations
                  }}
                />
              )}
            </>
          ) : (
            <HistorySection
              panelProps={{
                historyMonth,
                onHistoryMonthChange: setHistoryMonth,
                onReload: () => void loadHistory(historyMonth),
                filters: historyFilters,
                onFiltersChange: setHistoryFilters,
                onClearFilters: () =>
                  setHistoryFilters({
                    type: "all",
                    accountId: "all",
                    categoryId: "all"
                  }),
                accountOptions: historyAccountOptions,
                categoryOptions: historyCategoryOptions,
                historyLoading,
                historyError,
                successMessage,
                historyColumns: historyColumns as ColumnDef<unknown>[],
                transferColumns: transferColumns as ColumnDef<unknown>[],
                regularHistoryItems: filteredRegularHistoryItems,
                transferGroups: filteredTransferGroups
              }}
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

        <ApplyCreditPaymentModal
          open={Boolean(applyPaymentForm)}
          form={applyPaymentForm}
          saving={applyPaymentSaving}
          error={applyPaymentError}
          onChange={setApplyPaymentForm}
          onClose={() => setApplyPaymentForm(null)}
          onSubmit={onConfirmApplyPayment}
        />
      </section>
    </AdminShell>
  );
}
