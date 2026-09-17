import { notFound } from "next/navigation";
import { requireAdminSession } from "@/lib/auth/guards";
import { parseAnnualSummaryYear } from "@/lib/contracts/account-annual-summary";
import { currentYearInMexicoCity } from "../_lib/accounts-annual-ui";
import { AccountAnnualSummaryClient } from "./account-annual-summary-client";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AccountAnnualSummaryPage({ params, searchParams }: PageProps) {
  await requireAdminSession();

  const { id } = await params;
  const accountId = Number(id);
  if (!Number.isInteger(accountId) || accountId <= 0) {
    notFound();
  }

  const query = await searchParams;
  const rawYear = Array.isArray(query.year) ? query.year[0] : query.year;
  // El año por defecto lo resuelve el backend con la misma zona horaria; el servidor sólo
  // necesita un valor para el primer render.
  const currentYear = currentYearInMexicoCity();

  return (
    <AccountAnnualSummaryClient
      accountId={accountId}
      initialYear={parseAnnualSummaryYear(rawYear, currentYear)}
      currentYear={currentYear}
    />
  );
}
