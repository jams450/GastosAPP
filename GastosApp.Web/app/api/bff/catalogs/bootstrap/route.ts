import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { getServerSession } from "@/lib/auth/session";
import { normalizeCategories } from "@/lib/contracts/categories";
import { normalizeSubcategories } from "@/lib/contracts/subcategories";
import { normalizeMerchants } from "@/lib/contracts/merchants";
import { normalizeTags } from "@/lib/contracts/tags";

export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const headers = {
    Authorization: `Bearer ${session.accessToken}`,
    "Content-Type": "application/json"
  };

  const [categoriesRes, subcategoriesRes, merchantsRes, tagsRes] = await Promise.all([
    fetch(`${getApiBaseUrl()}/api/categories`, { method: "GET", headers, cache: "no-store" }),
    fetch(`${getApiBaseUrl()}/api/subcategories`, { method: "GET", headers, cache: "no-store" }),
    fetch(`${getApiBaseUrl()}/api/merchants`, { method: "GET", headers, cache: "no-store" }),
    fetch(`${getApiBaseUrl()}/api/tags`, { method: "GET", headers, cache: "no-store" })
  ]);

  const responses = [categoriesRes, subcategoriesRes, merchantsRes, tagsRes];
  const failed = responses.find((response) => !response.ok);
  if (failed) {
    const message = failed.status === 401 ? "Session expired" : "Failed to fetch catalogs";
    return NextResponse.json({ message }, { status: failed.status });
  }

  const [rawCategories, rawSubcategories, rawMerchants, rawTags] = await Promise.all([
    categoriesRes.json(),
    subcategoriesRes.json(),
    merchantsRes.json(),
    tagsRes.json()
  ]);

  const categories = normalizeCategories(rawCategories);
  const subcategories = normalizeSubcategories(rawSubcategories);
  const merchants = normalizeMerchants(rawMerchants);
  const tags = normalizeTags(rawTags);

  return NextResponse.json({
    categories,
    subcategories,
    merchants,
    tags
  });
}
