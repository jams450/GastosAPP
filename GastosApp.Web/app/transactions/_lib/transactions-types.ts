import type { Account } from "@/lib/contracts/accounts";
import type { Category, CategoryType } from "@/lib/contracts/categories";
import type { Merchant } from "@/lib/contracts/merchants";
import type { BillableParty } from "@/lib/contracts/billable-parties";
import type { Subcategory } from "@/lib/contracts/subcategories";
import type { Tag } from "@/lib/contracts/tags";

export type TransactionKind = CategoryType;
export type HistoryTransactionType = TransactionKind | "opening_credit";

export type CatalogsResponse = {
  accounts: Account[];
  categories: Category[];
  subcategories: Subcategory[];
  merchants: Merchant[];
  tags: Tag[];
  billableParties: BillableParty[];
  categoriesByType: {
    income: Category[];
    expense: Category[];
    transfer: Category[];
  };
};

export type TransactionHistoryItem = {
  transactionId: number;
  accountId: number;
  accountName: string;
  categoryId: number | null;
  subcategoryId: number | null;
  merchantId: number | null;
  type: HistoryTransactionType;
  transferGroupId: string | null;
  amount: number;
  description: string;
  transactionDate: string;
  tags: string[];
  creditMonths: number | null;
  creditRemainingAmount: number | null;
  creditStatus: string | null;
  allocations: TransactionAllocationItem[];
};

export type TransactionAllocationItem = {
  transactionAllocationId: number;
  billablePartyId: number;
  billablePartyName: string;
  allocationMode: "percentage" | "amount";
  allocationValue: number;
  calculatedAmount: number;
};

export type TransactionListResponse = {
  month: string;
  transactions: TransactionHistoryItem[];
};

export type ViewMode = "create" | "history";

export type EditFormState = {
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
  allocations: ExpenseAllocationFormState[];
};

export type ExpenseAllocationFormState = {
  rowId: string;
  billablePartyId: number | null;
  type: "percentage" | "amount";
  value: string;
};

export type TransferGroupItem = {
  transferGroupId: string;
  destinationTransactionId: number | null;
  transactionDate: string;
  amount: number;
  sourceAccountId: number;
  destinationAccountId: number | null;
  accountFromName: string;
  accountToName: string;
  categoryId: number | null;
  subcategoryId: number | null;
  merchantId: number | null;
  description: string;
  tags: string[];
};

export type HistoryFilters = {
  type: "all" | TransactionKind;
  accountId: number | "all";
  categoryId: number | "all";
};

export type TransferEditFormState = {
  transferGroupId: string;
  categoryId: number;
  subcategoryId: number | null;
  merchantId: number | null;
  description: string;
  transactionDate: string;
  tagsText: string;
};

export const typeLabel: Record<TransactionKind, string> = {
  income: "Ingreso",
  expense: "Gasto",
  transfer: "Transferencia"
};

export const historyTypeLabel: Record<HistoryTransactionType, string> = {
  ...typeLabel,
  opening_credit: "Gasto heredado"
};
