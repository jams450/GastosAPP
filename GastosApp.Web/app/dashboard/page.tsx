import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { AdminShell } from "@/components/navigation/admin-shell";
import { AccountsOverview } from "./accounts-overview";

export default async function DashboardPage() {
  const session = await getServerSession();

  if (!session) {
    redirect("/login");
  }

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
