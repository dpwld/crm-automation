import {readJson} from '@/lib/http';
import { TEAM_MEMBERS } from "@/lib/mock/team";
import { insertMentionNotifications } from "@/lib/data/notifications";



interface MentionPattern {
  key: string;
  
  names: string[];
}

const patterns = (): MentionPattern[] => TEAM_MEMBERS
  .map((m) => ({
    key: m.id,
    names: [m.fullName, m.fullName.split(" ")[0]].filter((n, i, a) => n && a.indexOf(n) === i),
  }));


export function extractMentionKeys(body: string): string[] {
  const lower = body.toLowerCase();
  const found: { key: string; at: number }[] = [];
  for (const p of patterns()) {
    let best = -1;
    for (const name of p.names) {
      const at = lower.indexOf("@" + name.toLowerCase());
      if (at !== -1 && (best === -1 || at < best)) best = at;
    }
    if (best !== -1) found.push({ key: p.key, at: best });
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.key);
}


export const MENTION_NAMES: string[] = [];


export function splitMentions(body: string): { text: string; mention: boolean }[] {
  MENTION_NAMES.splice(0, MENTION_NAMES.length, ...patterns().flatMap(p=>p.names).sort((a,b)=>b.length-a.length));
  if (!MENTION_NAMES.length || !body.includes("@")) return [{ text: body, mention: false }];
  const pattern = new RegExp(`@(?:${MENTION_NAMES.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  const out: { text: string; mention: boolean }[] = [];
  let last = 0;
  for (const m of body.matchAll(pattern)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ text: body.slice(last, at), mention: false });
    out.push({ text: m[0], mention: true });
    last = at + m[0].length;
  }
  if (last < body.length) out.push({ text: body.slice(last), mention: false });
  return out;
}


export interface EmailAttachment {
  filename: string;
  mimeType: string;
  dataBase64: string;
}


export async function notifyByEmail(opts: {
  recipients: string[];
  subject: string;
  bodyText?: string;
  
  attachments?: EmailAttachment[];
  
  cc?: string[];
  bcc?: string[];
  
  bodyHtml?: string;
  link?: string;
  
  external?: boolean;
}): Promise<{ sent?: number; error?: string } | null> {
  if (opts.recipients.length === 0) return null;
  try {
    const res = await fetch("/api/pm/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opts),
    });
    return (await readJson(res)) as { sent?: number; error?: string };
  } catch {
    return null;
  }
}


export async function notifyMentions(opts: { body: string; actorKey: string; title: string; link: string }): Promise<void> {
  const recipients = extractMentionKeys(opts.body).filter((k) => k !== opts.actorKey);
  if (recipients.length === 0) return;
  try {
    await insertMentionNotifications({
      recipients,
      actorKey: opts.actorKey,
      title: opts.title,
      body: opts.body.length > 140 ? opts.body.slice(0, 140) + "…" : opts.body,
      link: opts.link,
    });
  } catch (err) {
    console.error("mention notify failed:", err);
  }
  // 벨과 별개로 이메일도 발송 (Gmail 스코프·토큰이 없으면 서버가 스킵).
  void notifyByEmail({ recipients, subject: opts.title, bodyText: opts.body, link: opts.link });
}
