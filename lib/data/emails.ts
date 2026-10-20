import { createClient } from "@/lib/supabase/client";



export interface CrmEmail {
  id: string;
  companyId: string;
  direction: "inbound" | "outbound";
  subject: string;
  fromAddr: string;
  toAddrs: string;
  sentAt: string | null;
  snippet: string;
  
  dealId: string | null;
  
  matchStatus: "auto" | "review" | "confirmed";
  
  recordStatus: "pending" | "accepted" | "excluded";
  
  messageId: string;
  
  mailbox: string;
  
  aiBrief: EmailAiBrief | null;
  
  bodyText: string;
  
  firstContact: boolean;
}


export interface EmailAiBrief {
  summary: string;
  keyPoints: string[];
  attachments: { name: string; gist: string }[];
  suggestedReply: string;
  
  partial: boolean;
  at?: string;
}

export async function fetchEmails(companyId: string): Promise<CrmEmail[]> {
  // select * — deal 컬럼(2026-09-16b SQL) 미실행 DB에서도 기존 컬럼만으로 동작한다.
  const { data, error } = await createClient()
    .from("crm_emails")
    .select("*")
    .eq("company_id", companyId)
    .order("sent_at", { ascending: false, nullsFirst: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id as string,
    companyId: r.company_id as string,
    direction: r.direction as CrmEmail["direction"],
    subject: (r.subject as string) ?? "",
    fromAddr: (r.from_addr as string) ?? "",
    toAddrs: (r.to_addrs as string) ?? "",
    sentAt: (r.sent_at as string) ?? null,
    snippet: (r.snippet as string) ?? "",
    dealId: (r.deal_id as string) ?? null,
    matchStatus: ((r.match_status as string) ?? "auto") as CrmEmail["matchStatus"],
    recordStatus: ((r.record_status as string) ?? "accepted") as CrmEmail["recordStatus"],
    messageId: (r.message_id as string) ?? "",
    mailbox: (r.mailbox as string) ?? "",
    aiBrief: (r.ai_brief as EmailAiBrief | null) ?? null,
    bodyText: (r.body_text as string) ?? "",
    firstContact: !!r.first_contact,
  }));
}


export async function confirmEmailDeal(id: string, dealId: string | null): Promise<void> {
  const { error } = await createClient()
    .from("crm_emails")
    .update({ deal_id: dealId, match_status: "confirmed" })
    .eq("id", id);
  if (error) throw error;
}


export function awaitingReplyDays(emails: CrmEmail[]): number | null {
  const latest = emails.find((e) => e.sentAt);
  if (!latest || latest.direction !== "outbound" || !latest.sentAt) return null;
  return Math.floor((Date.now() - new Date(latest.sentAt).getTime()) / 86400000);
}


export async function setEmailFirstContact(id: string, on: boolean): Promise<void> {
  const { error } = await createClient().from("crm_emails").update({ first_contact: on }).eq("id", id);
  if (error) throw error;
}


export async function setEmailRecordStatus(id: string, status: "accepted" | "excluded"): Promise<void> {
  const { error } = await createClient().from("crm_emails").update({ record_status: status }).eq("id", id);
  if (error) throw error;
}


export async function reassignEmailCompany(id: string, companyId: string): Promise<void> {
  const { error } = await createClient().from("crm_emails").update({ company_id: companyId, record_status: "pending" }).eq("id", id);
  if (error) throw error;
}
