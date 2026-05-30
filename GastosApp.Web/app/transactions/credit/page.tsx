import { requireTransactionsSession } from "../_lib/transactions-route-guard";
import { CreditClient } from "./credit-client";

export default async function TransactionsCreditPage() {
  const session = await requireTransactionsSession();
  return <CreditClient username={session.user.username} />;
}
