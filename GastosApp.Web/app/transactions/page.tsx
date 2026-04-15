import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { TransactionsClient } from "./transactions-client";

export default async function TransactionsPage() {
  const session = await getServerSession();

  if (!session) {
    redirect("/login");
  }

  return <TransactionsClient username={session.user.username} />;
}
