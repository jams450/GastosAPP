import { AppShell } from "@/components/navigation/app-shell";
import { requireAdminSession } from "@/lib/auth/guards";

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await requireAdminSession();
  return <AppShell username={session.user.username}>{children}</AppShell>;
}
