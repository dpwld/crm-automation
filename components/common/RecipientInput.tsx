"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { fetchContacts } from "@/lib/data/customers";
import { MEMBER_EMAIL, TEAM_MEMBERS } from "@/lib/mock/team";
import { EMAIL_RE, parseAddresses, rankRecipients, recentRecipients, type Recipient } from "@/lib/recipients";



const TEAM_POOL: Recipient[] = TEAM_MEMBERS.flatMap((m) =>
  MEMBER_EMAIL[m.id] ? [{ name: m.fullName, email: MEMBER_EMAIL[m.id], source: "team" as const }] : [],
);

// 전체 고객 연락처는 처음 포커스할 때 한 번만 읽는다 (페이지 안 여러 입력칸이 공유).
let contactsCache: Promise<Recipient[]> | null = null;
function allContacts(): Promise<Recipient[]> {
  contactsCache ??= fetchContacts()
    .then((list) => list.filter((c) => c.email).map((c) => ({ name: c.name, email: c.email, source: "contacts" as const, note: c.companyName })))
    .catch(() => { contactsCache = null; return []; });
  return contactsCache;
}

const SOURCE_LABEL: Record<Recipient["source"], string> = { context: "This company", team: "Team", recent: "Recent", contacts: "Contacts" };

export function RecipientInput({
  label, values, onChange, suggestions = [], placeholder, single = false, onPick, id,
}: {
  label?: string;
  values: string[];
  onChange: (next: string[]) => void;
  
  suggestions?: { name: string; email: string }[];
  placeholder?: string;
  
  single?: boolean;
  
  onPick?: (r: { name: string; email: string }) => void;
  id?: string;
}) {
  const autoId = useId();
  const inputId = id ?? `rcpt-${autoId}`;
  const listId = `${inputId}-list`;
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [contacts, setContacts] = useState<Recipient[]>([]);
  const [recent, setRecent] = useState<Recipient[]>([]);
  const wrap = useRef<HTMLDivElement>(null);

  const names = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of [...contacts, ...recent, ...TEAM_POOL, ...suggestions.map((s) => ({ ...s, source: "context" as const }))]) {
      if (r.name) m.set(r.email.toLowerCase(), r.name);
    }
    return m;
  }, [contacts, recent, suggestions]);

  // 빈 칸에서는 이 화면 맥락(회사 담당자)과 최근 주소만 — 팀 전체가 펼쳐져 아래 칸을 가리지 않게.
  const options = useMemo(() => rankRecipients(
    text.trim()
      ? [...suggestions.map((s) => ({ ...s, source: "context" as const })), ...TEAM_POOL, ...recent, ...contacts]
      : [...suggestions.map((s) => ({ ...s, source: "context" as const })), ...recent],
    text, single ? [] : values, text.trim() ? 8 : 6,
  ), [suggestions, recent, contacts, text, values, single]);
  const activeIndex = Math.min(active, Math.max(0, options.length - 1));

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function focusLoad() {
    setOpen(true);
    setRecent(recentRecipients());
    void allContacts().then(setContacts);
  }

  function add(emails: string[], picked?: Recipient) {
    if (!emails.length) return;
    if (single) onChange([emails[0]]);
    else onChange([...values, ...emails.filter((e) => !values.some((v) => v.toLowerCase() === e.toLowerCase()))]);
    if (picked) onPick?.({ name: picked.name, email: picked.email });
    setText("");
    setActive(0);
  }

  function commitTyped(): boolean {
    const { emails, rest } = parseAddresses(text);
    if (!emails.length) return false;
    add(emails);
    setText(rest);
    return true;
  }

  return (
    <div ref={wrap} className="sx-rcpt">
      {label && <label htmlFor={inputId} className="sx-rcpt__label">{label}</label>}
      <div className="sx-rcpt__box" onClick={() => document.getElementById(inputId)?.focus()}>
        {values.map((v) => (
          <span key={v} className="sx-rcpt__chip" title={v}>
            <span className="sx-rcpt__chip-text">{names.get(v.toLowerCase()) ?? v}</span>
            <button type="button" aria-label={`Remove ${v}`} onClick={(e) => { e.stopPropagation(); onChange(values.filter((x) => x !== v)); }}>
              <X size={11} />
            </button>
          </span>
        ))}
        <input
          id={inputId}
          value={text}
          placeholder={values.length ? "" : placeholder}
          autoComplete="off"
          role="combobox"
          aria-expanded={open && options.length > 0}
          aria-controls={listId}
          aria-activedescendant={open && options[activeIndex] ? `${listId}-${activeIndex}` : undefined}
          className="sx-rcpt__input"
          onFocus={focusLoad}
          onBlur={() => { commitTyped(); setOpen(false); }}
          onChange={(e) => { setText(e.target.value); setActive(0); setOpen(true); }}
          onPaste={(e) => {
            const pasted = e.clipboardData.getData("text");
            if (/[,;\n]|@.*@/.test(pasted)) { e.preventDefault(); const { emails, rest } = parseAddresses(text + pasted); add(emails); setText(rest); }
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" && options.length) { e.preventDefault(); setOpen(true); setActive((i) => (i + 1) % options.length); }
            else if (e.key === "ArrowUp" && options.length) { e.preventDefault(); setActive((i) => (i - 1 + options.length) % options.length); }
            else if ((e.key === "Enter" || e.key === "Tab") && open && text.trim() && options[activeIndex]) {
              e.preventDefault(); const o = options[activeIndex]; add([o.email], o);
            } else if (e.key === "Enter" || e.key === "," || e.key === ";") {
              if (text.trim()) { e.preventDefault(); commitTyped(); } else if (e.key === "Enter" && open && options[activeIndex]) { e.preventDefault(); const o = options[activeIndex]; add([o.email], o); }
            } else if (e.key === "Escape") { setOpen(false); }
            else if (e.key === "Backspace" && !text && values.length) onChange(values.slice(0, -1));
          }}
        />
      </div>
      {open && options.length > 0 && (
        <div id={listId} role="listbox" className="sx-rcpt__list">
          {options.map((o, i) => (
            <button
              key={o.email}
              id={`${listId}-${i}`}
              type="button"
              role="option"
              aria-selected={i === activeIndex}
              className="sx-rcpt__opt"
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => { e.preventDefault(); add([o.email], o); }}
            >
              <span className="sx-rcpt__opt-name">{o.name || o.email}</span>
              <span className="sx-rcpt__opt-mail">{o.name ? o.email : ""}{o.note ? ` · ${o.note}` : ""}</span>
              <span className="sx-rcpt__opt-src">{SOURCE_LABEL[o.source]}</span>
            </button>
          ))}
        </div>
      )}
      {text.trim() && !EMAIL_RE.test(text.trim()) && open && options.length === 0 && (
        <div className="sx-rcpt__hint">No match. Type the full address and press Enter.</div>
      )}
    </div>
  );
}
