import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format/currency";
import { tableActionStyles } from "@/lib/ui/table-action-styles";
import { dateTimeLocalDisplay } from "../_lib/transactions-utils";
import { historyTypeLabel, type HistoryTransactionType, type TransactionHistoryItem, type TransferGroupItem } from "../_lib/transactions-types";

const typeBadgeClass: Record<HistoryTransactionType, string> = {
  income: "txn-type-badge txn-type-income",
  expense: "txn-type-badge txn-type-expense",
  transfer: "txn-type-badge txn-type-transfer",
  opening_credit: "txn-type-badge txn-type-opening"
};

function renderSignedAmount(type: HistoryTransactionType, amount: number) {
  if (type === "income") {
    return <span className="txn-amount txn-amount-income">+{formatCurrency(Math.abs(amount))}</span>;
  }

  if (type === "expense" || type === "opening_credit") {
    return <span className="txn-amount txn-amount-expense">−{formatCurrency(Math.abs(amount))}</span>;
  }

  return <span className="txn-amount txn-amount-transfer">{formatCurrency(Math.abs(amount))}</span>;
}

type Params = {
  accountById: Map<number, { isCredit?: boolean }>;
  selfBillablePartyId: number | null;
  categoryNameById: Map<number, string>;
  subcategoryNameById: Map<number, string>;
  merchantNameById: Map<number, string>;
  deleteLoadingId: number | null;
  deleteTransferGroupId: string | null;
  onEdit: (item: TransactionHistoryItem) => void;
  onDelete: (item: TransactionHistoryItem) => Promise<void>;
  onConvertToMsi: (item: TransactionHistoryItem) => Promise<void>;
  onEditTransfer: (item: TransferGroupItem) => void;
  onDeleteTransfer: (item: TransferGroupItem) => Promise<void>;
  onRepeat?: (item: TransactionHistoryItem) => void;
};

