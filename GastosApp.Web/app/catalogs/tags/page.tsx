import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { TagsClient } from "./tags-client";

export default async function TagsCatalogPage() {
  const session = await getServerSession();

  if (!session) {
    redirect("/login");
  }

  return <TagsClient username={session.user.username} />;
}
