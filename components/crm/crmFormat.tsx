import type { Importance } from "@/types/domain";



export const IMPORTANCE_LABEL: Record<Importance, string> = {
  high: "High",
  med: "Medium",
  low: "Low",
};

export const IMPORTANCE_COLOR: Record<Importance, string> = {
  high: "var(--red-500)",
  med: "var(--amber-500)",
  low: "var(--gray-400)",
};

export function formatValue(value: number | null): string {
  if (value == null) return "N/A";
  return "$" + value.toLocaleString("en-US");
}


export function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

export function nowIso(): string {
  return new Date().toISOString();
}


export function formatRelative(iso: string): string {
  const d = new Date(iso);
  const t = d.getTime();
  if (Number.isNaN(t)) return iso;
  const sec = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (sec < 45) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  const wk = Math.round(day / 7);
  if (wk < 5) return `${wk}w ago`;
  return formatTimestamp(iso);
}
