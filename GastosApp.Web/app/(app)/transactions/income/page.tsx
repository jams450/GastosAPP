import { requireTransactionsSession } from "../_lib/transactions-route-guard";
import { parseRepeatPrefill } from "../_lib/transactions-repeat";
import { IncomeClient } from "./income-client";

export const metadata: import("next").Metadata = { title: "Registrar ingreso" };

export default async function TransactionsIncomePage(props: {
  searchParams?: Promise<{ repeat?: string }>;
}) {
  const session = await requireTransactionsSession();
  const params = await props.searchParams;
  const initialRepeat = parseRepeatPrefill(params?.repeat, "income");
  return <IncomeClient username={session.user.username} initialRepeat={initialRepeat} />;
}
