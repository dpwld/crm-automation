"use client";

import { useRef, useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ds/core/Button";
import { EmojiPicker } from "@/components/common/EmojiPicker";
import { TEAM_MEMBERS } from "@/lib/mock/team";
import { UserAvatar } from "@/components/common/UserAvatar";

interface Suggestion {
  key: string;
  fullName: string;
  title: string;
}

const MEMBERS: Suggestion[] = TEAM_MEMBERS
  .map((m) => ({ key: m.id, fullName: m.fullName, title: m.title }));


function mentionQueryAt(text: string, caret: number): { start: number; query: string } | null {
  const upto = text.slice(0, caret);
  const at = upto.lastIndexOf("@");
  if (at === -1) return null;
  if (at > 0 && !/[\s([{]/.test(upto[at - 1])) return null; // @ must start a word
  const query = upto.slice(at + 1);
  if (/[\n@]/.test(query) || query.length > 20) return null;
  return { start: at, query };
}


export function MentionComposer({
  avatarName,
  placeholder = "Add a comment…  (@name to mention)",
  onSubmit,
}: {
  avatarName?: string;
  placeholder?: string;
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const [sug, setSug] = useState<{ start: number; items: Suggestion[]; index: number } | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  function refreshSuggestions(next: string, caret: number) {
    const q = mentionQueryAt(next, caret);
    if (!q) {
      setSug(null);
      return;
    }
    const items = MEMBERS.filter((m) => m.fullName.toLowerCase().startsWith(q.query.toLowerCase()));
    setSug(items.length ? { start: q.start, items, index: 0 } : null);
  }

  function pick(s: Suggestion) {
    const ta = taRef.current;
    const caret = ta?.selectionStart ?? text.length;
    const first = s.fullName.split(" ")[0];
    const next = text.slice(0, sug!.start) + "@" + first + " " + text.slice(caret);
    setText(next);
    setSug(null);
    requestAnimationFrame(() => {
      if (ta) {
        const pos = sug!.start + first.length + 2;
        ta.focus();
        ta.setSelectionRange(pos, pos);
      }
    });
  }

  function submit() {
    const t = text.trim();
    if (!t) return;
    onSubmit(t);
    setText("");
    setSug(null);
  }

  
  function insertEmoji(emoji: string) {
    const ta = taRef.current;
    const start = ta?.selectionStart ?? text.length;
    const end = ta?.selectionEnd ?? start;
    setText(text.slice(0, start) + emoji + text.slice(end));
    requestAnimationFrame(() => {
      if (ta) {
        const pos = start + emoji.length;
        ta.focus();
        ta.setSelectionRange(pos, pos);
      }
    });
  }

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start", position: "relative" }}>
      {avatarName && <UserAvatar name={avatarName} size="sm" />}
      <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
        {sug && (
          <div className="sx-anim-pop"
            style={{
              position: "absolute", bottom: "100%", left: 0, marginBottom: 6, minWidth: 220, zIndex: 30,
              background: "var(--surface-card)", border: "1px solid var(--border-default)", borderRadius: 10,
              boxShadow: "var(--shadow-lg, 0 8px 24px rgba(0,0,0,.12))", overflow: "hidden",
            }}
          >
            {sug.items.map((s, i) => (
              <button
                key={s.key}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); pick(s); }}
                style={{
                  display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 10px",
                  border: "none", cursor: "pointer", textAlign: "left",
                  background: i === sug.index ? "var(--surface-hover, rgba(0,0,0,.05))" : "transparent",
                }}
              >
                <UserAvatar memberKey={s.key} size="xs" />
                <span style={{ fontSize: "var(--text-sm)", color: "var(--text-strong)", fontWeight: 500 }}>{s.fullName}</span>
                {s.title && <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-subtle)" }}>{s.title}</span>}
              </button>
            ))}
          </div>
        )}
        <textarea
          ref={taRef}
          rows={2}
          value={text}
          placeholder={placeholder}
          onChange={(e) => {
            setText(e.target.value);
            refreshSuggestions(e.target.value, e.target.selectionStart ?? e.target.value.length);
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return; // 한글 IME 조합 Enter 이중 처리 방지
            if (sug) {
              if (e.key === "ArrowDown") { e.preventDefault(); setSug({ ...sug, index: (sug.index + 1) % sug.items.length }); return; }
              if (e.key === "ArrowUp") { e.preventDefault(); setSug({ ...sug, index: (sug.index - 1 + sug.items.length) % sug.items.length }); return; }
              if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pick(sug.items[sug.index]); return; }
              if (e.key === "Escape") { setSug(null); return; }
            }
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
          }}
          onBlur={() => setSug(null)}
          style={{
            width: "100%", resize: "none", padding: "8px 10px", borderRadius: 10,
            border: "1px solid var(--border-default)", background: "var(--surface-default)",
            fontSize: "var(--text-sm)", color: "var(--text-default)", fontFamily: "inherit", lineHeight: 1.45,
          }}
        />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        <EmojiPicker compact direction="up" onPick={insertEmoji} />
        <Button variant="soft" size="sm" iconOnly aria-label="Post comment" disabled={!text.trim()} onClick={submit}>
          <Send size={14} />
        </Button>
      </div>
    </div>
  );
}
