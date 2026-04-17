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
    <main className="relative min-h-dvh overflow-x-clip bg-slate-100 px-4 py-8 dark:bg-slate-900 md:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_0%_0%,rgba(14,165,233,0.18),transparent_30%),radial-gradient(circle_at_100%_0%,rgba(59,130,246,0.14),transparent_32%)] dark:bg-[radial-gradient(circle_at_0%_0%,rgba(14,165,233,0.14),transparent_30%),radial-gradient(circle_at_100%_0%,rgba(37,99,235,0.2),transparent_34%)]" />

      <section className="relative mx-auto w-full max-w-7xl space-y-6">
        <Card className="sticky top-4 z-20 border-slate-200/80 bg-white/90 p-4 shadow-lg shadow-slate-200/55 backdrop-blur dark:border-slate-700/80 dark:bg-slate-950/85 dark:shadow-black/35 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700 dark:text-sky-400">Panel principal</p>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 md:text-3xl">Dashboard</h1>
            </div>

            <AppMenu username={session.user.username} />
          </div>
        </Card>

        <AccountsOverview />
      </section>
    </main>
  );
}
