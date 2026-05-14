import type { Category } from "@/lib/contracts/categories";
import type { Merchant } from "@/lib/contracts/merchants";
import type { Subcategory } from "@/lib/contracts/subcategories";
import type { Tag } from "@/lib/contracts/tags";
import type { BillableParty } from "@/lib/contracts/billable-parties";

export type CatalogsResponse = {
  categories: Category[];
  subcategories: Subcategory[];
  merchants: Merchant[];
  tags: Tag[];
  billableParties: BillableParty[];
};

export type CatalogSectionKey = "categories" | "subcategories" | "merchants" | "tags" | "billableParties";
