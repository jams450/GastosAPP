import { requireAdminSession } from "@/lib/auth/guards";
import { BudgetsClient } from "./budgets-client";

export default async function BudgetsPage() {
  await requireAdminSession();
  return <BudgetsClient />;
}
