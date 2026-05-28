import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { BillablePartiesClient } from "./billable-parties-client";

export default async function BillablePartiesCatalogPage() {
  const session = await getServerSession();

  if (!session) {
    redirect("/login");
  }

  return <BillablePartiesClient username={session.user.username} />;
}
