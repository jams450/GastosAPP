import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { CatalogsClient } from "./catalogs-client";

export default async function CatalogsPage() {
  const session = await getServerSession();

  if (!session) {
    redirect("/login");
  }

  return <CatalogsClient username={session.user.username} />;
}
