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
    <main className="min-h-dvh bg-slate-100 px-4 py-8 dark:bg-slate-900 md:px-8">
      <section className="mx-auto w-full max-w-6xl space-y-6">
        <Card className="p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-400">Panel principal</p>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 md:text-3xl">Dashboard</h1>
              <p className="text-sm text-slate-600 dark:text-slate-400">Bienvenido de nuevo, {session.user.username}. Aquí tienes el estado de tus cuentas.</p>
            </div>

            <AppMenu username={session.user.username} />
          </div>
        </Card>

        <AccountsOverview />
      </section>
    </main>
  );
}
