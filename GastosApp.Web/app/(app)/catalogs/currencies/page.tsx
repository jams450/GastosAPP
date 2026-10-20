import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { CurrenciesClient } from "./currencies-client";

export const metadata: import("next").Metadata = { title: "Monedas" };

/**
 * Sin comprobación de rol: el catálogo de monedas es informativo para cualquier usuario autenticado,
 * a diferencia de los catálogos editables, que sí son de administración.
 */
export default async function CurrenciesCatalogPage() {
  const session = await getServerSession();

  if (!session) {
    redirect("/login");
  }

  return <CurrenciesClient username={session.user.username} />;
}
