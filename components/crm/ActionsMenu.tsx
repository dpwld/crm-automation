"use client";

import { Children, type ReactNode } from "react";


export function ActionsMenu({ label, children }: { label: string; children: ReactNode }) {
  if (!Children.toArray(children).length) return null;
  return <details style={{ position: "relative", flexShrink: 0 }}
    onClick={(e) => {
      e.stopPropagation();
      if ((e.target as HTMLElement).closest("button")) {
        e.currentTarget.open = false;
        e.currentTarget.querySelector("summary")?.focus();
      }
    }}
    onKeyDown={(e) => {
      e.stopPropagation();
      const menu = e.currentTarget;
      if (e.key === "Escape") {
        e.preventDefault(); menu.open = false; menu.querySelector("summary")?.focus();
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault(); menu.open = true;
        const buttons = Array.from(menu.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = index < 0 ? (e.key === "ArrowDown" ? 0 : buttons.length - 1) : (index + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }
    }}
    onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) e.currentTarget.open = false; }}>
    <summary aria-label={label} style={{ cursor: "pointer", padding: "7px 10px", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", fontSize: "var(--text-xs)", fontWeight: 600 }}>More</summary>
    <div className="sx-anim-pop" style={{ position: "absolute", right: 0, top: "100%", zIndex: 20, minWidth: 190, padding: 6, display: "flex", flexDirection: "column", gap: 2, background: "var(--surface-card)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-lg)" }}>{children}</div>
  </details>;
}
