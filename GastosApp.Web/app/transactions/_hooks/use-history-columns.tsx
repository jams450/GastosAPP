import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format/currency";
import { dateTimeLocalDisplay } from "../_lib/transactions-utils";
import { type TransactionHistoryItem, type TransferGroupItem, typeLabel } from "../_lib/transactions-types";

type Params = {
  accountById: Map<number, { isCredit?: boolean }>;
  categoryNameById: Map<number, string>;
  subcategoryNameById: Map<number, string>;
  merchantNameById: Map<number, string>;
  deleteLoadingId: number | null;
  deleteTransferGroupId: string | null;
  onEdit: (item: TransactionHistoryItem) => void;
  onDelete: (item: TransactionHistoryItem) => Promise<void>;
  onConvertToMsi: (item: TransactionHistoryItem) => Promise<void>;
  onApplyExistingPayment: (sourceTransactionId: number, creditAccountId: number, maxAmount: number) => Promise<void>;
  onEditTransfer: (item: TransferGroupItem) => void;
  onDeleteTransfer: (item: TransferGroupItem) => Promise<void>;
};

export function useHistoryColumns({
  accountById,
  categoryNameById,
  subcategoryNameById,
  merchantNameById,
  deleteLoadingId,
  deleteTransferGroupId,
  onEdit,
  onDelete,
  onConvertToMsi,
  onApplyExistingPayment,
  onEditTransfer,
  onDeleteTransfer
}: Params) {
  const historyColumns = useMemo<ColumnDef<TransactionHistoryItem>[]>(
    () => [
      { accessorKey: "transactionDate", header: "Fecha", cell: ({ row }) => dateTimeLocalDisplay(row.original.transactionDate) },
      { accessorKey: "type", header: "Tipo", cell: ({ row }) => typeLabel[row.original.type] },
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
        header: "Estatus",
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
      { accessorKey: "tags", header: "Tags", cell: ({ row }) => (row.original.tags.length > 0 ? row.original.tags.join(", ") : "—") },
      {
        id: "actions",
        header: "Acciones",
        enableSorting: false,
        cell: ({ row }) => {
          const item = row.original;
          return (
            <div className="flex gap-1">
              <Button type="button" variant="secondary" className="h-6 px-1.5 text-[10px]" onClick={() => onEdit(item)}>Editar</Button>
              <Button type="button" variant="danger" className="h-6 px-1.5 text-[10px]" disabled={deleteLoadingId === item.transactionId} onClick={() => void onDelete(item)}>Borrar</Button>
              {item.type === "expense" && accountById.get(item.accountId)?.isCredit ? (
                <Button type="button" variant="secondary" className="h-6 border-indigo-300 bg-indigo-50 px-2 text-[10px] font-semibold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300 dark:hover:bg-indigo-900/50" onClick={() => void onConvertToMsi(item)}>Convertir MSI</Button>
              ) : null}
              {item.type === "income" && accountById.get(item.accountId)?.isCredit ? (
                <Button type="button" variant="ghost" className="h-6 px-1.5 text-[10px]" onClick={() => void onApplyExistingPayment(item.transactionId, item.accountId, item.amount)}>Aplicar pago</Button>
              ) : null}
            </div>
          );
        }
      }
    ],
    [accountById, categoryNameById, deleteLoadingId, merchantNameById, onApplyExistingPayment, onConvertToMsi, onDelete, onEdit, subcategoryNameById]
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
              <Button type="button" variant="secondary" className="h-6 px-1.5 text-[10px]" onClick={() => onEditTransfer(item)}>Editar</Button>
              <Button type="button" variant="danger" className="h-6 px-1.5 text-[10px]" disabled={deleteTransferGroupId === item.transferGroupId} onClick={() => void onDeleteTransfer(item)}>Borrar</Button>
              {item.destinationAccountId && accountById.get(item.destinationAccountId)?.isCredit && item.destinationTransactionId ? (
                <Button type="button" variant="ghost" className="h-6 px-1.5 text-[10px]" onClick={() => void onApplyExistingPayment(item.destinationTransactionId as number, item.destinationAccountId as number, item.amount)}>Aplicar pago</Button>
              ) : null}
            </div>
          );
        }
      }
    ],
    [accountById, categoryNameById, deleteTransferGroupId, merchantNameById, onApplyExistingPayment, onDeleteTransfer, onEditTransfer, subcategoryNameById]
  );

  return { historyColumns, transferColumns };
}
