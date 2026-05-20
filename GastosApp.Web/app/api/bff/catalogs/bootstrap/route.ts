import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { attachSessionCookie, fetchApiWithAutoRefresh } from "@/lib/auth/api-session";
import { getServerSession } from "@/lib/auth/session";
import { unauthorized, upstreamError } from "@/lib/bff/http";
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

  const categoriesCall = await fetchApiWithAutoRefresh(authSession, `${getApiBaseUrl()}/api/categories`, { method: "GET", cache: "no-store" });
  authSession = categoriesCall.session;
  if (!categoriesCall.response.ok) {
    const message = categoriesCall.response.status === 401 ? "Session expired" : "Failed to fetch catalogs";
    return upstreamError(undefined, categoriesCall.response.status, message);
  }

  const subcategoriesCall = await fetchApiWithAutoRefresh(authSession, `${getApiBaseUrl()}/api/subcategories`, { method: "GET", cache: "no-store" });
  authSession = subcategoriesCall.session;
  if (!subcategoriesCall.response.ok) {
    const message = subcategoriesCall.response.status === 401 ? "Session expired" : "Failed to fetch catalogs";
    return upstreamError(undefined, subcategoriesCall.response.status, message);
  }

  const merchantsCall = await fetchApiWithAutoRefresh(authSession, `${getApiBaseUrl()}/api/merchants`, { method: "GET", cache: "no-store" });
  authSession = merchantsCall.session;
  if (!merchantsCall.response.ok) {
    const message = merchantsCall.response.status === 401 ? "Session expired" : "Failed to fetch catalogs";
    return upstreamError(undefined, merchantsCall.response.status, message);
  }

  const tagsCall = await fetchApiWithAutoRefresh(authSession, `${getApiBaseUrl()}/api/tags`, { method: "GET", cache: "no-store" });
  authSession = tagsCall.session;
  if (!tagsCall.response.ok) {
    const message = tagsCall.response.status === 401 ? "Session expired" : "Failed to fetch catalogs";
    return upstreamError(undefined, tagsCall.response.status, message);
  }

  const billablePartiesCall = await fetchApiWithAutoRefresh(authSession, `${getApiBaseUrl()}/api/BillableParties`, { method: "GET", cache: "no-store" });
  authSession = billablePartiesCall.session;
  if (!billablePartiesCall.response.ok) {
    const message = billablePartiesCall.response.status === 401 ? "Session expired" : "Failed to fetch catalogs";
    return upstreamError(undefined, billablePartiesCall.response.status, message);
  }

  const [rawCategories, rawSubcategories, rawMerchants, rawTags, rawBillableParties] = await Promise.all([
    categoriesCall.response.json(),
    subcategoriesCall.response.json(),
    merchantsCall.response.json(),
    tagsCall.response.json(),
    billablePartiesCall.response.json()
  ]);

  const categories = normalizeCategories(rawCategories);
  const subcategories = normalizeSubcategories(rawSubcategories);
  const merchants = normalizeMerchants(rawMerchants);
  const tags = normalizeTags(rawTags);
  const billableParties = normalizeBillableParties(rawBillableParties);

  const out = NextResponse.json({
    categories,
    subcategories,
    merchants,
    tags,
    billableParties
  });
  await attachSessionCookie(out, authSession, session);
  return out;
}
