"use client";

import { useEffect, useRef, useState } from "react";
import { SmilePlus } from "lucide-react";



const INSERT_EMOJIS = [
  "📢", "📌", "💻", "📅", "🗓️", "🎉",
  "✅", "⚠️", "❗", "🔥", "💡", "🙌",
  "👍", "🙏", "🏢", "✈️", "🌴", "☀️",
  "❤️", "😊", "😂", "🎂", "💪", "💰",
];

export function EmojiPicker({
  onPick,
  compact = false,
  direction = "down",
}: {
  onPick: (emoji: string) => void;
  
  compact?: boolean;
  
  direction?: "down" | "up";
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

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        aria-label="Insert emoji"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        style={
          compact
            ? {
                display: "inline-grid", placeItems: "center", cursor: "pointer",
                border: "none", background: "none", padding: 6, borderRadius: "var(--radius-sm)",
                color: "var(--text-muted)",
              }
            : {
                display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer",
                border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-pill)",
                background: "var(--surface-sunken)", padding: "2px 8px", color: "var(--text-muted)",
                fontFamily: "var(--font-sans)", fontSize: "var(--text-xs)",
              }
        }
      >
        <SmilePlus size={compact ? 15 : 13} />{!compact && " Emoji"}
      </button>
      {open && (
        <div className="sx-anim-pop"
          style={{
            position: "absolute",
            ...(direction === "up" ? { bottom: "calc(100% + 6px)" } : { top: "calc(100% + 6px)" }),
            right: 0, zIndex: 60,
            display: "grid", gridTemplateColumns: "repeat(6, 30px)", gap: 2, padding: 6,
            background: "var(--surface-card)", border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-lg)",
          }}
        >
          {INSERT_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onPick(emoji);
                setOpen(false);
              }}
              style={{ border: "none", background: "none", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 17, lineHeight: "28px", padding: 0 }}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
