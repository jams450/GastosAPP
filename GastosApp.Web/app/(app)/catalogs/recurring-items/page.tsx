import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { RecurringItemsClient } from "./recurring-items-client";

export const metadata: import("next").Metadata = { title: "Conceptos recurrentes" };

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
