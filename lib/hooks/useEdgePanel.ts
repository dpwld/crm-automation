"use client";

import { useEffect, useRef, useState } from "react";



const OPEN_DELAY = 120;   // 지나가는 커서에 열리지 않게
const CLOSE_DELAY = 220;  // 패널로 건너가는 사이에 닫히지 않게

export function useEdgePanel(storageKey: string, enabled = true) {
  const [pinnedPref, setPinnedPref] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try { return window.localStorage.getItem(storageKey) === "1"; } catch { return false; }
  });
  const [open, setOpen] = useState(false);
  const timer = useRef<number | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);

  const floating = enabled && !pinnedPref;

  const cancel = () => {
    if (timer.current != null) { window.clearTimeout(timer.current); timer.current = null; }
  };
  
  const busy = () => {
    const panel = panelRef.current;
    if (!panel) return false;
    const active = document.activeElement;
    const typing = !!active && panel.contains(active)
      && (active.matches("input, textarea, select") || (active as HTMLElement).isContentEditable);
    return typing || !!panel.querySelector('[role="dialog"]');
  };
  const show = () => { cancel(); timer.current = window.setTimeout(() => setOpen(true), OPEN_DELAY); };
  const hide = () => {
    cancel();
    timer.current = window.setTimeout(() => { if (!busy()) setOpen(false); }, CLOSE_DELAY);
  };
  const openNow = () => { cancel(); setOpen(true); };
  const close = () => { cancel(); setOpen(false); };

  // 떠 있는 동안: 바깥을 누르거나 Esc를 누르면 닫는다
  useEffect(() => {
    if (!floating || !open) return;
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [floating, open]);

  useEffect(() => cancel, []);

  const togglePin = () => {
    const next = !pinnedPref;
    cancel();
    setPinnedPref(next);
    setOpen(false);
    try { window.localStorage.setItem(storageKey, next ? "1" : "0"); } catch {  }
  };

  return {
    
    floating,
    
    open: floating && open,
    
    pinned: pinnedPref,
    togglePin, show, hide, cancel, openNow, close, panelRef,
  };
}
