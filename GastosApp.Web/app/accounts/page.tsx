import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { AccountsClient } from "./accounts-client";

export default async function AccountsPage() {
  const session = await getServerSession();

  if (!session) {
    redirect("/login");
  }

  return <AccountsClient username={session.user.username} />;
}
