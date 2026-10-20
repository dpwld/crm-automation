import { createClient } from "@/lib/supabase/client";



export interface GlobalComment {
  id: string;
  authorKey: string;
  body: string;
  createdAt: string;
}

function mapRow(r: Record<string, unknown>): GlobalComment {
  return {
    id: r.id as string,
    authorKey: (r.author_key as string) ?? "",
    body: (r.body as string) ?? "",
    createdAt: (r.created_at as string) ?? "",
  };
}

export async function fetchGlobalComments(limit = 10): Promise<GlobalComment[]> {
  const { data, error } = await createClient()
    .from("global_comments")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

export async function insertGlobalComment(authorKey: string, body: string): Promise<GlobalComment> {
  const { data, error } = await createClient()
    .from("global_comments")
    .insert({ author_key: authorKey, body })
    .select("*")
    .single();
  if (error) throw error;
  return mapRow(data as Record<string, unknown>);
}

export async function deleteGlobalComment(id: string): Promise<void> {
  const { error } = await createClient().from("global_comments").delete().eq("id", id);
  if (error) throw error;
}
