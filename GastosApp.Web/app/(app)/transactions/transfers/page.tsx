import { requireTransactionsSession } from "../_lib/transactions-route-guard";
import { TransfersClient } from "./transfers-client";

export const metadata: import("next").Metadata = { title: "Transferencias" };

export default async function TransactionsTransfersPage() {
  const session = await requireTransactionsSession();
  return <TransfersClient username={session.user.username} />;
}
