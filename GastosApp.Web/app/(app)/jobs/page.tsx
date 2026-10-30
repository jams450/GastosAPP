import { requireAdminSession } from "@/lib/auth/guards";
import { JobsClient } from "./jobs-client";

export const metadata: import("next").Metadata = { title: "Jobs" };

/**
 * Página administrativa (S2). El layout de la app ya exige administrador; esta guarda repite la
 * comprobación para que la ruta siga siendo segura si el layout cambia.
 */
export default async function JobsPage() {
  await requireAdminSession();

  return <JobsClient />;
}
