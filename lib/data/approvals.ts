import { createClient } from "@/lib/supabase/client";
import type { ChangeRequest, ChangeStatus, ChangeTargetKind } from "@/types/domain";



function mapRequest(r: Record<string, unknown>): ChangeRequest {
  return {
    id: r.id as string,
    companyId: r.company_id as string,
    targetKind: r.target_kind as ChangeTargetKind,
    targetId: (r.target_id as string) ?? null,
    payload: (r.payload as Record<string, unknown>) ?? {},
    reason: (r.reason as string) ?? "",
    status: r.status as ChangeStatus,
    requestedByKey: (r.requested_by_key as string) ?? "",
    requestedAt: (r.requested_at as string) ?? "",
    decidedByKey: (r.decided_by_key as string) ?? null,
    decidedAt: (r.decided_at as string) ?? null,
    decisionNote: (r.decision_note as string) ?? null,
  };
}


export async function fetchChangeRequests(): Promise<{ pending: ChangeRequest[]; decided: ChangeRequest[] }> {
  const sb = createClient();
  const [pendingRes, decidedRes] = await Promise.all([
    sb.from("change_requests").select("*").eq("status", "pending").order("requested_at", { ascending: true }),
    sb.from("change_requests").select("*").neq("status", "pending").order("decided_at", { ascending: false }).limit(20),
  ]);
  const err = pendingRes.error || decidedRes.error;
  if (err) throw err;
  return {
    pending: (pendingRes.data ?? []).map(mapRequest),
    decided: (decidedRes.data ?? []).map(mapRequest),
  };
}

export async function countPendingRequests(): Promise<number> {
  const sb = createClient();
  const { count, error } = await sb
    .from("change_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  if (error) throw error;
  return count ?? 0;
}

export interface ChangeRequestInput {
  companyId: string;
  targetKind: ChangeTargetKind;
  targetId: string | null;
  payload: Record<string, unknown>;
  reason: string;
  requestedByKey: string;
  
  autoApprove?: boolean;
}

export async function requestChange(input: ChangeRequestInput): Promise<ChangeRequest> {
  const response=await fetch('/api/crm/change-request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});const result=await response.json() as ChangeRequest & {error?:string};if(!response.ok)throw new Error(result.error||'Change request failed.');return result;
}


export async function decideChange(id: string, approve: boolean, deciderKey: string, note?: string): Promise<ChangeRequest> {
  const sb = createClient();
  const { data, error } = await sb
    .from("change_requests")
    .update({
      status: approve ? "approved" : "rejected",
      decided_by_key: deciderKey,
      decided_at: new Date().toISOString(),
      decision_note: note ?? null,
    })
    .eq("id", id)
    .eq("status", "pending")
    .select("*")
    .single();
  if (error) throw error;
  return mapRequest(data);
}


export async function cancelChange(id: string): Promise<void> {
  const { error } = await createClient()
    .from("change_requests")
    .delete()
    .eq("id", id)
    .eq("status", "pending");
  if (error) throw error;
}
