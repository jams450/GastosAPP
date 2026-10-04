import { PageHeader } from "@/components/navigation/page-header";
import { requireAdminSession } from "@/lib/auth/guards";
import { AccountsOverview } from "./accounts-overview";

export const metadata: import("next").Metadata = { title: "Panel de control" };

export default async function DashboardPage() {
  await requireAdminSession();

  return (
    <>
      <PageHeader section="Panel principal" title="Dashboard" />
      <AccountsOverview />
    </>
  );
}
