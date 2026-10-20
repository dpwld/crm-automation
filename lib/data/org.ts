import { createClient } from "@/lib/supabase/client";
import { COMPANY, COMPANY_REGISTERED_ADDRESS, DEFAULT_SHIP_TO_KR } from "@/lib/config/company";
import type { OrgSettings } from "@/types/domain";



export const ORG_FALLBACK: OrgSettings = {
  name: COMPANY.name,
  address: COMPANY.address,
  phone: COMPANY.phone,
  email: COMPANY.email,
  web: COMPANY.web,
  registeredAddress: COMPANY_REGISTERED_ADDRESS,
  addressKr: DEFAULT_SHIP_TO_KR,
};

function mapOrg(r: Record<string, unknown>): OrgSettings {
  return {
    name: (r.name as string) || ORG_FALLBACK.name,
    address: (r.address as string) ?? "",
    phone: (r.phone as string) ?? "",
    email: (r.email as string) ?? "",
    web: (r.web as string) ?? "",
    registeredAddress: (r.registered_address as string) ?? "",
    // 컬럼 추가 전(2026-08-11 SQL 미실행)에는 폴백 상수로 표시.
    addressKr: (r.address_kr as string) || DEFAULT_SHIP_TO_KR,
  };
}

export async function fetchOrgSettings(): Promise<OrgSettings> {
  const { data, error } = await createClient().from("org_settings").select("*").eq("id", 1).maybeSingle();
  if (error) throw error;
  return data ? mapOrg(data as Record<string, unknown>) : ORG_FALLBACK;
}

export async function saveOrgSettings(value: OrgSettings): Promise<void> {
  const { error } = await createClient().from("org_settings").upsert({
    id: 1,
    name: value.name,
    address: value.address,
    phone: value.phone,
    email: value.email,
    web: value.web,
    registered_address: value.registeredAddress,
    address_kr: value.addressKr,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}


let cached: OrgSettings | null = null;

export async function orgForPrint(): Promise<OrgSettings> {
  if (cached) return cached;
  try {
    cached = await fetchOrgSettings();
  } catch (err) {
    console.error("org_settings unavailable, printing with the built-in constants:", err);
    cached = ORG_FALLBACK;
  }
  return cached;
}


export function invalidateOrgCache(): void {
  cached = null;
}


let sigCached: string | null | undefined;

export async function fetchPoSignature(): Promise<string | null> {
  if (sigCached !== undefined) return sigCached;
  try {
    const { data } = await createClient().from("app_settings").select("value").eq("key", "po_signature").maybeSingle();
    const v = data?.value;
    sigCached = typeof v === "string" && v.startsWith("data:image/") ? v : null;
  } catch {
    sigCached = null;
  }
  return sigCached;
}
