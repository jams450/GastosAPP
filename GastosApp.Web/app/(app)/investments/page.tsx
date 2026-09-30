import { requireAdminSession } from "@/lib/auth/guards";
import { InvestmentsClient } from "./investments-client";

export default async function InvestmentsPage() {
  await requireAdminSession();
  return <InvestmentsClient />;
}
