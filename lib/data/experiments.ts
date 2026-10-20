import {currentSpecSchema} from "@/lib/crm/specSchema";
import { createClient } from "@/lib/supabase/client";



export type ExperimentStatus = "draft" | "accepted" | "failed";

export interface DealExperiment {
  id: string;
  companyId: string;
  dealId: string | null;
  title: string;
  runOn: string | null;
  status: ExperimentStatus;
  measurements: {label:string;unit:string;isText:boolean;value:string}[];
  notes: string;
  createdByKey: string;
  createdAt: string;
}



function mapExperiment(r: Record<string, unknown>): DealExperiment {
  return {
    id: r.id as string,
    companyId: r.company_id as string,
    dealId: (r.deal_id as string) ?? null,
    title: (r.title as string) ?? "",
    runOn: (r.run_on as string) ?? null,
    status: ((r.status as string) ?? "draft") as ExperimentStatus,
    measurements: (r.measurements as DealExperiment['measurements']) ?? [],
    notes: (r.notes as string) ?? "",
    createdByKey: (r.created_by_key as string) ?? "",
    createdAt: (r.created_at as string) ?? "",
  };
}

export async function fetchExperiments(companyId: string): Promise<DealExperiment[]> {
  const { data, error } = await createClient()
    .from("deal_experiments")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapExperiment);
}

export interface ExperimentValues {
  title?: string;
  runOn?: string | null;
  measurements?:DealExperiment['measurements'];
  notes?: string;
}

function toDb(v: ExperimentValues): Record<string, unknown> {
  const db: Record<string, unknown> = {};
  if (v.title !== undefined) db.title = v.title;
  if (v.runOn !== undefined) db.run_on = v.runOn;
  if(v.measurements !== undefined)db.measurements=v.measurements;
  if (v.notes !== undefined) db.notes = v.notes;
  return db;
}

export async function insertExperiment(
  companyId: string, dealId: string | null, values: ExperimentValues, meId: string,
): Promise<DealExperiment> {
  const { data, error } = await createClient()
    .from("deal_experiments")
    .insert({ company_id: companyId, deal_id: dealId, created_by_key: meId, measurements:currentSpecSchema().fields.flatMap(f=>(f.merged?['']:f.columnLabels).map(c=>({label:`${f.parameter}${c?' · '+c:''}`,unit:f.unit,isText:f.isText,value:''}))), ...toDb(values) })
    .select("*")
    .single();
  if (error) throw error;
  return mapExperiment(data as Record<string, unknown>);
}

export async function updateExperiment(id: string, values: ExperimentValues): Promise<DealExperiment> {
  const { data, error } = await createClient()
    .from("deal_experiments")
    .update({ ...toDb(values), updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return mapExperiment(data as Record<string, unknown>);
}

export async function setExperimentStatus(id: string, status: ExperimentStatus): Promise<void> {
  const { error } = await createClient()
    .from("deal_experiments")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteExperiment(id: string): Promise<void> {
  const { error } = await createClient().from("deal_experiments").delete().eq("id", id);
  if (error) throw error;
}
