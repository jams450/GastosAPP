import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";

export async function requireTransactionsSession() {
  const session = await getServerSession();

  if (!session) {
    redirect("/login");
  }

  if ((session.user.role ?? "").toLowerCase() !== "admin") {
    redirect("/dashboard");
  }

  return session;
}
