import { SessionGate } from "@/components/navigation/session-gate";
import { AppShell } from "@/components/navigation/app-shell";
import { requireAdminSession } from "@/lib/auth/guards";

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await requireAdminSession();
  return <SessionGate><AppShell username={session.user.username}>{children}</AppShell></SessionGate>;
}
