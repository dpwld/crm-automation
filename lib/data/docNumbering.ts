import { createClient } from "@/lib/supabase/client";



export const PO_PREFIX = "PO";
export const QUOTATION_PREFIX = "Q";
export const INVOICE_PREFIX = "INV";


export const PARTY_CODE_RE = /^[A-Z]{3}$/;

export async function nextScopedDocNo(prefix: string, scope: string): Promise<string> {
  const { data, error } = await createClient().rpc("next_scoped_doc_no", { p_prefix: prefix, p_scope: scope });
  if (error) throw error;
  return data as string;
}


export async function scopedCounterValue(prefix: string, scope: string): Promise<number> {
  const { data } = await createClient()
    .from("doc_counters")
    .select("last_nnn")
    .eq("scope", `${prefix.toUpperCase()}|${scope.toUpperCase()}`)
    .eq("year", new Date().getFullYear())
    .maybeSingle();
  return Number((data as { last_nnn?: number } | null)?.last_nnn ?? 0);
}
