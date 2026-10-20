import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { CurrenciesClient } from "./currencies-client";

export const metadata: import("next").Metadata = { title: "Monedas" };

/**
 * Sin comprobación de rol para ver el catálogo: es informativo para cualquier usuario autenticado, a
 * diferencia de los catálogos editables, que sí son de administración.
 *
 * Forzar la sincronización sí exige rol de administración, porque escribe la tabla global de tasas y
 * consume la cuota del proveedor. El rol se usa solo para decidir si el botón existe; la autorización
 * real la aplica el API, así que ocultar el botón no es el mecanismo de seguridad.
 */
export default async function CurrenciesCatalogPage() {
  const session = await getServerSession();

  if (!session) {
    redirect("/login");
  }

  const canForceRefresh = (session.user.role ?? "").toLowerCase() === "admin";

  return <CurrenciesClient username={session.user.username} canForceRefresh={canForceRefresh} />;
}
