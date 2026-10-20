"use client";

import { useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import { memberKeyForEmail } from "@/lib/mock/team";



export interface AvatarMap {
  byKey: Record<string, string>;
  byName: Record<string, string>;
}

const EMPTY: AvatarMap = { byKey: {}, byName: {} };
let cache: AvatarMap | null = null;
let inflight: Promise<AvatarMap> | null = null;
const listeners = new Set<() => void>();

async function fetchAvatarMap(): Promise<AvatarMap> {
  const { data, error } = await createClient()
    .from("profiles")
    .select("email, full_name, avatar_url")
    .not("avatar_url", "is", null);
  if (error) throw error;
  const map: AvatarMap = { byKey: {}, byName: {} };
  for (const r of data ?? []) {
    const url = r.avatar_url as string;
    if (!url) continue;
    const key = memberKeyForEmail((r.email as string) ?? "");
    if (key) map.byKey[key] = url;
    const name = ((r.full_name as string) ?? "").trim();
    if (name) map.byName[name.toLowerCase()] = url;
  }
  return map;
}

export function invalidateAvatarCache(): void {
  cache = null;
  inflight = null;
  void loadAvatarMap();
}

function loadAvatarMap(): Promise<AvatarMap> {
  inflight ??= fetchAvatarMap()
    .then((m) => {
      cache = m;
      listeners.forEach((fn) => fn());
      return m;
    })
    .catch((err) => {
      console.error("avatar map load failed:", err);
      return EMPTY;
    });
  return inflight;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  if (!cache) void loadAvatarMap();
  return () => { listeners.delete(cb); };
}


export function useAvatarMap(): AvatarMap {
  return useSyncExternalStore(subscribe, () => cache ?? EMPTY, () => EMPTY);
}
