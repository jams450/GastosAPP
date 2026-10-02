import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { RecurringItemsClient } from "./recurring-items-client";

export default async function RecurringItemsCatalogPage() {
  const session = await getServerSession();

  if (!session) {
    redirect("/login");
  }

  if ((session.user.role ?? "").toLowerCase() !== "admin") {
    redirect("/dashboard");
  }

  return <RecurringItemsClient username={session.user.username} />;
}
