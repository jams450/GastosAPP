import { redirect } from "next/navigation";
import { requireTransactionsSession } from "../_lib/transactions-route-guard";

export default async function TransactionsCreditPage() {
  await requireTransactionsSession();
  redirect("/transactions/history");
}
