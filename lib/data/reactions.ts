import { createClient } from "@/lib/supabase/client";
import type { Reaction } from "@/types/domain";



export type ReactionKind = "board_post" | "board_comment" | "pm_comment";


export const EMOJI_SET = ["👍", "🙏", "🙌", "✅", "👀", "🎉", "😂", "❤️", "💪", "🔥", "😮", "😢"];

function groupRows(rows: Record<string, unknown>[]): Record<string, Reaction[]> {
  const byTarget: Record<string, Record<string, string[]>> = {};
  for (const r of rows) {
    const m = (byTarget[r.target_id as string] ??= {});
    (m[r.emoji as string] ??= []).push(r.user_key as string);
  }
  const out: Record<string, Reaction[]> = {};
  for (const [id, emojiMap] of Object.entries(byTarget)) {
    out[id] = Object.entries(emojiMap).map(([emoji, userIds]) => ({ emoji, userIds }));
  }
  return out;
}


export async function fetchEmojiReactions(kind: ReactionKind, ids?: string[]): Promise<Record<string, Reaction[]>> {
  if (ids && ids.length === 0) return {};
  let q = createClient().from("emoji_reactions").select("target_id, user_key, emoji").eq("kind", kind);
  if (ids) q = q.in("target_id", ids);
  const { data, error } = await q;
  if (error) throw error;
  return groupRows(data ?? []);
}


export async function setEmojiReaction(kind: ReactionKind, targetId: string, userKey: string, emoji: string, on: boolean): Promise<void> {
  const sb = createClient();
  if (on) {
    const { error } = await sb.from("emoji_reactions").insert({ kind, target_id: targetId, user_key: userKey, emoji });
    if (error && error.code !== "23505") throw error; // duplicate toggle = already on
  } else {
    const { error } = await sb
      .from("emoji_reactions")
      .delete()
      .eq("kind", kind)
      .eq("target_id", targetId)
      .eq("user_key", userKey)
      .eq("emoji", emoji);
    if (error) throw error;
  }
}


export function applyReaction(reactions: Reaction[], userKey: string, emoji: string, on: boolean): Reaction[] {
  const others = reactions.filter((r) => r.emoji !== emoji);
  const cur = reactions.find((r) => r.emoji === emoji);
  const userIds = new Set(cur?.userIds ?? []);
  if (on) userIds.add(userKey);
  else userIds.delete(userKey);
  return userIds.size ? [...others, { emoji, userIds: [...userIds] }] : others;
}
