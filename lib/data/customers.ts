import { createClient } from "@/lib/supabase/client";



export type CustomerSpace = "engineering" | "crm";
export type ContactLogKind = "note" | "call" | "email" | "meeting";

export interface CustomerContact {
  id: string;
  space: CustomerSpace;
  
  companyId: string | null;
  
  companyName: string;
  
  category: string;
  country: string;
  
  stageNote: string;
  name: string;
  title: string;
  email: string;
  phone: string;
  memo: string;
  createdByKey: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContactLog {
  id: string;
  contactId: string;
  kind: ContactLogKind;
  body: string;
  
  logDate: string;
  authorKey: string;
  
  dealId: string | null;
  
  step: "targeting" | "first_contact";
  createdAt: string;
}

function mapContact(r: Record<string, unknown>): CustomerContact {
  return {
    id: r.id as string,
    space: r.space as CustomerSpace,
    companyId: (r.company_id as string | null) ?? null,
    companyName: (r.company_name as string) ?? "",
    category: (r.category as string) ?? "",
    country: (r.country as string) ?? "",
    stageNote: (r.stage_note as string) ?? "",
    name: (r.name as string) ?? "",
    title: (r.title as string) ?? "",
    email: (r.email as string) ?? "",
    phone: (r.phone as string) ?? "",
    memo: (r.memo as string) ?? "",
    createdByKey: (r.created_by_key as string) ?? "",
    createdAt: (r.created_at as string) ?? "",
    updatedAt: (r.updated_at as string) ?? "",
  };
}

function mapLog(r: Record<string, unknown>): ContactLog {
  return {
    id: r.id as string,
    contactId: r.contact_id as string,
    kind: r.kind as ContactLogKind,
    body: (r.body as string) ?? "",
    logDate: (r.log_date as string) ?? "",
    authorKey: (r.author_key as string) ?? "",
    dealId: (r.deal_id as string) ?? null,
    step: ((r.step as string) === "targeting" ? "targeting" : "first_contact"),
    createdAt: (r.created_at as string) ?? "",
  };
}

// ---- Contacts ----


export async function fetchContacts(): Promise<CustomerContact[]> {
  const { data, error } = await createClient()
    .from("customer_contacts")
    .select("*")
    .in("space", ["crm", "engineering"])
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapContact);
}


