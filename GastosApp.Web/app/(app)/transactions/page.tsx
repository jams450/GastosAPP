import { redirect } from "next/navigation";
import { requireTransactionsSession } from "./_lib/transactions-route-guard";

export default async function TransactionsPage() {
  await requireTransactionsSession();
  redirect("/transactions/expense");
}
