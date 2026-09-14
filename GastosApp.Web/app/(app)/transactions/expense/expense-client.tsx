"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/navigation/page-header";
import { Alert } from "@/components/ui/alert";
import { ExpenseSection } from "../_components/sections/expense-section";
import { useTransactionMutations } from "../_hooks/use-transaction-mutations";
import { parseSelectedNumber, currentLocalDateTimeInput } from "../_lib/transactions-utils";
import type { ExpenseAllocationFormState, RepeatPrefill, TransactionKind } from "../_lib/transactions-types";
import { createAllocationRow, resolveDefaultSelfBillablePartyId } from "../_shared/transactions-screen-shared";
import { useTransactionsCatalogs } from "../_shared/use-transactions-catalogs";
import { TransactionsToastStack, useTransactionsToasts } from "../_shared/transactions-toasts";

type Props = { username: string; initialRepeat?: RepeatPrefill | null };

export function ExpenseClient({ username, initialRepeat }: Props) {
  const { catalogs, catalogsLoading, catalogsError, loadCatalogs } = useTransactionsCatalogs();
  const [accountId, setAccountId] = useState<number | null>(initialRepeat?.accountId ?? null);
  const [categoryId, setCategoryId] = useState<number | null>(initialRepeat?.categoryId ?? null);
  const [subcategoryId, setSubcategoryId] = useState<number | null>(initialRepeat?.subcategoryId ?? null);
  const [merchantId, setMerchantId] = useState<number | null>(initialRepeat?.merchantId ?? null);
  const [tagsText, setTagsText] = useState(initialRepeat?.tagsText ?? "");
  const [amount, setAmount] = useState(initialRepeat?.amount ?? "");
  const [description, setDescription] = useState(initialRepeat?.description ?? "");
  const [transactionDate, setTransactionDate] = useState(currentLocalDateTimeInput());
  const [msiMonths, setMsiMonths] = useState(1);
  const [openingCreditCharge, setOpeningCreditCharge] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const { toasts, dismissToast, success: successToast, error: errorToast } = useTransactionsToasts();

  const defaultSelfBillablePartyId = resolveDefaultSelfBillablePartyId(catalogs);
  const [expenseAllocations, setExpenseAllocations] = useState<ExpenseAllocationFormState[]>(() => {
    if (initialRepeat?.allocations && initialRepeat.allocations.length > 0) {
      return initialRepeat.allocations.map((a) => ({
        ...a,
        rowId: crypto.randomUUID()
      }));
    }
    return [createAllocationRow(defaultSelfBillablePartyId, "100")];
  });

  const kind: TransactionKind = "expense";

  useEffect(() => {
    if (!catalogs || accountId !== null || categoryId !== null) return;
    setAccountId(catalogs.accounts[0]?.accountId ?? null);
    setCategoryId(catalogs.categoriesByType.expense[0]?.categoryId ?? null);
  }, [catalogs, accountId, categoryId]);

  useEffect(() => {
    if (!defaultSelfBillablePartyId) return;

    setExpenseAllocations((current) => {
      if (current.length === 0) {
        return [createAllocationRow(defaultSelfBillablePartyId, "100")];
      }

      const first = current[0];
      if (first.billablePartyId) {
        return current;
      }

      const next = [...current];
      next[0] = { ...first, billablePartyId: defaultSelfBillablePartyId };
      return next;
    });
  }, [defaultSelfBillablePartyId]);

  const categoriesForKind = useMemo(() => catalogs?.categoriesByType.expense ?? [], [catalogs]);
  const subcategoriesForSelectedCategory = useMemo(() => {
    if (!catalogs || !categoryId) return [];
    return catalogs.subcategories.filter((subcategory) => subcategory.categoryId === categoryId);
  }, [catalogs, categoryId]);

  const {
    onSubmit
  } = useTransactionMutations({
    createState: {
      kind,
      accountId,
      sourceAccountId: null,
      destinationAccountId: null,
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
    selectedAllocations: [],
    selectedAllocationTotal: 0,
    allocationMode: "byAmount",
    isCreditPaymentFlow: false,
    reloadOpenInstallments: async () => {},
    refreshCatalogs: loadCatalogs,
    loadHistory: async () => {},
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
    clearAllocations: () => {},
    editForm: null,
    setEditSaving: () => {},
    setEditError: () => {},
    setEditForm: () => {},
    transferEditForm: null,
    setTransferEditForm: () => {},
    setDeleteLoadingId: () => {},
    setDeleteTransferGroupId: () => {},
    setHistoryError: () => {}
  });

  useEffect(() => {
    if (!submitError) return;
    errorToast(submitError);
    setSubmitError(null);
  }, [submitError, errorToast]);

  useEffect(() => {
    if (!successMessage) return;
    successToast(successMessage);
    setSuccessMessage(null);
  }, [successMessage, successToast]);

  return (
    <>
      <PageHeader section="Operación" title="Transacciones · Gasto" subtitle="Registra gastos de forma individual." />
      <TransactionsToastStack toasts={toasts} onDismiss={dismissToast} />

      <section className="space-y-2 md:space-y-2">
        {catalogsLoading ? <Alert>Cargando catálogos...</Alert> : null}
        {catalogsError ? <Alert variant="danger">{catalogsError}</Alert> : null}

        {catalogs ? (
          <ExpenseSection
            formProps={{
              accounts: catalogs.accounts,
              merchants: catalogs.merchants,
              tags: catalogs.tags,
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
              billableParties: catalogs.billableParties,
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
        ) : null}
      </section>
    </>
  );
}
