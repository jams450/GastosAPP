import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { SubcategoriesClient } from "./subcategories-client";

export default async function SubcategoriesCatalogPage() {
  const session = await getServerSession();

  if (!session) {
    redirect("/login");
  }

  return <SubcategoriesClient username={session.user.username} />;
}
