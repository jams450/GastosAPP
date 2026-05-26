import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { AccountsOverview } from "./accounts-overview";
import { Card } from "@/components/ui/card";
import { AppMenu } from "@/components/navigation/app-menu";

export default async function DashboardPage() {
  const session = await getServerSession();

  if (!session) {
    redirect("/login");
  }

  return (
    <main className="tabler-page px-4 py-8 md:px-8">
      <div className="tabler-page-gradient" />

      <section className="relative mx-auto w-full max-w-7xl space-y-6">
        <Card className="sticky top-4 z-20 border-[var(--tabler-border)]/80 bg-[var(--tabler-surface-1)]/90 p-4 shadow-[var(--tabler-shadow-md)] backdrop-blur sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--tabler-primary)]">Panel principal</p>
              <h1 className="text-2xl font-semibold tracking-tight text-[var(--tabler-text)] md:text-3xl">Dashboard</h1>
            </div>

            <AppMenu username={session.user.username} />
          </div>
        </Card>

        <AccountsOverview />
      </section>
    </main>
  );
}
