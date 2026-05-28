import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { CategoriesClient } from "./categories-client";

export default async function CategoriesCatalogPage() {
  const session = await getServerSession();

  if (!session) {
    redirect("/login");
  }

  return <CategoriesClient username={session.user.username} />;
}
