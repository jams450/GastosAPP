"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { AdminShell } from "@/components/navigation/admin-shell";
import { Alert } from "@/components/ui/alert";
import type { Account } from "@/lib/contracts/accounts";
import { HistorySection } from "../_components/sections/history-section";
import { EditTransactionModal } from "../_components/history/edit-transaction-modal";
import { EditTransferModal } from "../_components/history/edit-transfer-modal";
import { ApplyCreditPaymentModal, type ApplyCreditPaymentForm } from "../_components/history/apply-credit-payment-modal";
import { useHistoryColumns } from "../_hooks/use-history-columns";
import { useTransactionMutations } from "../_hooks/use-transaction-mutations";
import { useTransactionsHistory } from "../_hooks/use-transactions-history";
import { currentLocalDateTimeInput, currentMonthInput, dateTimeLocalInputValue, parseSelectedNumber } from "../_lib/transactions-utils";
import type { EditFormState, ExpenseAllocationFormState, TransactionHistoryItem, TransferEditFormState, TransferGroupItem } from "../_lib/transactions-types";
import { createAllocationRow, resolveDefaultSelfBillablePartyId } from "../_shared/transactions-screen-shared";
import { useTransactionsCatalogs } from "../_shared/use-transactions-catalogs";

type Props = { username: string };

export function HistoryClient({ username }: Props) {
  const { catalogs, catalogsLoading, catalogsError } = useTransactionsCatalogs();

  const [historyMonth, setHistoryMonth] = useState<string>(currentMonthInput());
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [, setSubmitLoading] = useState(false);
  const [, setSubmitError] = useState<string | null>(null);

  const [editForm, setEditForm] = useState<EditFormState | null>(null);
  const [transferEditForm, setTransferEditForm] = useState<TransferEditFormState | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteLoadingId, setDeleteLoadingId] = useState<number | null>(null);
  const [deleteTransferGroupId, setDeleteTransferGroupId] = useState<string | null>(null);
  const [applyPaymentForm, setApplyPaymentForm] = useState<ApplyCreditPaymentForm | null>(null);
  const [applyPaymentSaving, setApplyPaymentSaving] = useState(false);
  const [applyPaymentError, setApplyPaymentError] = useState<string | null>(null);

  const [dummyAmount, setDummyAmount] = useState("");
  const [dummyDescription, setDummyDescription] = useState("");
  const [dummySubcategoryId, setDummySubcategoryId] = useState<number | null>(null);
  const [dummyMerchantId, setDummyMerchantId] = useState<number | null>(null);
  const [dummyTagsText, setDummyTagsText] = useState("");
  const [dummyTransactionDate, setDummyTransactionDate] = useState(currentLocalDateTimeInput());
  const [dummyMsiMonths, setDummyMsiMonths] = useState(1);
  const [dummyOpeningCreditCharge, setDummyOpeningCreditCharge] = useState(false);

  const defaultSelfBillablePartyId = resolveDefaultSelfBillablePartyId(catalogs);
  const [dummyExpenseAllocations, setDummyExpenseAllocations] = useState<ExpenseAllocationFormState[]>([
    createAllocationRow(defaultSelfBillablePartyId, "100")
  ]);

  const accountById = useMemo(() => {
    const map = new Map<number, Account>();
    catalogs?.accounts.forEach((account) => map.set(account.accountId, account));
    return map;
  }, [catalogs]);

  const categoryNameById = useMemo(() => {
    const map = new Map<number, string>();
    catalogs?.categories.forEach((item) => map.set(item.categoryId, item.name));
    return map;
  }, [catalogs]);

  const subcategoryNameById = useMemo(() => {
    const map = new Map<number, string>();
    catalogs?.subcategories.forEach((item) => map.set(item.subcategoryId, item.name));
    return map;
  }, [catalogs]);

  const merchantNameById = useMemo(() => {
    const map = new Map<number, string>();
    catalogs?.merchants.forEach((item) => map.set(item.merchantId, item.name));
    return map;
  }, [catalogs]);

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

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const editSubcategories = useMemo(() => {
    if (!editForm || !catalogs) return [];
    return catalogs.subcategories.filter((subcategory) => subcategory.categoryId === editForm.categoryId);
  }, [editForm, catalogs]);

  const transferEditSubcategories = useMemo(() => {
    if (!transferEditForm || !catalogs) return [];
    return catalogs.subcategories.filter((subcategory) => subcategory.categoryId === transferEditForm.categoryId);
  }, [transferEditForm, catalogs]);

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
      tagsText: item.tags.join(", "),
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
    onSaveEdit,
    onSaveTransferEdit,
    onDelete,
    onDeleteTransferGroup,
    onConvertChargeToMsi,
    onApplyExistingPayment
  } = useTransactionMutations({
    createState: {
      kind: "expense",
      accountId: null,
      sourceAccountId: null,
      destinationAccountId: null,
      categoryId: null,
      subcategoryId: dummySubcategoryId,
      merchantId: dummyMerchantId,
      tagsText: dummyTagsText,
      amount: dummyAmount,
      description: dummyDescription,
      transactionDate: dummyTransactionDate,
      msiMonths: dummyMsiMonths,
      openingCreditCharge: dummyOpeningCreditCharge,
      expenseAllocations: dummyExpenseAllocations
    },
    selectedAllocations: [],
    selectedAllocationTotal: 0,
    allocationMode: "byAmount",
    isCreditPaymentFlow: false,
    reloadOpenInstallments: async () => {},
    refreshCatalogs: async () => {},
    loadHistory,
    setSubmitLoading,
    setSubmitError,
    setSuccessMessage,
    setAmount: setDummyAmount,
    setDescription: setDummyDescription,
    setSubcategoryId: setDummySubcategoryId,
    setMerchantId: setDummyMerchantId,
    setTagsText: setDummyTagsText,
    setTransactionDate: setDummyTransactionDate,
    setMsiMonths: setDummyMsiMonths,
    setOpeningCreditCharge: setDummyOpeningCreditCharge,
    setExpenseAllocations: setDummyExpenseAllocations,
    defaultSelfBillablePartyId,
    clearAllocations: () => {},
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
    <AdminShell username={username} section="Operación" title="Transacciones · Historial" subtitle="Consulta historial y aplica operaciones de crédito.">
      <section className="space-y-2 md:space-y-2">
        {catalogsLoading ? <Alert>Cargando catálogos...</Alert> : null}
        {catalogsError ? <Alert variant="danger">{catalogsError}</Alert> : null}

        <HistorySection
          panelProps={{
            historyMonth,
            onHistoryMonthChange: setHistoryMonth,
            onReload: () => void loadHistory(historyMonth),
            filters: historyFilters,
            onFiltersChange: setHistoryFilters,
            onClearFilters: () => setHistoryFilters({ type: "all", accountId: "all", categoryId: "all" }),
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
