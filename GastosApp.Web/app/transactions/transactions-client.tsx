"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { AppMenu } from "@/components/navigation/app-menu";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataGrid } from "@/components/data-grid/data-grid";
import { Input } from "@/components/ui/input";
import type { Account } from "@/lib/contracts/accounts";
import type { Category, CategoryType } from "@/lib/contracts/categories";
import type { Merchant } from "@/lib/contracts/merchants";
import type { Subcategory } from "@/lib/contracts/subcategories";
import type { Tag } from "@/lib/contracts/tags";
import { formatCurrency } from "@/lib/format/currency";

type TransactionKind = CategoryType;

type CatalogsResponse = {
  accounts: Account[];
  categories: Category[];
  subcategories: Subcategory[];
  merchants: Merchant[];
  tags: Tag[];
  categoriesByType: {
    income: Category[];
    expense: Category[];
    transfer: Category[];
  };
};

type TransactionHistoryItem = {
  transactionId: number;
  accountId: number;
  accountName: string;
  categoryId: number | null;
  subcategoryId: number | null;
  merchantId: number | null;
  type: TransactionKind;
  transferGroupId: string | null;
  amount: number;
  description: string;
  transactionDate: string;
  tags: string[];
};

type TransactionListResponse = {
  month: string;
  transactions: TransactionHistoryItem[];
};

type ViewMode = "create" | "history";

type EditFormState = {
  transactionId: number;
  type: TransactionKind;
  accountId: number;
  categoryId: number;
  subcategoryId: number | null;
  merchantId: number | null;
  amount: string;
  description: string;
  transactionDate: string;
  tagsText: string;
};

type TransferGroupItem = {
  transferGroupId: string;
  transactionDate: string;
  amount: number;
  accountFromName: string;
  accountToName: string;
  categoryId: number | null;
  subcategoryId: number | null;
  merchantId: number | null;
  description: string;
  tags: string[];
};

type TransferEditFormState = {
  transferGroupId: string;
  categoryId: number;
  subcategoryId: number | null;
  merchantId: number | null;
  description: string;
  transactionDate: string;
  tagsText: string;
};

type Props = {
  username: string;
};

const typeLabel: Record<TransactionKind, string> = {
  income: "Ingreso",
  expense: "Gasto",
  transfer: "Transferencia"
};

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseTagsInput(input: string): string[] {
  return [...new Set(input.split(",").map((tag) => tag.trim()).filter(Boolean))].slice(0, 20);
}

