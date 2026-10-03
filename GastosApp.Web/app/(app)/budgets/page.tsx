import { requireAdminSession } from "@/lib/auth/guards";
import { BudgetsClient } from "./budgets-client";

export const metadata: import("next").Metadata = { title: "Presupuestos" };

export default async function BudgetsPage() {
  await requireAdminSession();
  return <BudgetsClient />;
}
