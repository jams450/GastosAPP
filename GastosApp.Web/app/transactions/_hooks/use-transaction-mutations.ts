import { useCallback } from "react";
import type { FormEvent } from "react";
import type { CreditInstallmentAllocation } from "@/lib/contracts/transactions";
import { currentLocalDateTimeInput, parseTagsInput, toUtcIsoDateTime } from "../_lib/transactions-utils";
import type { EditFormState, TransactionHistoryItem, TransactionKind, TransferEditFormState, TransferGroupItem } from "../_lib/transactions-types";

type CreateState = {
  kind: TransactionKind;
  accountId: number | null;
  sourceAccountId: number | null;
  destinationAccountId: number | null;
  categoryId: number | null;
  subcategoryId: number | null;
  merchantId: number | null;
  tagsText: string;
  amount: string;
  description: string;
  transactionDate: string;
  msiMonths: number;
};

type Params = {
  createState: CreateState;
  selectedAllocations: CreditInstallmentAllocation[];
  selectedAllocationTotal: number;
  allocationMode: "byAmount" | "bySelection";
  isCreditPaymentFlow: boolean;
  reloadOpenInstallments: () => Promise<void>;
  loadHistory: () => Promise<void>;
  setSubmitLoading: (v: boolean) => void;
  setSubmitError: (v: string | null) => void;
  setSuccessMessage: (v: string | null) => void;
  setAmount: (v: string) => void;
  setDescription: (v: string) => void;
  setSubcategoryId: (v: number | null) => void;
  setMerchantId: (v: number | null) => void;
  setTagsText: (v: string) => void;
  setTransactionDate: (v: string) => void;
  setMsiMonths: (v: number) => void;
  clearAllocations: () => void;
  editForm: EditFormState | null;
  setEditSaving: (v: boolean) => void;
  setEditError: (v: string | null) => void;
  setEditForm: (v: EditFormState | null) => void;
  transferEditForm: TransferEditFormState | null;
  setTransferEditForm: (v: TransferEditFormState | null) => void;
  setDeleteLoadingId: (v: number | null) => void;
  setDeleteTransferGroupId: (v: string | null) => void;
  setHistoryError: (v: string | null) => void;
};

