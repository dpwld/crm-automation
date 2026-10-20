import type { Company, Stage } from "@/types/domain";



export const STAGE_ORDER: Stage[] = ["lead", "in_review", "spec", "quoted", "won", "lost"];

export const STAGE_LABEL: Record<Stage, string> = {
  lead: "Lead",
  in_review: "In review",
  spec: "Spec",
  quoted: "Quoted",
  won: "Won",
  lost: "Lost",
};


export const STAGE_TONE: Record<Stage, "neutral" | "warning" | "info" | "success" | "danger"> = {
  lead: "neutral",
  in_review: "warning",
  spec: "info",
  quoted: "info",
  won: "success",
  lost: "danger",
};

export const COMPANIES: Company[] = [];
export const DEFAULT_COMPANY_ID = "";
