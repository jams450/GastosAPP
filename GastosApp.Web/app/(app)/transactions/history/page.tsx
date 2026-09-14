import { requireTransactionsSession } from "../_lib/transactions-route-guard";
import { currentMonthInput } from "../_lib/transactions-utils";
import { HistoryClient } from "./history-client";

type Props = {
  searchParams?: Promise<{
    month?: string;
  }>;
};

function resolveInitialMonth(month: string | undefined) {
  return /^\d{4}-\d{2}$/.test(month ?? "") ? month! : currentMonthInput();
}

export default async function TransactionsHistoryPage({ searchParams }: Props) {
  const session = await requireTransactionsSession();
  const params = await searchParams;
  const initialMonth = resolveInitialMonth(params?.month);

  return <HistoryClient username={session.user.username} initialMonth={initialMonth} />;
}
