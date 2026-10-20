"use client";

import { Avatar } from "@/components/ds/core/Avatar";
import { memberName } from "@/lib/mock/team";
import { useAvatarMap } from "@/lib/data/avatars";
import { usePresence } from "@/lib/presence";



export function UserAvatar({
  memberKey,
  name,
  size = "md",
  photo = true,
}: {
  memberKey?: string;
  name?: string;
  size?: "xs" | "sm" | "md" | "lg";
  
  photo?: boolean;
}) {
  const map = useAvatarMap();
  const online = usePresence();
  const display = name ?? (memberKey ? memberName(memberKey) : "?");
  const src = photo ? ((memberKey ? map.byKey[memberKey] : undefined) ?? map.byName[display.toLowerCase()] ?? null) : null;
  return <Avatar name={display} src={src} size={size} status={memberKey && online.has(memberKey) ? "online" : null} />;
}
