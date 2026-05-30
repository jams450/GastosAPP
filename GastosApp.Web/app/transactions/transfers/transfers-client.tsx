"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/navigation/admin-shell";
import { Alert } from "@/components/ui/alert";
import { TransferSection } from "../_components/sections/transfer-section";
import { useCreditAllocation } from "../_hooks/use-credit-allocation";
import { useTransactionMutations } from "../_hooks/use-transaction-mutations";
import { parseSelectedNumber, currentLocalDateTimeInput } from "../_lib/transactions-utils";
import type { Account, } from "@/lib/contracts/accounts";
import type { TransactionKind } from "../_lib/transactions-types";
import { useTransactionsCatalogs } from "../_shared/use-transactions-catalogs";

type Props = { username: string };

export function TransfersClient({ username }: Props) {
  const { catalogs, catalogsLoading, catalogsError, loadCatalogs } = useTransactionsCatalogs();
  const [sourceAccountId, setSourceAccountId] = useState<number | null>(null);
  const [destinationAccountId, setDestinationAccountId] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [subcategoryId, setSubcategoryId] = useState<number | null>(null);
  const [merchantId, setMerchantId] = useState<number | null>(null);
  const [tagsText, setTagsText] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [transactionDate, setTransactionDate] = useState(currentLocalDateTimeInput());
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const kind: TransactionKind = "transfer";

  useEffect(() => {
    if (!catalogs || sourceAccountId !== null) return;
    const first = catalogs.accounts[0]?.accountId ?? null;
    const second = catalogs.accounts.find((account) => account.accountId !== first)?.accountId ?? first;
    setSourceAccountId(first);
    setDestinationAccountId(second);
    setCategoryId(catalogs.categoriesByType.transfer[0]?.categoryId ?? null);
  }, [catalogs, sourceAccountId]);

  const categoriesForKind = useMemo(() => catalogs?.categoriesByType.transfer ?? [], [catalogs]);
  const subcategoriesForSelectedCategory = useMemo(() => {
    if (!catalogs || !categoryId) return [];
    return catalogs.subcategories.filter((subcategory) => subcategory.categoryId === categoryId);
  }, [catalogs, categoryId]);

  const accountById = useMemo(() => {
    const map = new Map<number, Account>();
    catalogs?.accounts.forEach((account) => map.set(account.accountId, account));
    return map;
  }, [catalogs]);

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
    viewMode: "create",
    accountId: null,
    destinationAccountId,
    accountById,
    amount,
    onAmountChange: setAmount,
    setSubmitError
  });

  const { onSubmit } = useTransactionMutations({
    createState: {
      kind,
      accountId: null,
      sourceAccountId,
      destinationAccountId,
      categoryId,
      subcategoryId,
      merchantId,
      tagsText,
      amount,
      description,
      transactionDate,
      msiMonths: 1,
      openingCreditCharge: false,
      expenseAllocations: []
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
    setExpenseAllocations: () => {},
    defaultSelfBillablePartyId: null,
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

  const sourceAccount = catalogs?.accounts.find((item) => item.accountId === sourceAccountId) ?? null;
  const destinationAccount = catalogs?.accounts.find((item) => item.accountId === destinationAccountId) ?? null;

  function swapTransferAccounts() {
    setSourceAccountId(destinationAccountId);
    setDestinationAccountId(sourceAccountId);
  }

  return (
    <AdminShell username={username} section="Operación" title="Transacciones · Transferencia" subtitle="Registra transferencias de forma individual.">
      <section className="space-y-2 md:space-y-2">
        {catalogsLoading ? <Alert>Cargando catálogos...</Alert> : null}
        {catalogsError ? <Alert variant="danger">{catalogsError}</Alert> : null}
        {submitError ? <Alert variant="danger">{submitError}</Alert> : null}
        {successMessage ? <Alert>{successMessage}</Alert> : null}

        {catalogs ? (
          <TransferSection
            formProps={{
              accounts: catalogs.accounts,
              merchants: catalogs.merchants,
              tags: catalogs.tags,
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
        ) : null}
      </section>
    </AdminShell>
  );
}