function currentMonthInput(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function dateInputValue(value: string): string {
  return value.slice(0, 10);
}

export function TransactionsClient({ username }: Props) {
  const [kind, setKind] = useState<TransactionKind>("expense");
  const [viewMode, setViewMode] = useState<ViewMode>("create");
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
  const [transactionDate, setTransactionDate] = useState<string>(todayIsoDate());

  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [historyMonth, setHistoryMonth] = useState<string>(currentMonthInput());
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyItems, setHistoryItems] = useState<TransactionHistoryItem[]>([]);

  const [editForm, setEditForm] = useState<EditFormState | null>(null);
  const [transferEditForm, setTransferEditForm] = useState<TransferEditFormState | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteLoadingId, setDeleteLoadingId] = useState<number | null>(null);
  const [deleteTransferGroupId, setDeleteTransferGroupId] = useState<string | null>(null);

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

  const regularHistoryItems = useMemo(
    () => historyItems.filter((item) => item.type !== "transfer"),
    [historyItems]
  );

  const transferGroups = useMemo<TransferGroupItem[]>(() => {
    const grouped = new Map<string, TransactionHistoryItem[]>();

    historyItems
      .filter((item) => item.type === "transfer" && item.transferGroupId)
      .forEach((item) => {
        const key = item.transferGroupId as string;
        const current = grouped.get(key) ?? [];
        current.push(item);
        grouped.set(key, current);
      });

    return Array.from(grouped.entries())
      .map(([transferGroupId, items]) => {
        const ordered = [...items].sort((a, b) => a.transactionId - b.transactionId);
        const first = ordered[0];
        const second = ordered[1];

        const mergedTags = [...new Set(ordered.flatMap((item) => item.tags))];

        return {
          transferGroupId,
          transactionDate: first.transactionDate,
          amount: first.amount,
          accountFromName: first.accountName,
          accountToName: second?.accountName ?? "—",
          categoryId: first.categoryId,
          subcategoryId: first.subcategoryId,
          merchantId: first.merchantId,
          description: first.description,
          tags: mergedTags
        };
      })
      .sort((a, b) => b.transactionDate.localeCompare(a.transactionDate));
  }, [historyItems]);

  const loadHistory = useCallback(async (month = historyMonth) => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const response = await fetch(`/api/bff/transactions/list?month=${encodeURIComponent(month)}`, { cache: "no-store" });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(data?.message ?? "No se pudo cargar el historial");
      }

      const data = (await response.json()) as TransactionListResponse;
      setHistoryItems(data.transactions);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "No se pudo cargar el historial");
    } finally {
      setHistoryLoading(false);
    }
  }, [historyMonth]);

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

  function parseSelectedNumber(value: string): number | null {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  function swapTransferAccounts() {
    setSourceAccountId(destinationAccountId);
    setDestinationAccountId(sourceAccountId);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);
    setSuccessMessage(null);

    const amountNumber = Number(amount);
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      setSubmitError("Ingresa un monto mayor a 0.");
      return;
    }

    if (!transactionDate) {
      setSubmitError("Selecciona una fecha válida.");
      return;
    }

    if (!categoryId) {
      setSubmitError("Selecciona una categoría.");
      return;
    }

    if (!description.trim()) {
      setSubmitError("La descripción es obligatoria.");
      return;
    }

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

      if (kind === "income" || kind === "expense") {
        if (!accountId) {
          setSubmitError("Selecciona una cuenta.");
          return;
        }

        endpoint = kind === "income" ? "/api/bff/transactions/income" : "/api/bff/transactions/expense";
        payload = {
          accountId,
          categoryId,
          ...analyticsPayload,
          amount: amountNumber,
          description: description.trim(),
          transactionDate
        };
      } else {
        if (!sourceAccountId || !destinationAccountId) {
          setSubmitError("Selecciona cuenta origen y destino.");
          return;
        }

        if (sourceAccountId === destinationAccountId) {
          setSubmitError("La cuenta origen y destino deben ser diferentes.");
          return;
        }

        endpoint = "/api/bff/transactions/transfer";
        payload = {
          sourceAccountId,
          destinationAccountId,
          categoryId,
          ...analyticsPayload,
          amount: amountNumber,
          description: description.trim(),
          transactionDate
        };
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null;
        setSubmitError(data?.message ?? "No se pudo registrar la transacción.");
        return;
      }

      setSuccessMessage(`${typeLabel[kind]} registrada correctamente.`);
      setAmount("");
      setDescription("");
      setSubcategoryId(null);
      setMerchantId(null);
      setTagsText("");
      setTransactionDate(todayIsoDate());
    } catch {
      setSubmitError("No se pudo conectar con el servidor.");
    } finally {
      setSubmitLoading(false);
    }
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
      transactionDate: dateInputValue(item.transactionDate),
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
      transactionDate: dateInputValue(item.transactionDate),
      tagsText: item.tags.join(", ")
    });
  }, [catalogs]);

  async function onSaveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editForm) {
      return;
    }

    const amountNumber = Number(editForm.amount);
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      setEditError("Ingresa un monto mayor a 0.");
      return;
    }

    if (!editForm.categoryId) {
      setEditError("Selecciona una categoría.");
      return;
    }

    setEditSaving(true);
    setEditError(null);

    try {
      const payload = {
        accountId: editForm.accountId,
        categoryId: editForm.categoryId,
        subcategoryId: editForm.subcategoryId ?? undefined,
        merchantId: editForm.merchantId ?? undefined,
        amount: amountNumber,
        description: editForm.description.trim(),
        transactionDate: editForm.transactionDate,
        tags: parseTagsInput(editForm.tagsText)
      };

      const response = await fetch(`/api/bff/transactions/${editForm.transactionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
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
  }

  async function onSaveTransferEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!transferEditForm) {
      return;
    }

    if (!transferEditForm.categoryId) {
      setEditError("Selecciona una categoría.");
      return;
    }

    setEditSaving(true);
    setEditError(null);

    try {
      const payload = {
        categoryId: transferEditForm.categoryId,
        subcategoryId: transferEditForm.subcategoryId ?? undefined,
        merchantId: transferEditForm.merchantId ?? undefined,
        description: transferEditForm.description.trim(),
        transactionDate: transferEditForm.transactionDate,
        tags: parseTagsInput(transferEditForm.tagsText)
      };

      const response = await fetch(`/api/bff/transactions/transfers/${transferEditForm.transferGroupId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
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
  }

  const onDelete = useCallback(async (item: TransactionHistoryItem) => {
    const confirmed = window.confirm("¿Seguro que quieres eliminar esta transacción?");
    if (!confirmed) {
      return;
    }

    setDeleteLoadingId(item.transactionId);
    setHistoryError(null);
    try {
      const response = await fetch(`/api/bff/transactions/${item.transactionId}`, {
        method: "DELETE"
      });

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
  }, [loadHistory]);

  const onDeleteTransferGroup = useCallback(async (item: TransferGroupItem) => {
    const confirmed = window.confirm("¿Seguro que quieres eliminar esta transferencia completa?");
    if (!confirmed) {
      return;
    }

    setDeleteTransferGroupId(item.transferGroupId);
    setHistoryError(null);
    try {
      const response = await fetch(`/api/bff/transactions/transfers/${item.transferGroupId}`, {
        method: "DELETE"
      });

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
  }, [loadHistory]);

  const historyColumns = useMemo<ColumnDef<TransactionHistoryItem>[]>(
    () => [
      {
        accessorKey: "transactionDate",
        header: "Fecha",
        cell: ({ row }) => dateInputValue(row.original.transactionDate)
      },
      {
        accessorKey: "type",
        header: "Tipo",
        cell: ({ row }) => typeLabel[row.original.type]
      },
      {
        accessorKey: "accountName",
        header: "Cuenta"
      },
      {
        accessorKey: "categoryId",
        header: "Categoría",
        cell: ({ row }) => (row.original.categoryId ? (categoryNameById.get(row.original.categoryId) ?? "—") : "—")
      },
      {
        accessorKey: "subcategoryId",
        header: "Subcategoría",
        cell: ({ row }) => (row.original.subcategoryId ? (subcategoryNameById.get(row.original.subcategoryId) ?? "—") : "—")
      },
      {
        accessorKey: "merchantId",
        header: "Comercio",
        cell: ({ row }) => (row.original.merchantId ? (merchantNameById.get(row.original.merchantId) ?? "—") : "—")
      },
      {
        accessorKey: "amount",
        header: "Monto",
        cell: ({ row }) => formatCurrency(row.original.amount)
      },
      {
        accessorKey: "description",
        header: "Descripción"
      },
      {
        accessorKey: "tags",
        header: "Tags",
        cell: ({ row }) => (row.original.tags.length > 0 ? row.original.tags.join(", ") : "—")
      },
      {
        id: "actions",
        header: "Acciones",
        enableSorting: false,
        cell: ({ row }) => {
          const item = row.original;
          return (
            <div className="flex gap-1">
              <Button
                type="button"
                variant="secondary"
                className="h-6 px-1.5 text-[10px]"
                onClick={() => openEditModal(item)}
              >
                Editar
              </Button>
              <Button
                type="button"
                variant="danger"
                className="h-6 px-1.5 text-[10px]"
                disabled={deleteLoadingId === item.transactionId}
                onClick={() => void onDelete(item)}
              >
                Borrar
              </Button>
            </div>
          );
        }
      }
    ],
    [categoryNameById, deleteLoadingId, merchantNameById, onDelete, openEditModal, subcategoryNameById]
  );

  const transferColumns = useMemo<ColumnDef<TransferGroupItem>[]>(
    () => [
      {
        accessorKey: "transactionDate",
        header: "Fecha",
        cell: ({ row }) => dateInputValue(row.original.transactionDate)
      },
      {
        accessorKey: "accountFromName",
        header: "Cuenta A"
      },
      {
        accessorKey: "accountToName",
        header: "Cuenta B"
      },
      {
        accessorKey: "categoryId",
        header: "Categoría",
        cell: ({ row }) => (row.original.categoryId ? (categoryNameById.get(row.original.categoryId) ?? "—") : "—")
      },
      {
        accessorKey: "subcategoryId",
        header: "Subcategoría",
        cell: ({ row }) => (row.original.subcategoryId ? (subcategoryNameById.get(row.original.subcategoryId) ?? "—") : "—")
      },
      {
        accessorKey: "merchantId",
        header: "Comercio",
        cell: ({ row }) => (row.original.merchantId ? (merchantNameById.get(row.original.merchantId) ?? "—") : "—")
      },
      {
        accessorKey: "amount",
        header: "Monto",
        cell: ({ row }) => formatCurrency(row.original.amount)
      },
      {
        accessorKey: "description",
        header: "Descripción"
      },
      {
        accessorKey: "tags",
        header: "Tags",
        cell: ({ row }) => (row.original.tags.length > 0 ? row.original.tags.join(", ") : "—")
      },
      {
        id: "actions",
        header: "Acciones",
        enableSorting: false,
        cell: ({ row }) => {
          const item = row.original;
          return (
            <div className="flex gap-1">
              <Button
                type="button"
                variant="secondary"
                className="h-6 px-1.5 text-[10px]"
                onClick={() => openTransferEditModal(item)}
              >
                Editar
              </Button>
              <Button
                type="button"
                variant="danger"
                className="h-6 px-1.5 text-[10px]"
                disabled={deleteTransferGroupId === item.transferGroupId}
                onClick={() => void onDeleteTransferGroup(item)}
              >
                Borrar
              </Button>
            </div>
          );
        }
      }
    ],
    [categoryNameById, deleteTransferGroupId, merchantNameById, onDeleteTransferGroup, openTransferEditModal, subcategoryNameById]
  );

  return (
    <main className="min-h-dvh w-full bg-slate-100 px-4 py-8 dark:bg-slate-900 md:px-6 xl:px-8">
      <section className="w-full space-y-6">
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
                <form onSubmit={onSubmit} className="space-y-4">
                  {kind === "transfer" ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="grid gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                        Cuenta origen
                        <select
                          value={sourceAccountId ?? ""}
                          onChange={(event) => setSourceAccountId(parseSelectedNumber(event.target.value))}
                          className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                          required
                        >
                          <option value="">Selecciona una cuenta</option>
                          {catalogs?.accounts.map((account) => (
                            <option key={account.accountId} value={account.accountId}>
                              {account.name} · {formatCurrency(account.currentBalance)}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="grid gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                        Cuenta destino
                        <select
                          value={destinationAccountId ?? ""}
                          onChange={(event) => setDestinationAccountId(parseSelectedNumber(event.target.value))}
                          className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                          required
                        >
                          <option value="">Selecciona una cuenta</option>
                          {catalogs?.accounts.map((account) => (
                            <option key={account.accountId} value={account.accountId}>
                              {account.name} · {formatCurrency(account.currentBalance)}
                            </option>
                          ))}
                        </select>
                      </label>

                      <div className="md:col-span-2">
                        <Button type="button" variant="ghost" className="h-9 px-0 text-sm" onClick={swapTransferAccounts}>
                          Intercambiar origen y destino
                        </Button>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {sourceAccount ? `Origen: ${sourceAccount.name}` : "Origen sin seleccionar"} ·{" "}
                          {destinationAccount ? `Destino: ${destinationAccount.name}` : "Destino sin seleccionar"}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <label className="grid gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                      Cuenta
                      <select
                        value={accountId ?? ""}
                        onChange={(event) => setAccountId(parseSelectedNumber(event.target.value))}
                        className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                        required
                      >
                        <option value="">Selecciona una cuenta</option>
                        {catalogs?.accounts.map((account) => (
                          <option key={account.accountId} value={account.accountId}>
                            {account.name} · {formatCurrency(account.currentBalance)}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  <label className="grid gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                    Categoría
                    <select
                      value={categoryId ?? ""}
                      onChange={(event) => setCategoryId(parseSelectedNumber(event.target.value))}
                      className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
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

                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="grid gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                      Subcategoría (opcional)
                      <select
                        value={subcategoryId ?? ""}
                        onChange={(event) => setSubcategoryId(parseSelectedNumber(event.target.value))}
                        className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      >
                        <option value="">Sin subcategoría</option>
                        {subcategoriesForSelectedCategory.map((subcategory) => (
                          <option key={subcategory.subcategoryId} value={subcategory.subcategoryId}>
                            {subcategory.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="grid gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                      Comercio (opcional)
                      <select
                        value={merchantId ?? ""}
                        onChange={(event) => setMerchantId(parseSelectedNumber(event.target.value))}
                        className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      >
                        <option value="">Sin comercio</option>
                        {catalogs?.merchants.map((merchant) => (
                          <option key={merchant.merchantId} value={merchant.merchantId}>
                            {merchant.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <Input
                    label="Tags (opcional, separados por coma)"
                    type="text"
                    value={tagsText}
                    onChange={(event) => setTagsText(event.target.value)}
                    placeholder="ej. steam, oferta, suscripción"
                    list="transaction-tag-suggestions"
                  />
                  <datalist id="transaction-tag-suggestions">
                    {(catalogs?.tags ?? []).map((tag) => (
                      <option key={tag.tagId} value={tag.name} />
                    ))}
                  </datalist>

                  <div className="grid gap-4 md:grid-cols-2">
                    <Input
                      label="Monto"
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                      placeholder="0.00"
                      required
                    />

                    <Input
                      label="Fecha"
                      type="date"
                      value={transactionDate}
                      onChange={(event) => setTransactionDate(event.target.value)}
                      required
                    />
                  </div>

                  <Input
                    label="Descripción"
                    type="text"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Ej. Interés GBM"
                    required
                  />

                  {submitError ? <Alert variant="danger">{submitError}</Alert> : null}
                  {successMessage ? <Alert variant="info">{successMessage}</Alert> : null}

                  <div className="flex justify-end">
                    <Button type="submit" loading={submitLoading} loadingText="Guardando...">
                      Guardar {typeLabel[kind].toLowerCase()}
                    </Button>
                  </div>
                </form>
              )}
            </>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:max-w-xs">
                <Input
                  label="Mes"
                  type="month"
                  value={historyMonth}
                  onChange={(event) => setHistoryMonth(event.target.value)}
                />
                <Button
                  type="button"
                  variant="secondary"
                  className="h-9"
                  loading={historyLoading}
                  loadingText="Cargando..."
                  onClick={() => void loadHistory(historyMonth)}
                >
                  Recargar historial
                </Button>
              </div>

              {historyError ? <Alert variant="danger">{historyError}</Alert> : null}
              {successMessage ? <Alert variant="info">{successMessage}</Alert> : null}

              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Transacciones normales</h3>
                <DataGrid
                  columns={historyColumns}
                  rows={regularHistoryItems}
                  mode="client"
                  density="compact"
                  loading={historyLoading}
                  emptyMessage="No hay transacciones normales en este mes"
                />
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Transferencias por grupo</h3>
                <DataGrid
                  columns={transferColumns}
                  rows={transferGroups}
                  mode="client"
                  density="compact"
                  loading={historyLoading}
                  emptyMessage="No hay transferencias en este mes"
                />
              </div>
            </div>
          )}
        </Card>

        {editForm ? (
          <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4">
            <Card className="w-full max-w-xl p-6">
              <form className="space-y-4" onSubmit={(event) => void onSaveEdit(event)}>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Editar transacción</h3>

                <label className="grid gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                  Categoría
                  <select
                    value={editForm.categoryId}
                    onChange={(event) => {
                      const nextCategoryId = parseSelectedNumber(event.target.value) ?? 0;
                      setEditForm((current) =>
                        current
                          ? {
                              ...current,
                              categoryId: nextCategoryId,
                              subcategoryId: null
                            }
                          : current
                      );
                    }}
                    className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    required
                  >
                    {(catalogs?.categoriesByType[editForm.type ?? "expense"] ?? catalogs?.categories ?? []).map((category) => (
                      <option key={category.categoryId} value={category.categoryId}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="grid gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                    Subcategoría (opcional)
                    <select
                      value={editForm.subcategoryId ?? ""}
                      onChange={(event) =>
                        setEditForm((current) => (current ? { ...current, subcategoryId: parseSelectedNumber(event.target.value) } : current))
                      }
                      className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    >
                      <option value="">Sin subcategoría</option>
                      {editSubcategories.map((subcategory) => (
                        <option key={subcategory.subcategoryId} value={subcategory.subcategoryId}>
                          {subcategory.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="grid gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                    Comercio (opcional)
                    <select
                      value={editForm.merchantId ?? ""}
                      onChange={(event) =>
                        setEditForm((current) => (current ? { ...current, merchantId: parseSelectedNumber(event.target.value) } : current))
                      }
                      className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    >
                      <option value="">Sin comercio</option>
                      {(catalogs?.merchants ?? []).map((merchant) => (
                        <option key={merchant.merchantId} value={merchant.merchantId}>
                          {merchant.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Input
                    label="Monto"
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={editForm.amount}
                    onChange={(event) => setEditForm((current) => (current ? { ...current, amount: event.target.value } : current))}
                    required
                  />
                  <Input
                    label="Fecha"
                    type="date"
                    value={editForm.transactionDate}
                    onChange={(event) => setEditForm((current) => (current ? { ...current, transactionDate: event.target.value } : current))}
                    required
                  />
                </div>

                <Input
                  label="Descripción"
                  type="text"
                  value={editForm.description}
                  onChange={(event) => setEditForm((current) => (current ? { ...current, description: event.target.value } : current))}
                  required
                />

                <Input
                  label="Tags (opcional, separados por coma)"
                  type="text"
                  value={editForm.tagsText}
                  onChange={(event) => setEditForm((current) => (current ? { ...current, tagsText: event.target.value } : current))}
                  list="transaction-tag-suggestions"
                />

                {editError ? <Alert variant="danger">{editError}</Alert> : null}

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="secondary" onClick={() => setEditForm(null)}>
                    Cancelar
                  </Button>
                  <Button type="submit" loading={editSaving} loadingText="Guardando...">
                    Guardar cambios
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        ) : null}

        {transferEditForm ? (
          <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4">
            <Card className="w-full max-w-xl p-6">
              <form className="space-y-4" onSubmit={(event) => void onSaveTransferEdit(event)}>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Editar transferencia (grupo)</h3>

                <label className="grid gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                  Categoría
                  <select
                    value={transferEditForm.categoryId}
                    onChange={(event) => {
                      const nextCategoryId = parseSelectedNumber(event.target.value) ?? 0;
                      setTransferEditForm((current) =>
                        current
                          ? {
                              ...current,
                              categoryId: nextCategoryId,
                              subcategoryId: null
                            }
                          : current
                      );
                    }}
                    className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    required
                  >
                    {(catalogs?.categoriesByType.transfer ?? catalogs?.categories ?? []).map((category) => (
                      <option key={category.categoryId} value={category.categoryId}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="grid gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                    Subcategoría (opcional)
                    <select
                      value={transferEditForm.subcategoryId ?? ""}
                      onChange={(event) =>
                        setTransferEditForm((current) =>
                          current ? { ...current, subcategoryId: parseSelectedNumber(event.target.value) } : current
                        )
                      }
                      className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    >
                      <option value="">Sin subcategoría</option>
                      {transferEditSubcategories.map((subcategory) => (
                        <option key={subcategory.subcategoryId} value={subcategory.subcategoryId}>
                          {subcategory.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="grid gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                    Comercio (opcional)
                    <select
                      value={transferEditForm.merchantId ?? ""}
                      onChange={(event) =>
                        setTransferEditForm((current) =>
                          current ? { ...current, merchantId: parseSelectedNumber(event.target.value) } : current
                        )
                      }
                      className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    >
                      <option value="">Sin comercio</option>
                      {(catalogs?.merchants ?? []).map((merchant) => (
                        <option key={merchant.merchantId} value={merchant.merchantId}>
                          {merchant.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <Input
                  label="Fecha"
                  type="date"
                  value={transferEditForm.transactionDate}
                  onChange={(event) =>
                    setTransferEditForm((current) => (current ? { ...current, transactionDate: event.target.value } : current))
                  }
                  required
                />

                <Input
                  label="Descripción"
                  type="text"
                  value={transferEditForm.description}
                  onChange={(event) =>
                    setTransferEditForm((current) => (current ? { ...current, description: event.target.value } : current))
                  }
                  required
                />

                <Input
                  label="Tags (opcional, separados por coma)"
                  type="text"
                  value={transferEditForm.tagsText}
                  onChange={(event) =>
                    setTransferEditForm((current) => (current ? { ...current, tagsText: event.target.value } : current))
                  }
                  list="transaction-tag-suggestions"
                />

                {editError ? <Alert variant="danger">{editError}</Alert> : null}

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="secondary" onClick={() => setTransferEditForm(null)}>
                    Cancelar
                  </Button>
                  <Button type="submit" loading={editSaving} loadingText="Guardando...">
                    Guardar cambios
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        ) : null}
      </section>
    </main>
  );
}
