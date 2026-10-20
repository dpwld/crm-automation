import type { User } from "@/types/domain";

// Access checks retained by the CRM's document handoff and NDA controls.
export function canAccess(tool: "admin" | "finance" | "nda", user: User): boolean {
  if (user.role === "admin") return true;
  const override = user.toolAccess?.[tool];
  if (typeof override === "boolean") return override;
  return user.defaultAccess?.[tool] === true;
}

export const NDA_COUNTERSIGN_KEY = "nda:countersign";
export function canCountersignNda(user: User): boolean {
  return user.role === "admin" || (canAccess("nda", user) && user.toolAccess?.[NDA_COUNTERSIGN_KEY] === true);
}

export const RESTRICTED_SECTORS = ["Aerospace"] as const;

export const sectorAccessKey = (sector: string) => `sector:${sector}`;

export function isSectorRestricted(sector: string): boolean {
  return (RESTRICTED_SECTORS as readonly string[]).includes(sector);
}

export function canSeeSector(sector: string, user: User): boolean {
  if (!isSectorRestricted(sector)) return true;
  if (user.role === "admin") return true;
  return user.toolAccess?.[sectorAccessKey(sector)] === true;
}


export function allowedSectors(all: string[], user: User): string[] {
  return all.filter((s) => canSeeSector(s, user));
}
