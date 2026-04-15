import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { getServerSession } from "@/lib/auth/session";
import { normalizeAccounts } from "@/lib/contracts/accounts";
import { normalizeCategories } from "@/lib/contracts/categories";
import { normalizeSubcategories } from "@/lib/contracts/subcategories";
import { normalizeMerchants } from "@/lib/contracts/merchants";
import { normalizeTags } from "@/lib/contracts/tags";

export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const baseHeaders = {
    Authorization: `Bearer ${session.accessToken}`,
    "Content-Type": "application/json"
  };

  const [accountsResponse, categoriesResponse, subcategoriesResponse, merchantsResponse, tagsResponse] = await Promise.all([
    fetch(`${getApiBaseUrl()}/api/accounts/active`, {
      method: "GET",
      headers: baseHeaders,
      cache: "no-store"
    }),
    fetch(`${getApiBaseUrl()}/api/categories/active`, {
      method: "GET",
      headers: baseHeaders,
      cache: "no-store"
    }),
    fetch(`${getApiBaseUrl()}/api/subcategories?onlyActive=true`, {
      method: "GET",
      headers: baseHeaders,
      cache: "no-store"
    }),
    fetch(`${getApiBaseUrl()}/api/merchants?onlyActive=true`, {
      method: "GET",
      headers: baseHeaders,
      cache: "no-store"
    }),
    fetch(`${getApiBaseUrl()}/api/tags?onlyActive=true`, {
      method: "GET",
      headers: baseHeaders,
      cache: "no-store"
    })
  ]);

  if (!accountsResponse.ok || !categoriesResponse.ok || !subcategoriesResponse.ok || !merchantsResponse.ok || !tagsResponse.ok) {
    const status = [accountsResponse.status, categoriesResponse.status, subcategoriesResponse.status, merchantsResponse.status, tagsResponse.status].includes(401)
      ? 401
      : Math.max(accountsResponse.status, categoriesResponse.status, subcategoriesResponse.status, merchantsResponse.status, tagsResponse.status);

    const message = status === 401 ? "Session expired" : "Failed to fetch catalogs";
    return NextResponse.json({ message }, { status });
  }

  const rawAccounts = await accountsResponse.json();
  const rawCategories = await categoriesResponse.json();
  const rawSubcategories = await subcategoriesResponse.json();
  const rawMerchants = await merchantsResponse.json();
  const rawTags = await tagsResponse.json();

  const accounts = normalizeAccounts(rawAccounts);
  const categories = normalizeCategories(rawCategories);
  const subcategories = normalizeSubcategories(rawSubcategories);
  const merchants = normalizeMerchants(rawMerchants);
  const tags = normalizeTags(rawTags);

  return NextResponse.json({
    accounts,
    categories,
    subcategories,
    merchants,
    tags,
    categoriesByType: {
      income: categories.filter((category) => category.type === "income"),
      expense: categories.filter((category) => category.type === "expense"),
      transfer: categories.filter((category) => category.type === "transfer")
    }
  });
}