export function useHistoryColumns({
  accountById,
  selfBillablePartyId,
  categoryNameById,
  subcategoryNameById,
  merchantNameById,
  deleteLoadingId,
  deleteTransferGroupId,
  onEdit,
  onDelete,
  onConvertToMsi,
  onEditTransfer,
  onDeleteTransfer,
  onRepeat
}: Params) {
  const historyColumns = useMemo<ColumnDef<TransactionHistoryItem>[]>(
    () => [
      { accessorKey: "transactionDate", header: "Fecha", cell: ({ row }) => dateTimeLocalDisplay(row.original.transactionDate) },
      {
        id: "type",
        accessorFn: (row) => historyTypeLabel[row.type],
        header: "Tipo",
        cell: ({ row }) => <span className={typeBadgeClass[row.original.type]}>{historyTypeLabel[row.original.type]}</span>
      },
      { accessorKey: "accountName", header: "Cuenta" },
      {
        id: "categoryId",
        accessorFn: (row) => (row.categoryId ? (categoryNameById.get(row.categoryId) ?? "—") : "—"),
        header: "Categoría",
        cell: ({ row }) => (row.original.categoryId ? (categoryNameById.get(row.original.categoryId) ?? "—") : "—")
      },
      {
        id: "subcategoryId",
        accessorFn: (row) => (row.subcategoryId ? (subcategoryNameById.get(row.subcategoryId) ?? "—") : "—"),
        header: "Subcategoría",
        cell: ({ row }) => (row.original.subcategoryId ? (subcategoryNameById.get(row.original.subcategoryId) ?? "—") : "—")
      },
      {
        id: "merchantId",
        accessorFn: (row) => (row.merchantId ? (merchantNameById.get(row.merchantId) ?? "—") : "—"),
        header: "Comercio",
        cell: ({ row }) => (row.original.merchantId ? (merchantNameById.get(row.original.merchantId) ?? "—") : "—")
      },
      { accessorKey: "amount", header: "Monto", cell: ({ row }) => renderSignedAmount(row.original.type, row.original.amount) },
      {
        accessorKey: "creditMonths",
        header: "Meses",
        cell: ({ row }) => (row.original.type === "expense" && accountById.get(row.original.accountId)?.isCredit ? (row.original.creditMonths ?? "—") : "—")
      },
      {
        accessorKey: "creditRemainingAmount",
        header: "Falta pagar",
        cell: ({ row }) => (row.original.type === "expense" && accountById.get(row.original.accountId)?.isCredit && row.original.creditRemainingAmount !== null
          ? formatCurrency(row.original.creditRemainingAmount)
          : "—")
      },
      {
        accessorKey: "creditStatus",
        header: "Estado crédito",
        cell: ({ row }) => {
          if (!(row.original.type === "expense" && accountById.get(row.original.accountId)?.isCredit)) {
            return "—";
          }

          const status = (row.original.creditStatus ?? "open").toLowerCase();
          const label = status === "paid" ? "Pagado" : status === "partiallypaid" ? "Parcial" : status === "reversed" ? "Reversado" : "Pendiente";
          const tone = status === "paid"
            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
            : status === "partiallypaid"
              ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
              : status === "reversed"
                ? "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                : "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300";

          return <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}>{label}</span>;
        }
      },
      { accessorKey: "description", header: "Descripción" },
      {
        id: "sharedExpense",
        header: "¿Alguien más paga?",
        cell: ({ row }) => {
          const distinctBillablePartyIds = new Set(row.original.allocations.map((allocation) => allocation.billablePartyId));
          if (distinctBillablePartyIds.size === 0) {
            return "—";
          }

          if (selfBillablePartyId === null) {
            return distinctBillablePartyIds.size > 1 ? "Sí" : "No";
          }

          const hasSelf = distinctBillablePartyIds.has(selfBillablePartyId);
          const hasOthers = [...distinctBillablePartyIds].some((billablePartyId) => billablePartyId !== selfBillablePartyId);

          if (hasSelf && hasOthers) {
            return "Sí";
          }

          if (!hasSelf && hasOthers) {
            return "Otro";
          }

          return "No";
        }
      },
      {
        id: "actions",

        header: "Acciones",
        enableSorting: false,
        cell: ({ row }) => {
          const item = row.original;
          const isOpeningCredit = item.type === "opening_credit";
          const canConvertToMsi = item.type === "expense"
            && accountById.get(item.accountId)?.isCredit
            && (item.creditMonths === null || item.creditMonths <= 1);
          return (
            <div className="flex gap-1">
              {onRepeat && (item.type === "income" || item.type === "expense") ? (
                <Button type="button" variant="secondary" className="h-6 px-2 text-[10px] font-semibold" onClick={() => onRepeat(item)}>
                  Repetir
                </Button>
              ) : null}
              {!isOpeningCredit ? (
                <Button type="button" variant="ghost" className={`h-6 px-1.5 text-[10px] ${tableActionStyles.edit}`} onClick={() => onEdit(item)}>
                  Editar
                </Button>
              ) : null}
              <Button type="button" variant="ghost" className={`h-6 px-1.5 text-[10px] ${tableActionStyles.delete}`} disabled={deleteLoadingId === item.transactionId} onClick={() => void onDelete(item)}>Borrar</Button>
              {canConvertToMsi ? (
                <Button type="button" variant="secondary" className="h-6 px-2 text-[10px] font-semibold" onClick={() => void onConvertToMsi(item)}>Convertir MSI</Button>
              ) : null}
            </div>
          );
        }
      }
    ],
    [accountById, selfBillablePartyId, categoryNameById, deleteLoadingId, merchantNameById, onConvertToMsi, onDelete, onEdit, onRepeat, subcategoryNameById]
  );

  const transferColumns = useMemo<ColumnDef<TransferGroupItem>[]>(
    () => [
      {
        id: "type",
        accessorFn: () => "Transferencia",
        header: "Tipo",
        cell: () => <span className="txn-type-badge txn-type-transfer">Transferencia</span>
      },
      { accessorKey: "transactionDate", header: "Fecha", cell: ({ row }) => dateTimeLocalDisplay(row.original.transactionDate) },
      { accessorKey: "accountFromName", header: "Cuenta A" },
      { accessorKey: "accountToName", header: "Cuenta B" },
      {
        id: "categoryId",
        accessorFn: (row) => (row.categoryId ? (categoryNameById.get(row.categoryId) ?? "—") : "—"),
        header: "Categoría",
        cell: ({ row }) => (row.original.categoryId ? (categoryNameById.get(row.original.categoryId) ?? "—") : "—")
      },
      {
        id: "subcategoryId",
        accessorFn: (row) => (row.subcategoryId ? (subcategoryNameById.get(row.subcategoryId) ?? "—") : "—"),
        header: "Subcategoría",
        cell: ({ row }) => (row.original.subcategoryId ? (subcategoryNameById.get(row.original.subcategoryId) ?? "—") : "—")
      },
      {
        id: "merchantId",
        accessorFn: (row) => (row.merchantId ? (merchantNameById.get(row.merchantId) ?? "—") : "—"),
        header: "Comercio",
        cell: ({ row }) => (row.original.merchantId ? (merchantNameById.get(row.original.merchantId) ?? "—") : "—")
      },
      {
        accessorKey: "amount",
        header: "Monto",
        cell: ({ row }) => <span className="txn-amount txn-amount-transfer">{formatCurrency(Math.abs(row.original.amount))}</span>
      },
      { accessorKey: "description", header: "Descripción" },
      {
        id: "tags",
        accessorFn: (row) => (row.tags.length > 0 ? row.tags.join(", ") : "—"),
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
              <Button type="button" variant="ghost" className={`h-6 px-1.5 text-[10px] ${tableActionStyles.edit}`} onClick={() => onEditTransfer(item)}>Editar</Button>
              <Button type="button" variant="ghost" className={`h-6 px-1.5 text-[10px] ${tableActionStyles.delete}`} disabled={deleteTransferGroupId === item.transferGroupId} onClick={() => void onDeleteTransfer(item)}>Borrar</Button>
            </div>
          );
        }
      }
    ],
    [categoryNameById, deleteTransferGroupId, merchantNameById, onDeleteTransfer, onEditTransfer, subcategoryNameById]
  );

  return { historyColumns, transferColumns };
}
