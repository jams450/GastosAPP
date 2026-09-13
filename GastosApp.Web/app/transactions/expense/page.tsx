import { requireTransactionsSession } from "../_lib/transactions-route-guard";
import { parseRepeatPrefill } from "../_lib/transactions-repeat";
import { ExpenseClient } from "./expense-client";

export default async function TransactionsExpensePage(props: {
  searchParams?: Promise<{ repeat?: string }>;
}) {
  const session = await requireTransactionsSession();
  const params = await props.searchParams;
  const initialRepeat = parseRepeatPrefill(params?.repeat, "expense");
  return <ExpenseClient username={session.user.username} initialRepeat={initialRepeat} />;
}
