import { PageHeader } from "@/components/navigation/page-header";
import { requireAdminSession } from "@/lib/auth/guards";
import { AccountsOverview } from "./accounts-overview";

export default async function DashboardPage() {
  await requireAdminSession();

  return (
    <>
      <PageHeader section="Panel principal" title="Dashboard" subtitle="Resumen, efectivo, crédito y proyección" />
      <AccountsOverview />
    </>
  );
}
