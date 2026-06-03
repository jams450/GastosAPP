import { requireTransactionsSession } from "../_lib/transactions-route-guard";
import { HistoryClient } from "./history-client";

export default async function TransactionsHistoryPage() {
  const session = await requireTransactionsSession();
  return <HistoryClient username={session.user.username} />;
}
