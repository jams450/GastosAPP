import { requireAdminSession } from "@/lib/auth/guards";
import { InvestmentsClient } from "./investments-client";

export const metadata: import("next").Metadata = { title: "Inversiones" };

export default async function InvestmentsPage() {
  await requireAdminSession();
  return <InvestmentsClient />;
}
