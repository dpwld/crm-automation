"use client";

import { useEffect, useRef, useState } from "react";
import { SmilePlus } from "lucide-react";
import type { Reaction } from "@/types/domain";
import { EMOJI_SET } from "@/lib/data/reactions";
import { memberName } from "@/lib/mock/team";



const chipStyle = (mine: boolean): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "1px 8px",
  borderRadius: "var(--radius-pill)",
  border: `1px solid ${mine ? "var(--color-primary)" : "var(--border-subtle)"}`,
  background: mine ? "color-mix(in srgb, var(--color-primary) 10%, transparent)" : "var(--surface-sunken)",
  cursor: "pointer",
  fontSize: "var(--text-xs)",
  lineHeight: "18px",
  color: "var(--text-default)",
});

export function ReactionBar({
  reactions,
  myId,
  onToggle,
}: {
  reactions: Reaction[];
  myId: string;
  
  onToggle: (emoji: string, on: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const sorted = [...reactions].sort((a, b) => b.userIds.length - a.userIds.length);

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", marginTop: 6 }}>
      {sorted.map((r) => {
        const mine = r.userIds.includes(myId);
        return (
          <button
            key={r.emoji}
            type="button"
            title={r.userIds.map(memberName).join(", ")}
            onClick={() => onToggle(r.emoji, !mine)}
            style={chipStyle(mine)}
          >
            <span>{r.emoji}</span>
            <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600, color: mine ? "var(--color-primary)" : "var(--text-muted)" }}>
              {r.userIds.length}
            </span>
          </button>
        );
      })}
      <button
        type="button"
        aria-label="Add reaction"
        onClick={() => setOpen((v) => !v)}
        style={{ ...chipStyle(false), padding: "2px 7px", color: "var(--text-muted)" }}
      >
        <SmilePlus size={13} />
      </button>
      {open && (
        <div className="sx-anim-pop"
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            left: 0,
            zIndex: 40,
            display: "grid",
            gridTemplateColumns: "repeat(6, 30px)",
            gap: 2,
            padding: 6,
            background: "var(--surface-card)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-md)",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          {EMOJI_SET.map((emoji) => {
            const mine = reactions.find((r) => r.emoji === emoji)?.userIds.includes(myId) ?? false;
            return (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  onToggle(emoji, !mine);
                  setOpen(false);
                }}
                style={{
                  border: "none",
                  background: mine ? "var(--surface-sunken)" : "none",
                  borderRadius: "var(--radius-sm)",
                  cursor: "pointer",
                  fontSize: 17,
                  lineHeight: "28px",
                  padding: 0,
                }}
              >
                {emoji}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
