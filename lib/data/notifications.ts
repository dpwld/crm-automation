import { createClient } from "@/lib/supabase/client";
import type { AppNotification } from "@/types/domain";



function mapNotification(r: Record<string, unknown>): AppNotification {
  return {
    id: r.id as string,
    userKey: (r.user_key as string) ?? "",
    actorKey: (r.actor_key as string) ?? "",
    kind: (r.kind as string) ?? "mention",
    title: (r.title as string) ?? "",
    body: (r.body as string) ?? "",
    link: (r.link as string) ?? "",
    read: !!r.read,
    createdAt: (r.created_at as string) ?? "",
  };
}


export async function fetchMyNotifications(userKey: string, limit = 20): Promise<AppNotification[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from("notifications")
    .select("*")
    .eq("user_key", userKey)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(mapNotification);
}

export async function countUnreadNotifications(userKey: string): Promise<number> {
  const sb = createClient();
  const { count, error } = await sb
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_key", userKey)
    .eq("read", false);
  if (error) throw error;
  return count ?? 0;
}

export async function markNotificationRead(id: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("notifications").update({ read: true }).eq("id", id);
  if (error) throw error;
}

export async function markAllNotificationsRead(userKey: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("notifications").update({ read: true }).eq("user_key", userKey).eq("read", false);
  if (error) throw error;
}


export async function insertMentionNotifications(rows: {
  recipients: string[];
  actorKey: string;
  title: string;
  body: string;
  link: string;
}): Promise<void> {
  if (rows.recipients.length === 0) return;
  const sb = createClient();
  const { error } = await sb.from("notifications").insert(
    rows.recipients.map((userKey) => ({
      user_key: userKey,
      actor_key: rows.actorKey,
      kind: "mention",
      title: rows.title,
      body: rows.body,
      link: rows.link,
    })),
  );
  if (error) throw error;
}
