import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format/currency";
import { tableActionStyles } from "@/lib/ui/table-action-styles";
import { dateTimeLocalDisplay } from "../_lib/transactions-utils";
import { historyTypeLabel, type TransactionHistoryItem, type TransferGroupItem } from "../_lib/transactions-types";

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
  onDeleteTransfer
}: Params) {
  const historyColumns = useMemo<ColumnDef<TransactionHistoryItem>[]>(
    () => [
      { accessorKey: "transactionDate", header: "Fecha", cell: ({ row }) => dateTimeLocalDisplay(row.original.transactionDate) },
      { accessorKey: "type", header: "Tipo", cell: ({ row }) => historyTypeLabel[row.original.type] },
      { accessorKey: "accountName", header: "Cuenta" },
      { accessorKey: "categoryId", header: "Categoría", cell: ({ row }) => (row.original.categoryId ? (categoryNameById.get(row.original.categoryId) ?? "—") : "—") },
      { accessorKey: "subcategoryId", header: "Subcategoría", cell: ({ row }) => (row.original.subcategoryId ? (subcategoryNameById.get(row.original.subcategoryId) ?? "—") : "—") },
      { accessorKey: "merchantId", header: "Comercio", cell: ({ row }) => (row.original.merchantId ? (merchantNameById.get(row.original.merchantId) ?? "—") : "—") },
      { accessorKey: "amount", header: "Monto", cell: ({ row }) => formatCurrency(row.original.amount) },
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
              {!isOpeningCredit ? (
                <Button type="button" variant="ghost" className={`h-6 px-1.5 text-[10px] ${tableActionStyles.edit}`} onClick={() => onEdit(item)}>
                  Editar
                </Button>
              ) : null}
              <Button type="button" variant="ghost" className={`h-6 px-1.5 text-[10px] ${tableActionStyles.delete}`} disabled={deleteLoadingId === item.transactionId} onClick={() => void onDelete(item)}>Borrar</Button>
              {canConvertToMsi ? (
                <Button type="button" variant="secondary" className="h-6 border-indigo-300 bg-indigo-50 px-2 text-[10px] font-semibold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300 dark:hover:bg-indigo-900/50" onClick={() => void onConvertToMsi(item)}>Convertir MSI</Button>
              ) : null}
            </div>
          );
        }
      }
    ],
    [accountById, selfBillablePartyId, categoryNameById, deleteLoadingId, merchantNameById, onConvertToMsi, onDelete, onEdit, subcategoryNameById]
  );

  const transferColumns = useMemo<ColumnDef<TransferGroupItem>[]>(
    () => [
      { accessorKey: "transactionDate", header: "Fecha", cell: ({ row }) => dateTimeLocalDisplay(row.original.transactionDate) },
      { accessorKey: "accountFromName", header: "Cuenta A" },
      { accessorKey: "accountToName", header: "Cuenta B" },
      { accessorKey: "categoryId", header: "Categoría", cell: ({ row }) => (row.original.categoryId ? (categoryNameById.get(row.original.categoryId) ?? "—") : "—") },
      { accessorKey: "subcategoryId", header: "Subcategoría", cell: ({ row }) => (row.original.subcategoryId ? (subcategoryNameById.get(row.original.subcategoryId) ?? "—") : "—") },
      { accessorKey: "merchantId", header: "Comercio", cell: ({ row }) => (row.original.merchantId ? (merchantNameById.get(row.original.merchantId) ?? "—") : "—") },
      { accessorKey: "amount", header: "Monto", cell: ({ row }) => formatCurrency(row.original.amount) },
      { accessorKey: "description", header: "Descripción" },
      { accessorKey: "tags", header: "Tags", cell: ({ row }) => (row.original.tags.length > 0 ? row.original.tags.join(", ") : "—") },
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
    [accountById, categoryNameById, deleteTransferGroupId, merchantNameById, onDeleteTransfer, onEditTransfer, subcategoryNameById]
  );

  return { historyColumns, transferColumns };
}
