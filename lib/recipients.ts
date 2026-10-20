

export type RecipientSource = "context" | "team" | "recent" | "contacts";
export type Recipient = { name: string; email: string; source: RecipientSource; note?: string };

export const EMAIL_RE = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;

const SOURCE_RANK: Record<RecipientSource, number> = { context: 0, team: 1, recent: 2, contacts: 3 };


export function matchScore(r: Pick<Recipient, "name" | "email">, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const email = r.email.toLowerCase();
  const name = r.name.toLowerCase();
  if (email === q) return 100;
  if (email.startsWith(q)) return 90;
  if (name.startsWith(q)) return 85;
  const words = [...name.split(/\s+/), ...email.split("@")[0].split(/[._-]/)].filter(Boolean);
  if (words.some((w) => w.startsWith(q))) return 70;
  if (name.includes(q) || email.includes(q)) return 40;
  return 0;
}


export function rankRecipients(pools: Recipient[], query: string, exclude: string[], limit = 8): Recipient[] {
  const taken = new Set(exclude.map((e) => e.toLowerCase()));
  const seen = new Map<string, Recipient>();
  for (const r of pools) {
    const key = r.email.toLowerCase();
    if (!EMAIL_RE.test(r.email) || taken.has(key)) continue;
    const prev = seen.get(key);
    if (!prev || SOURCE_RANK[r.source] < SOURCE_RANK[prev.source]) seen.set(key, { ...r, name: r.name || prev?.name || "" });
  }
  return [...seen.values()]
    .map((r) => ({ r, s: matchScore(r, query) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || SOURCE_RANK[a.r.source] - SOURCE_RANK[b.r.source] || a.r.name.localeCompare(b.r.name))
    .slice(0, limit)
    .map((x) => x.r);
}


export function parseAddresses(raw: string): { emails: string[]; rest: string } {
  const emails: string[] = [];
  const rest: string[] = [];
  for (const part of raw.split(/[,;\n]+/)) {
    const p = part.trim();
    if (!p) continue;
    const angle = p.match(/<([^>]+)>/);
    const candidates = angle ? [angle[1].trim()] : p.split(/\s+/);
    for (const c of candidates) (EMAIL_RE.test(c) ? emails : rest).push(c);
  }
  return { emails: [...new Set(emails)], rest: rest.join(" ") };
}

// ── 최근 보낸 주소 (브라우저별) ──
let recent:Recipient[]=[];
export function recentRecipients():Recipient[]{return recent;}
export async function loadRecentRecipients(){const {fetchAppSettingJson}=await import('./data/settings');const saved=await fetchAppSettingJson<{name:string;email:string}[]>('recent_recipients');recent=(saved||[]).filter(r=>EMAIL_RE.test(r.email)).map(r=>({...r,source:'recent' as const}));}
export function rememberRecipients(list:{name?:string;email:string}[]):void {recent=[...list.filter(r=>EMAIL_RE.test(r.email)).map(r=>({name:r.name||'',email:r.email,source:'recent' as const})),...recent].filter((r,i,all)=>all.findIndex(x=>x.email.toLowerCase()===r.email.toLowerCase())===i).slice(0,40);void import('./data/settings').then(({saveAppSettingJson})=>saveAppSettingJson('recent_recipients',recent.map(({name,email})=>({name,email})))).catch(error=>console.error('Recent-recipient preference could not be saved',error));}
