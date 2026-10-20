"use client";

import type { KeyboardEvent } from "react";
import { Redo2, Undo2 } from "lucide-react";
import { Button } from "@/components/ds/core/Button";

type HistoryActions = { undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean };
type Actions = { history: HistoryActions; onSave: () => void; onCancel: () => void; busy?: boolean; saveLabel?: string };

export function editorKeys(e: KeyboardEvent<HTMLElement>, { history, onSave, onCancel, busy }: Actions) {
  if (e.defaultPrevented || e.nativeEvent.isComposing || e.keyCode === 229 || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  if (mod && (key === "z" || key === "y")) {
    if ((e.target as HTMLElement).closest("[data-native-undo]")) return;
    e.preventDefault();
    e.stopPropagation();
    if (!busy) (key === "y" || e.shiftKey ? history.redo : history.undo)();
  } else if (mod && e.key === "Enter") {
    e.preventDefault();
    e.stopPropagation();
    if (!busy) onSave();
  } else if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    if (!busy) onCancel();
  }
}

export function EditorActions({ history, onSave, onCancel, busy = false, saveLabel = "Save changes" }: Actions) {
  return <div style={{ position: "sticky", top: 0, zIndex: 5, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, padding: "10px 0", background: "var(--surface-card)", borderBottom: "1px solid var(--border-subtle)" }}>
    <Button type="button" size="sm" variant="secondary" leftIcon={<Undo2 size={13} />} disabled={busy || !history.canUndo} title="Undo edit (Ctrl/⌘ Z)" onClick={history.undo}>Undo</Button>
    <Button type="button" size="sm" variant="secondary" leftIcon={<Redo2 size={13} />} disabled={busy || !history.canRedo} title="Redo edit (Ctrl/⌘ Shift Z)" onClick={history.redo}>Redo</Button>
    <span style={{ flex: 1, fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>Tab to move · Esc to cancel · Ctrl/⌘ Enter to save</span>
    <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onCancel}>Cancel</Button>
    <Button type="button" size="sm" loading={busy} onClick={onSave}>{saveLabel}</Button>
  </div>;
}
