"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/navigation/admin-shell";
import { Alert } from "@/components/ui/alert";
import { IncomeSection } from "../_components/sections/income-section";
import { useCreditAllocation } from "../_hooks/use-credit-allocation";
import { useTransactionMutations } from "../_hooks/use-transaction-mutations";
import { parseSelectedNumber } from "../_lib/transactions-utils";
import type { RepeatPrefill, TransactionKind } from "../_lib/transactions-types";
import type { Account } from "@/lib/contracts/accounts";
import type { Category } from "@/lib/contracts/categories";
import type { Subcategory } from "@/lib/contracts/subcategories";
import { buildIncomeScreenDefaults } from "../_shared/transactions-screen-shared";
import { useTransactionsCatalogs } from "../_shared/use-transactions-catalogs";
import { TransactionsToastStack, useTransactionsToasts } from "../_shared/transactions-toasts";

type Props = {
  username: string;
  initialRepeat?: RepeatPrefill | null;
};

export function IncomeClient({ username, initialRepeat }: Props) {
  const { catalogs, catalogsLoading, catalogsError, loadCatalogs } = useTransactionsCatalogs();
  const defaults = useMemo(() => buildIncomeScreenDefaults(), []);
  const [accountId, setAccountId] = useState<number | null>(initialRepeat?.accountId ?? null);
  const [categoryId, setCategoryId] = useState<number | null>(initialRepeat?.categoryId ?? null);
  const [subcategoryId, setSubcategoryId] = useState<number | null>(initialRepeat?.subcategoryId ?? null);
  const [merchantId, setMerchantId] = useState<number | null>(initialRepeat?.merchantId ?? null);
  const [tagsText, setTagsText] = useState<string>(initialRepeat?.tagsText ?? defaults.tagsText);
  const [amount, setAmount] = useState<string>(initialRepeat?.amount ?? defaults.amount);
  const [description, setDescription] = useState<string>(initialRepeat?.description ?? defaults.description);
  const [transactionDate, setTransactionDate] = useState<string>(defaults.transactionDate);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const { toasts, dismissToast, success: successToast, error: errorToast } = useTransactionsToasts();

  const kind: TransactionKind = "income";
  const viewMode = "create" as const;
  const sourceAccountId = accountId;
  const destinationAccountId = null;
  const msiMonths = 1;
  const openingCreditCharge = false;

  useEffect(() => {
    if (!catalogs || accountId !== null || categoryId !== null) {
      return;
    }

    setAccountId(catalogs.accounts.find((account) => !account.isCredit)?.accountId ?? null);
    setCategoryId(catalogs.categoriesByType.income[0]?.categoryId ?? null);
  }, [catalogs, accountId, categoryId]);

  const accountById = useMemo(() => {
    const map = new Map<number, Account>();
    catalogs?.accounts.forEach((account) => map.set(account.accountId, account));
    return map;
  }, [catalogs]);

  const categoriesForKind = useMemo<Category[]>(() => catalogs?.categoriesByType.income ?? [], [catalogs]);

  const subcategoriesForSelectedCategory = useMemo<Subcategory[]>(() => {
    if (!catalogs || !categoryId) return [];
    return catalogs.subcategories.filter((subcategory) => subcategory.categoryId === categoryId);
  }, [catalogs, categoryId]);

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

  const {
    onSubmit
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
    setMsiMonths: () => {},
    setOpeningCreditCharge: () => {},

    clearAllocations,
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
    <AdminShell
      username={username}
      section="Operación"
      title="Transacciones · Ingreso"
      subtitle="Registra ingresos de forma individual."
    >
      <TransactionsToastStack toasts={toasts} onDismiss={dismissToast} />

      <section className="space-y-2 md:space-y-2">
        {catalogsLoading ? <Alert>Cargando catálogos...</Alert> : null}
        {catalogsError ? <Alert variant="danger">{catalogsError}</Alert> : null}

        {catalogs ? (
          <IncomeSection
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
              description,
              onDescriptionChange: setDescription,
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
        ) : null}
      </section>
    </AdminShell>
  );
}
