import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { attachSessionCookie, fetchApiWithAutoRefresh } from "@/lib/auth/api-session";
import { getServerSession } from "@/lib/auth/session";
import { unauthorized, upstreamError } from "@/lib/bff/http";
import { normalizeAccounts } from "@/lib/contracts/accounts";
import { normalizeCategories } from "@/lib/contracts/categories";
import { normalizeSubcategories } from "@/lib/contracts/subcategories";
import { normalizeMerchants } from "@/lib/contracts/merchants";
import { normalizeTags } from "@/lib/contracts/tags";
import { normalizeBillableParties } from "@/lib/contracts/billable-parties";

export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return unauthorized();
  }
  let authSession = session;
  const accountsCall = await fetchApiWithAutoRefresh(authSession, `${getApiBaseUrl()}/api/accounts/active`, { method: "GET", cache: "no-store" });
  authSession = accountsCall.session;
  if (!accountsCall.response.ok) return upstreamError(undefined, accountsCall.response.status, accountsCall.response.status === 401 ? "Session expired" : "Failed to fetch catalogs");

  const categoriesCall = await fetchApiWithAutoRefresh(authSession, `${getApiBaseUrl()}/api/categories/active`, { method: "GET", cache: "no-store" });
  authSession = categoriesCall.session;
  if (!categoriesCall.response.ok) return upstreamError(undefined, categoriesCall.response.status, categoriesCall.response.status === 401 ? "Session expired" : "Failed to fetch catalogs");

  const subcategoriesCall = await fetchApiWithAutoRefresh(authSession, `${getApiBaseUrl()}/api/subcategories?onlyActive=true`, { method: "GET", cache: "no-store" });
  authSession = subcategoriesCall.session;
  if (!subcategoriesCall.response.ok) return upstreamError(undefined, subcategoriesCall.response.status, subcategoriesCall.response.status === 401 ? "Session expired" : "Failed to fetch catalogs");

  const merchantsCall = await fetchApiWithAutoRefresh(authSession, `${getApiBaseUrl()}/api/merchants?onlyActive=true`, { method: "GET", cache: "no-store" });
  authSession = merchantsCall.session;
  if (!merchantsCall.response.ok) return upstreamError(undefined, merchantsCall.response.status, merchantsCall.response.status === 401 ? "Session expired" : "Failed to fetch catalogs");

  const tagsCall = await fetchApiWithAutoRefresh(authSession, `${getApiBaseUrl()}/api/tags?onlyActive=true`, { method: "GET", cache: "no-store" });
  authSession = tagsCall.session;
  if (!tagsCall.response.ok) return upstreamError(undefined, tagsCall.response.status, tagsCall.response.status === 401 ? "Session expired" : "Failed to fetch catalogs");

  const billablePartiesCall = await fetchApiWithAutoRefresh(authSession, `${getApiBaseUrl()}/api/BillableParties?onlyActive=true`, { method: "GET", cache: "no-store" });
  authSession = billablePartiesCall.session;
  if (!billablePartiesCall.response.ok) return upstreamError(undefined, billablePartiesCall.response.status, billablePartiesCall.response.status === 401 ? "Session expired" : "Failed to fetch catalogs");

  const rawAccounts = await accountsCall.response.json();
  const rawCategories = await categoriesCall.response.json();
  const rawSubcategories = await subcategoriesCall.response.json();
  const rawMerchants = await merchantsCall.response.json();
  const rawTags = await tagsCall.response.json();
  const rawBillableParties = await billablePartiesCall.response.json();

  const accounts = normalizeAccounts(rawAccounts);
  const categories = normalizeCategories(rawCategories);
  const subcategories = normalizeSubcategories(rawSubcategories);
  const merchants = normalizeMerchants(rawMerchants);
  const tags = normalizeTags(rawTags);
  const billableParties = normalizeBillableParties(rawBillableParties);

  const out = NextResponse.json({
    accounts,
    categories,
    subcategories,
    merchants,
    tags,
    billableParties,
    categoriesByType: {
      income: categories.filter((category) => category.type === "income"),
      expense: categories.filter((category) => category.type === "expense"),
      transfer: categories.filter((category) => category.type === "transfer")
    }
  });
  await attachSessionCookie(out, authSession, session);
  return out;
}
