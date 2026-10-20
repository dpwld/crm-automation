import { createClient } from "@/lib/supabase/client";



export interface FollowUp {
  id: string;
  companyId: string | null;
  dealId: string | null;
  title: string;
  
  dueDate: string | null;
  ownerKey: string;
  done: boolean;
  createdByKey: string;
  createdAt: string;
}

function mapRow(r: Record<string, unknown>): FollowUp {
  return {
    id: r.id as string,
    companyId: (r.company_id as string | null) ?? null,
    dealId: (r.deal_id as string | null) ?? null,
    title: (r.title as string) ?? "",
    dueDate: (r.due_date as string | null) ?? null,
    ownerKey: (r.owner_key as string) ?? "",
    done: Boolean(r.done),
    createdByKey: (r.created_by_key as string) ?? "",
    createdAt: (r.created_at as string) ?? "",
  };
}


export async function fetchFollowUps(companyId?: string): Promise<FollowUp[]> {
  let query = createClient().from("crm_followups").select("*");
  if (companyId) query = query.eq("company_id", companyId);
  const { data, error } = await query
    .order("done", { ascending: true })
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

export interface FollowUpInput {
  companyId: string | null;
  dealId?: string | null;
  title: string;
  dueDate?: string | null;
  ownerKey: string;
  createdByKey: string;
}

export async function insertFollowUp(input: FollowUpInput): Promise<FollowUp> {
  const { data, error } = await createClient()
    .from("crm_followups")
    .insert({
      company_id: input.companyId,
      deal_id: input.dealId ?? null,
      title: input.title,
      due_date: input.dueDate ?? null,
      owner_key: input.ownerKey,
      created_by_key: input.createdByKey,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapRow(data);
}

export async function setFollowUpDone(id: string, done: boolean): Promise<void> {
  const { error } = await createClient()
    .from("crm_followups")
    .update({ done, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteFollowUp(id: string): Promise<void> {
  const { error } = await createClient().from("crm_followups").delete().eq("id", id);
  if (error) throw error;
}
