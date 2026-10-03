import { TransactionsClient } from "../transactions-client";
import { requireTransactionsSession } from "../_lib/transactions-route-guard";

export const metadata: import("next").Metadata = { title: "Transacciones" };

export default async function TransactionsLegacyPage() {
  const session = await requireTransactionsSession();
  return <TransactionsClient username={session.user.username} />;
}
