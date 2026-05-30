"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/navigation/admin-shell";
import { Alert } from "@/components/ui/alert";
import { IncomeSection } from "../_components/sections/income-section";
import { useCreditAllocation } from "../_hooks/use-credit-allocation";
import { useTransactionMutations } from "../_hooks/use-transaction-mutations";
import { parseSelectedNumber } from "../_lib/transactions-utils";
import type { ExpenseAllocationFormState, TransactionKind } from "../_lib/transactions-types";
import type { Account } from "@/lib/contracts/accounts";
import type { Category } from "@/lib/contracts/categories";
import type { Subcategory } from "@/lib/contracts/subcategories";
import { createAllocationRow, resolveDefaultSelfBillablePartyId, buildIncomeScreenDefaults } from "../_shared/transactions-screen-shared";
import { useTransactionsCatalogs } from "../_shared/use-transactions-catalogs";

type Props = {
  username: string;
};

export function IncomeClient({ username }: Props) {
  const { catalogs, catalogsLoading, catalogsError, loadCatalogs } = useTransactionsCatalogs();
  const defaults = useMemo(() => buildIncomeScreenDefaults(), []);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [subcategoryId, setSubcategoryId] = useState<number | null>(null);
  const [merchantId, setMerchantId] = useState<number | null>(null);
  const [tagsText, setTagsText] = useState<string>(defaults.tagsText);
  const [amount, setAmount] = useState<string>(defaults.amount);
  const [description, setDescription] = useState<string>(defaults.description);
  const [transactionDate, setTransactionDate] = useState<string>(defaults.transactionDate);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const kind: TransactionKind = "income";
  const viewMode = "create" as const;
  const sourceAccountId = accountId;
  const destinationAccountId = null;
  const msiMonths = 1;
  const openingCreditCharge = false;
  const defaultSelfBillablePartyId = resolveDefaultSelfBillablePartyId(catalogs);
  const [expenseAllocations, setExpenseAllocations] = useState<ExpenseAllocationFormState[]>([
    createAllocationRow(defaultSelfBillablePartyId, "100")
  ]);

  useEffect(() => {
    if (!catalogs || accountId !== null || categoryId !== null) {
      return;
    }

    setAccountId(catalogs.accounts[0]?.accountId ?? null);
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
      openingCreditCharge,
      expenseAllocations
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
    setExpenseAllocations,
    defaultSelfBillablePartyId,
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

  return (
    <AdminShell
      username={username}
      section="Operación"
      title="Transacciones · Ingreso"
      subtitle="Registra ingresos de forma individual."
    >
      <section className="space-y-2 md:space-y-2">
        {catalogsLoading ? <Alert>Cargando catálogos...</Alert> : null}
        {catalogsError ? <Alert variant="danger">{catalogsError}</Alert> : null}
        {submitError ? <Alert variant="danger">{submitError}</Alert> : null}
        {successMessage ? <Alert>{successMessage}</Alert> : null}

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
        ) : null}
      </section>
    </AdminShell>
  );
}