export async function fetchCompanyContacts(companyId: string, companyName: string, space?: CustomerSpace): Promise<CustomerContact[]> {
  const sb = createClient();
  const spaces = space ? [space] : ["crm", "engineering"];
  const [linked, byName] = await Promise.all([
    sb.from("customer_contacts").select("*").eq("company_id", companyId).in("space", spaces),
    companyName.trim()
      ? sb.from("customer_contacts").select("*").is("company_id", null).ilike("company_name", companyName.trim()).in("space", spaces)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (linked.error) throw linked.error;
  if (byName.error) throw byName.error;
  return [...(linked.data ?? []), ...(byName.data ?? [])]
    .map(mapContact)
    .sort((a, b) => a.name.localeCompare(b.name));
}


export async function fetchCompanyContactEmails(companyId: string): Promise<{ name: string; email: string }[]> {
  const { data, error } = await createClient()
    .from("customer_contacts")
    .select("name, email")
    .eq("company_id", companyId)
    .in("space", ["crm", "engineering"])
    .neq("email", "")
    .order("name", { ascending: true });
  if (error) throw error;
  const seen = new Set<string>();
  return (data ?? [])
    .map((r) => ({ name: ((r.name as string) ?? "").trim(), email: ((r.email as string) ?? "").trim() }))
    .filter((c) => {
      const key = c.email.toLowerCase();
      if (!c.email.includes("@") || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}


export async function archiveContactsToVendor(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await createClient()
    .from("customer_contacts")
    .update({ space: "vendor", updated_at: new Date().toISOString() })
    .in("id", ids);
  if (error) throw error;
}

export interface ContactInput {
  space: CustomerSpace;
  companyId: string | null;
  companyName?: string;
  category?: string;
  country?: string;
  stageNote?: string;
  name: string;
  title: string;
  email: string;
  phone: string;
  createdByKey: string;
}

export async function insertContact(input: ContactInput): Promise<CustomerContact> {
  const { data, error } = await createClient()
    .from("customer_contacts")
    .insert({
      space: input.space,
      company_id: input.companyId,
      company_name: input.companyName ?? "",
      category: input.category ?? "",
      country: input.country ?? "",
      stage_note: input.stageNote ?? "",
      name: input.name,
      title: input.title,
      email: input.email,
      phone: input.phone,
      created_by_key: input.createdByKey,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapContact(data);
}

export async function updateContact(
  id: string,
  patch: Partial<
    Pick<
      CustomerContact,
      "companyId" | "companyName" | "category" | "country" | "stageNote" | "name" | "title" | "email" | "phone" | "memo"
    >
  >,
): Promise<CustomerContact> {
  const db: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.companyId != null) db.company_id = patch.companyId;
  if (patch.companyName != null) db.company_name = patch.companyName;
  if (patch.category != null) db.category = patch.category;
  if (patch.country != null) db.country = patch.country;
  if (patch.stageNote != null) db.stage_note = patch.stageNote;
  if (patch.name != null) db.name = patch.name;
  if (patch.title != null) db.title = patch.title;
  if (patch.email != null) db.email = patch.email;
  if (patch.phone != null) db.phone = patch.phone;
  if (patch.memo != null) db.memo = patch.memo;

  const { data, error } = await createClient()
    .from("customer_contacts")
    .update(db)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return mapContact(data);
}


export async function deleteContact(id: string): Promise<void> {
  const { error } = await createClient().from("customer_contacts").delete().eq("id", id);
  if (error) throw error;
}

// ---- Contact logs ----

export async function fetchContactLogs(contactId: string): Promise<ContactLog[]> {
  const { data, error } = await createClient()
    .from("contact_logs")
    .select("*")
    .eq("contact_id", contactId)
    .order("log_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapLog);
}

export interface ContactLogInput {
  contactId: string;
  kind: ContactLogKind;
  body: string;
  logDate: string;
  authorKey: string;
  
  space?: CustomerSpace;
  
  dealId?: string;
  
  step?: "targeting" | "first_contact";
}

export async function insertContactLog(input: ContactLogInput): Promise<ContactLog> {
  const sb = createClient();
  const base = {
    contact_id: input.contactId,
    kind: input.kind,
    body: input.body,
    log_date: input.logDate,
    author_key: input.authorKey,
  };
  const { data, error } = await sb
    .from("contact_logs")
    .insert({
      ...base,
      ...(input.space ? { space: input.space } : {}),
      ...(input.dealId ? { deal_id: input.dealId } : {}),
      ...(input.step === "targeting" ? { step: input.step } : {}),
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapLog(data);
}


export async function fetchLogsForContacts(contactIds: string[], space?: CustomerSpace): Promise<ContactLog[]> {
  if (contactIds.length === 0) return [];
  let query = createClient().from("contact_logs").select("*").in("contact_id", contactIds);
  if (space) query = query.eq("space", space);
  const { data, error } = await query.order("log_date", { ascending: false }).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapLog);
}

export async function deleteContactLog(id: string): Promise<void> {
  const { error } = await createClient().from("contact_logs").delete().eq("id", id);
  if (error) throw error;
}


export async function fetchLastLogDates(space: CustomerSpace): Promise<Record<string, string>> {
  const { data, error } = await createClient()
    .from("contact_logs")
    .select("contact_id, log_date, customer_contacts!inner(space)")
    .in("customer_contacts.space", ["crm", "engineering"])
    .eq("space", space);
  if (error) throw error;
  const out: Record<string, string> = {};
  for (const r of data ?? []) {
    const id = r.contact_id as string;
    const d = (r.log_date as string) ?? "";
    if (d && (!out[id] || d > out[id])) out[id] = d;
  }
  return out;
}

// ---- Customer requirement (읽기전용 요약) ----

export interface SpecSummaryRow {
  param: string;
  value: string;
}


export async function fetchCompanySpecSummary(companyId: string): Promise<SpecSummaryRow[]> {
  const { data, error } = await createClient()
    .from("company_specs")
    .select("parameter, merged, value, value_hot, value_cold")
    .eq("company_id", companyId)
    .order("sort", { ascending: true });
  if (error) throw error;
  const rows: SpecSummaryRow[] = [];
  for (const r of data ?? []) {
    const param = ((r.parameter as string) ?? "").trim();
    const value = r.merged
      ? ((r.value as string) ?? "").trim()
      : [(r.value_hot as string) ?? "", (r.value_cold as string) ?? ""]
          .map((s) => s.trim())
          .filter(Boolean)
          .join(" / ");
    if (param && value) rows.push({ param, value });
  }
  return rows;
}
