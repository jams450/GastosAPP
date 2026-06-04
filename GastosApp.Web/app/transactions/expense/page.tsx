import { requireTransactionsSession } from "../_lib/transactions-route-guard";
import { ExpenseClient } from "./expense-client";

export default async function TransactionsExpensePage() {
  const session = await requireTransactionsSession();
  return <ExpenseClient username={session.user.username} />;
}
