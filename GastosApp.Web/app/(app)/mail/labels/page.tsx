import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { LabelsClient } from "./labels-client";

export const metadata: import("next").Metadata = { title: "Etiquetas de correo" };

export default async function MailLabelsPage() {
  const session = await getServerSession();

  if (!session) {
    redirect("/login");
  }

  if ((session.user.role ?? "").toLowerCase() !== "admin") {
    redirect("/dashboard");
  }

  return <LabelsClient username={session.user.username} />;
}
