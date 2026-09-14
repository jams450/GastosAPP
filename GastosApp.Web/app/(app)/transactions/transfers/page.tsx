import { requireTransactionsSession } from "../_lib/transactions-route-guard";
import { TransfersClient } from "./transfers-client";

export default async function TransactionsTransfersPage() {
  const session = await requireTransactionsSession();
  return <TransfersClient username={session.user.username} />;
}
