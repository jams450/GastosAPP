import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { RulesClient } from "./rules-client";

export const metadata: import("next").Metadata = { title: "Reglas de correo" };

export default async function MailRulesPage() {
  const session = await getServerSession();

  if (!session) {
    redirect("/login");
  }

  if ((session.user.role ?? "").toLowerCase() !== "admin") {
    redirect("/dashboard");
  }

  return <RulesClient username={session.user.username} />;
}
