import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { MerchantsClient } from "./merchants-client";

export default async function MerchantsCatalogPage() {
  const session = await getServerSession();

  if (!session) {
    redirect("/login");
  }

  return <MerchantsClient username={session.user.username} />;
}
