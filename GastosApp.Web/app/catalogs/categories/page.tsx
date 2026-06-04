import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { CategoriesClient } from "./categories-client";

export default async function CategoriesCatalogPage() {
  const session = await getServerSession();

  if (!session) {
    redirect("/login");
  }

  if ((session.user.role ?? "").toLowerCase() !== "admin") {
    redirect("/dashboard");
  }

  return <CategoriesClient username={session.user.username} />;
}
