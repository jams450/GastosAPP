import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";

export default async function CatalogsPage() {
  const session = await getServerSession();

  if (!session) {
    redirect("/login");
  }

  redirect("/catalogs/categories");
}
