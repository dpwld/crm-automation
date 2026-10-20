import { createClient } from "@/lib/supabase/client";
import type { CatalogItem } from "@/types/domain";



function mapItem(r: Record<string, unknown>): CatalogItem {
  return {
    id: r.id as string,
    modelCode: (r.model_code as string) ?? "",
    name: (r.name as string) ?? "",
    unit: (r.unit as string) ?? "pcs",
    unitPrice: Number(r.unit_price ?? 0),
    currency: (r.currency as string) ?? "USD",
    active: r.active !== false,
  };
}

export async function fetchCatalog(): Promise<CatalogItem[]> {
  const { data, error } = await createClient()
    .from("catalog_items")
    .select("*")
    .eq("active", true)
    .order("sort", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapItem);
}

export async function insertCatalogItem(input: Pick<CatalogItem, "name" | "unit" | "unitPrice" | "currency"> & { modelCode?: string }): Promise<CatalogItem> {
  const { data, error } = await createClient()
    .from("catalog_items")
    .insert({ name: input.name, unit: input.unit, unit_price: input.unitPrice, currency: input.currency, model_code: input.modelCode ?? "" })
    .select("*")
    .single();
  if (error) throw error;
  return mapItem(data);
}

export async function updateCatalogItem(id: string, patch: Partial<Pick<CatalogItem, "name" | "unit" | "unitPrice" | "modelCode" | "currency">>): Promise<void> {
  const db: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) db.name = patch.name;
  if (patch.unit !== undefined) db.unit = patch.unit;
  if (patch.unitPrice !== undefined) db.unit_price = patch.unitPrice;
  if (patch.modelCode !== undefined) db.model_code = patch.modelCode;
  if (patch.currency !== undefined) db.currency = patch.currency;
  const { error } = await createClient().from("catalog_items").update(db).eq("id", id);
  if (error) throw error;
}


export async function deactivateCatalogItem(id: string): Promise<void> {
  const { error } = await createClient().from("catalog_items").update({ active: false }).eq("id", id);
  if (error) throw error;
}
