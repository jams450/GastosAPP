import { useCallback, useEffect, useMemo, useState } from "react";
import type { Account } from "@/lib/contracts/accounts";
import type { CreditInstallmentAllocation, CreditOpenInstallmentItem } from "@/lib/contracts/transactions";
import type { TransactionKind, ViewMode } from "../_lib/transactions-types";

export type AllocationMode = "byAmount" | "bySelection";

type Params = {
  kind: TransactionKind;
  viewMode: ViewMode;
  accountId: number | null;
  destinationAccountId: number | null;
  accountById: Map<number, Account>;
  amount: string;
  onAmountChange: (value: string) => void;
  setSubmitError: (value: string | null) => void;
};

export function useCreditAllocation({
  kind,
  viewMode,
  accountId,
  destinationAccountId,
  accountById,
  amount,
  onAmountChange,
  setSubmitError
}: Params) {
  const [allocationMode, setAllocationMode] = useState<AllocationMode>("byAmount");
  const [openInstallments, setOpenInstallments] = useState<CreditOpenInstallmentItem[]>([]);
  const [openInstallmentsLoading, setOpenInstallmentsLoading] = useState(false);
  const [openInstallmentsError, setOpenInstallmentsError] = useState<string | null>(null);
  const [selectedInstallmentAmounts, setSelectedInstallmentAmounts] = useState<Record<number, string>>({});

  const targetCreditAccountId = useMemo(() => {
    if (kind === "income") {
      const account = accountId ? accountById.get(accountId) : null;
      return account?.isCredit ? account.accountId : null;
    }

    if (kind === "transfer") {
      const account = destinationAccountId ? accountById.get(destinationAccountId) : null;
      return account?.isCredit ? account.accountId : null;
    }

    return null;
  }, [kind, accountId, destinationAccountId, accountById]);

  const reloadOpenInstallments = useCallback(async () => {
    if (viewMode !== "create" || !targetCreditAccountId || (kind !== "income" && kind !== "transfer")) {
      setOpenInstallments([]);
      setSelectedInstallmentAmounts({});
      setOpenInstallmentsError(null);
      return;
    }

    setOpenInstallmentsLoading(true);
    setOpenInstallmentsError(null);
    try {
      const response = await fetch(`/api/bff/transactions/credit/open-installments/${targetCreditAccountId}`, {
        cache: "no-store"
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(data?.message ?? "No se pudieron cargar mensualidades pendientes.");
      }

      const items = (await response.json()) as CreditOpenInstallmentItem[];
      const normalized = items
        .filter((item) => item.remainingAmount > 0)
        .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

      setOpenInstallments(normalized);
      setSelectedInstallmentAmounts({});
    } catch (error) {
      setOpenInstallmentsError(error instanceof Error ? error.message : "No se pudieron cargar mensualidades pendientes.");
    } finally {
      setOpenInstallmentsLoading(false);
    }
  }, [kind, targetCreditAccountId, viewMode]);

  useEffect(() => {
    let isMounted = true;

    void reloadOpenInstallments().catch(() => {
      if (!isMounted) return;
    });

    return () => {
      isMounted = false;
    };
  }, [reloadOpenInstallments]);

  const selectedAllocations = useMemo<CreditInstallmentAllocation[]>(() => {
    return openInstallments
      .map((item) => {
        const raw = selectedInstallmentAmounts[item.installmentId] ?? "";
        const parsed = Number(raw);
        if (!Number.isFinite(parsed) || parsed <= 0) return null;
        const normalized = Number(Math.min(parsed, item.remainingAmount).toFixed(2));
        if (normalized <= 0) return null;
        return { installmentId: item.installmentId, amount: normalized };
      })
      .filter((item): item is CreditInstallmentAllocation => Boolean(item));
  }, [openInstallments, selectedInstallmentAmounts]);

  const selectedAllocationTotal = useMemo(
    () => Number(selectedAllocations.reduce((sum, row) => sum + row.amount, 0).toFixed(2)),
    [selectedAllocations]
  );

  function setAllocationAmount(installmentId: number, value: string) {
    setSelectedInstallmentAmounts((current) => ({ ...current, [installmentId]: value }));
  }

  function clearAllocations() {
    setSelectedInstallmentAmounts({});
  }

  function autoDistributeAllocationsByAmount() {
    const total = Number(amount);
    if (!Number.isFinite(total) || total <= 0) {
      setSubmitError("Ingresa primero monto válido para auto distribuir.");
      return;
    }

    setSubmitError(null);
    let remaining = Number(total.toFixed(2));
    const next: Record<number, string> = {};

    for (const item of openInstallments) {
      if (remaining <= 0) break;
      const allocation = Math.min(item.remainingAmount, remaining);
      if (allocation > 0) {
        next[item.installmentId] = allocation.toFixed(2);
        remaining = Number((remaining - allocation).toFixed(2));
      }
    }

    setSelectedInstallmentAmounts(next);
    if (remaining > 0) {
      setSubmitError("Monto excede saldo pendiente. Ajusta monto o mensualidades.");
    }
  }

  function useSelectedTotalAsAmount() {
    if (selectedAllocationTotal <= 0) {
      setSubmitError("Selecciona al menos una mensualidad con monto.");
      return;
    }

    setSubmitError(null);
    onAmountChange(selectedAllocationTotal.toFixed(2));
  }

  const isCreditPaymentFlow = kind === "income"
    ? Boolean(accountId && accountById.get(accountId)?.isCredit)
    : kind === "transfer"
      ? Boolean(destinationAccountId && accountById.get(destinationAccountId)?.isCredit)
      : false;

  return {
    allocationMode,
    setAllocationMode,
    openInstallments,
    openInstallmentsLoading,
    openInstallmentsError,
    selectedInstallmentAmounts,
    setSelectedInstallmentAmounts,
    selectedAllocations,
    selectedAllocationTotal,
    targetCreditAccountId,
    isCreditPaymentFlow,
    reloadOpenInstallments,
    setAllocationAmount,
    clearAllocations,
    autoDistributeAllocationsByAmount,
    useSelectedTotalAsAmount
  };
}