export function useTransactionMutations(params: Params) {
  const {
    createState,
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
  } = params;

  const onSubmit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);
    setSuccessMessage(null);

    const { kind, accountId, sourceAccountId, destinationAccountId, categoryId, subcategoryId, merchantId, tagsText, description, transactionDate, msiMonths } = createState;
    let amountNumber = Number(createState.amount);

    const transactionDateUtc = toUtcIsoDateTime(transactionDate);
    if (!transactionDateUtc) return setSubmitError("Selecciona una fecha y hora válidas.");
    if (!categoryId) return setSubmitError("Selecciona una categoría.");
    if (!description.trim()) return setSubmitError("La descripción es obligatoria.");

    setSubmitLoading(true);
    try {
      let endpoint = "/api/bff/transactions/expense";
      let payload: Record<string, unknown>;
      const parsedTags = parseTagsInput(tagsText);
      const analyticsPayload = {
        subcategoryId: subcategoryId ?? undefined,
        merchantId: merchantId ?? undefined,
        tags: parsedTags.length > 0 ? parsedTags : undefined
      };

      let creditAllocations: CreditInstallmentAllocation[] | undefined;
      if (isCreditPaymentFlow) {
        if (selectedAllocations.length === 0) return setSubmitError("Selecciona al menos una mensualidad y monto a pagar.");
        const selectedTotal = Number(selectedAllocationTotal.toFixed(2));
        if (allocationMode === "bySelection") {
          amountNumber = selectedTotal;
          setAmount(selectedTotal.toFixed(2));
        } else {
          if (!Number.isFinite(amountNumber) || amountNumber <= 0) return setSubmitError("Ingresa un monto mayor a 0.");
          if (Number(Math.abs(selectedTotal - amountNumber).toFixed(2)) > 0) return setSubmitError("Suma seleccionada debe coincidir con monto capturado.");
        }
        creditAllocations = selectedAllocations;
      }

      if (!Number.isFinite(amountNumber) || amountNumber <= 0) return setSubmitError("Ingresa un monto mayor a 0.");

      if (kind === "income" || kind === "expense") {
        if (!accountId) return setSubmitError("Selecciona una cuenta.");
        endpoint = kind === "income" ? "/api/bff/transactions/income" : "/api/bff/transactions/expense";
        payload = {
          accountId,
          categoryId,
          ...analyticsPayload,
          amount: amountNumber,
          description: description.trim(),
          transactionDate: transactionDateUtc,
          msiMonths: kind === "expense" && msiMonths > 1 ? msiMonths : undefined,
          creditAllocations
        };
      } else {
        if (!sourceAccountId || !destinationAccountId) return setSubmitError("Selecciona cuenta origen y destino.");
        if (sourceAccountId === destinationAccountId) return setSubmitError("La cuenta origen y destino deben ser diferentes.");
        endpoint = "/api/bff/transactions/transfer";
        payload = { sourceAccountId, destinationAccountId, categoryId, ...analyticsPayload, amount: amountNumber, description: description.trim(), transactionDate: transactionDateUtc, creditAllocations };
      }

      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null;
        return setSubmitError(data?.message ?? "No se pudo registrar la transacción.");
      }

      setSuccessMessage("Transacción registrada correctamente.");
      setAmount("");
      setDescription("");
      setSubcategoryId(null);
      setMerchantId(null);
      setTagsText("");
      setTransactionDate(currentLocalDateTimeInput());
      setMsiMonths(1);
      clearAllocations();
      if (isCreditPaymentFlow) {
        await reloadOpenInstallments();
      }
    } catch {
      setSubmitError("No se pudo conectar con el servidor.");
    } finally {
      setSubmitLoading(false);
    }
  }, [allocationMode, clearAllocations, createState, isCreditPaymentFlow, reloadOpenInstallments, selectedAllocationTotal, selectedAllocations, setAmount, setDescription, setMerchantId, setMsiMonths, setSubcategoryId, setSubmitError, setSubmitLoading, setSuccessMessage, setTagsText, setTransactionDate]);

  const onSaveEdit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editForm) return;
    const amountNumber = Number(editForm.amount);
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) return setEditError("Ingresa un monto mayor a 0.");
    if (!editForm.categoryId) return setEditError("Selecciona una categoría.");
    const transactionDate = toUtcIsoDateTime(editForm.transactionDate);
    if (!transactionDate) return setEditError("Selecciona una fecha y hora válidas.");

    setEditSaving(true); setEditError(null);
    try {
      const response = await fetch(`/api/bff/transactions/${editForm.transactionId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: editForm.accountId, categoryId: editForm.categoryId, subcategoryId: editForm.subcategoryId ?? undefined, merchantId: editForm.merchantId ?? undefined, amount: amountNumber, description: editForm.description.trim(), transactionDate, tags: parseTagsInput(editForm.tagsText) })
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(data?.message ?? "No se pudo actualizar la transacción");
      }
      setSuccessMessage("Transacción actualizada correctamente.");
      setEditForm(null);
      await loadHistory();
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "No se pudo actualizar la transacción");
    } finally {
      setEditSaving(false);
    }
  }, [editForm, loadHistory, setEditError, setEditForm, setEditSaving, setSuccessMessage]);

  const onSaveTransferEdit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!transferEditForm) return;
    if (!transferEditForm.categoryId) return setEditError("Selecciona una categoría.");
    const transactionDate = toUtcIsoDateTime(transferEditForm.transactionDate);
    if (!transactionDate) return setEditError("Selecciona una fecha y hora válidas.");
    setEditSaving(true); setEditError(null);
    try {
      const response = await fetch(`/api/bff/transactions/transfers/${transferEditForm.transferGroupId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId: transferEditForm.categoryId, subcategoryId: transferEditForm.subcategoryId ?? undefined, merchantId: transferEditForm.merchantId ?? undefined, description: transferEditForm.description.trim(), transactionDate, tags: parseTagsInput(transferEditForm.tagsText) })
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(data?.message ?? "No se pudo actualizar la transferencia");
      }
      setSuccessMessage("Transferencia actualizada correctamente.");
      setTransferEditForm(null);
      await loadHistory();
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "No se pudo actualizar la transferencia");
    } finally {
      setEditSaving(false);
    }
  }, [loadHistory, setEditError, setEditSaving, setSuccessMessage, setTransferEditForm, transferEditForm]);

  const onDelete = useCallback(async (item: TransactionHistoryItem) => {
    if (!window.confirm("¿Seguro que quieres eliminar esta transacción?")) return;
    setDeleteLoadingId(item.transactionId);
    setHistoryError(null);
    try {
      const response = await fetch(`/api/bff/transactions/${item.transactionId}`, { method: "DELETE" });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(data?.message ?? "No se pudo eliminar la transacción");
      }
      setSuccessMessage("Transacción eliminada correctamente.");
      await loadHistory();
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "No se pudo eliminar la transacción");
    } finally {
      setDeleteLoadingId(null);
    }
  }, [loadHistory, setDeleteLoadingId, setHistoryError, setSuccessMessage]);

  const onDeleteTransferGroup = useCallback(async (item: TransferGroupItem) => {
    if (!window.confirm("¿Seguro que quieres eliminar esta transferencia completa?")) return;
    setDeleteTransferGroupId(item.transferGroupId);
    setHistoryError(null);
    try {
      const response = await fetch(`/api/bff/transactions/transfers/${item.transferGroupId}`, { method: "DELETE" });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(data?.message ?? "No se pudo eliminar la transferencia");
      }
      setSuccessMessage("Transferencia eliminada correctamente.");
      await loadHistory();
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "No se pudo eliminar la transferencia");
    } finally {
      setDeleteTransferGroupId(null);
    }
  }, [loadHistory, setDeleteTransferGroupId, setHistoryError, setSuccessMessage]);

  const onConvertChargeToMsi = useCallback(async (item: TransactionHistoryItem) => {
    const monthsRaw = window.prompt("¿A cuántos meses MSI deseas convertir este cargo? (2-60)", "3");
    if (!monthsRaw) return;
    const months = Number(monthsRaw);
    if (!Number.isInteger(months) || months < 2 || months > 60) return setHistoryError("Meses MSI inválido. Debe ser entero entre 2 y 60.");
    setHistoryError(null);
    try {
      const response = await fetch("/api/bff/transactions/credit/convert-charge-msi", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceTransactionId: item.transactionId, months }) });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(data?.message ?? "No se pudo convertir cargo a MSI");
      }
      setSuccessMessage("Cargo convertido a MSI correctamente.");
      await loadHistory();
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "No se pudo convertir cargo a MSI");
    }
  }, [loadHistory, setHistoryError, setSuccessMessage]);

  const onApplyExistingPayment = useCallback(async (sourceTransactionId: number, creditAccountId: number, maxAmount: number) => {
    const modeRaw = window.prompt("Aplicar pago: escribe 'full' para completo o 'partial' para parcial", "full");
    if (!modeRaw) return;
    const mode = modeRaw.trim().toLowerCase();
    if (mode !== "full" && mode !== "partial") {
      setHistoryError("Modo inválido. Usa full o partial.");
      return;
    }

    let amount: number | undefined;
    if (mode === "partial") {
      const amountRaw = window.prompt(`Monto a aplicar (máximo ${maxAmount.toFixed(2)})`, maxAmount.toFixed(2));
      if (!amountRaw) return;
      amount = Number(amountRaw);
      if (!Number.isFinite(amount) || amount <= 0) {
        setHistoryError("Monto parcial inválido.");
        return;
      }
      if (amount > maxAmount) {
        setHistoryError("Monto parcial no puede exceder monto de transacción.");
        return;
      }
    }

    setHistoryError(null);
    try {
      const response = await fetch("/api/bff/transactions/credit/apply-existing-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceTransactionId, creditAccountId, amount })
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(data?.message ?? "No se pudo aplicar pago existente");
      }

      setSuccessMessage(mode === "full" ? "Pago completo aplicado a mensualidades." : "Pago parcial aplicado a mensualidades.");
      await loadHistory();
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "No se pudo aplicar pago existente");
    }
  }, [loadHistory, setHistoryError, setSuccessMessage]);

  return { onSubmit, onSaveEdit, onSaveTransferEdit, onDelete, onDeleteTransferGroup, onConvertChargeToMsi, onApplyExistingPayment };
}
