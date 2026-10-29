import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { PreviewClient } from "./preview-client";

export const metadata: import("next").Metadata = { title: "Módulo de prueba de correo" };

export default async function MailTestPage() {
  const session = await getServerSession();

  if (!session) {
    redirect("/login");
  }

  if ((session.user.role ?? "").toLowerCase() !== "admin") {
    redirect("/dashboard");
  }

  return <PreviewClient username={session.user.username} />;
}
