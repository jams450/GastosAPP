import { AdminShell } from "@/components/navigation/admin-shell";
import { requireAdminSession } from "@/lib/auth/guards";
import { AccountsOverview } from "./accounts-overview";

export default async function DashboardPage() {
  const session = await requireAdminSession();

  return (
    <AdminShell
      username={session.user.username}
      section="Panel principal"
      title="Dashboard"
      subtitle="Resumen operativo y financiero"
    >
      <AccountsOverview />
    </AdminShell>
  );
}
