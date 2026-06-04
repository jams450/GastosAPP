import { requireTransactionsSession } from "../_lib/transactions-route-guard";
import { IncomeClient } from "./income-client";

export default async function TransactionsIncomePage() {
  const session = await requireTransactionsSession();
  return <IncomeClient username={session.user.username} />;
}
