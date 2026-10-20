import {currentSpecSchema} from "@/lib/crm/specSchema";
import { createClient } from "@/lib/supabase/client";
import type { Build, BuildChecklistItem, BuildFile, BuildStatus } from "@/types/domain";




function modelSpecTemplate(): Record<string, Record<string, string>> {
 const model:Record<string,Record<string,string>>={};
 for(const f of currentSpecSchema().fields)(model[f.section]??={})[f.parameter]='';
 return model;
}
function checklistTemplate(): BuildChecklistItem[] {
 return currentSpecSchema().fields.map(f=>({label:`${f.section} · ${f.parameter}`,done:false,note:''}));
}

function mapBuild(r: Record<string, unknown>): Build {
  return {
    id: r.id as string,
    companyId: r.company_id as string,
    dealId: (r.deal_id as string) ?? null,
    sourceSpecVersionId: (r.source_spec_version_id as string) ?? null,
    modelCode: (r.model_code as string) ?? "",
    status: (r.status as BuildStatus) ?? "design",
    ownerKey: (r.owner_key as string) ?? "",
    modelSpec: (r.model_spec as Record<string, Record<string, string>>) ?? {},
    checklist: (r.checklist as BuildChecklistItem[]) ?? [],
    notes: (r.notes as string) ?? "",
    createdBy: (r.created_by as string) ?? "",
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function mapFile(r: Record<string, unknown>): BuildFile {
  return {
    id: r.id as string,
    buildId: r.build_id as string,
    view: (r.view as string) ?? "",
    storagePath: r.storage_path as string,
    fileName: (r.file_name as string) ?? "",
    mimeType: (r.mime_type as string) ?? "",
    fileSize: (r.file_size as number) ?? null,
    uploadedBy: (r.uploaded_by as string) ?? "",
    createdAt: r.created_at as string,
  };
}

export async function fetchBuilds(companyId: string): Promise<Build[]> {
  const { data, error } = await createClient()
    .from("builds")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapBuild);
}


export async function fetchAllBuilds(): Promise<Build[]> {
  const { data, error } = await createClient()
    .from("builds")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapBuild);
}

export async function insertBuild(companyId: string, modelCode: string, createdBy: string, modelSpec?: Record<string, Record<string, string>>, source?: { dealId: string | null; specVersionId: string }): Promise<Build> {
  const sb = createClient();
  const { data, error } = await sb
    .from("builds")
    .insert({
      company_id: companyId,
      model_code: modelCode,
      model_spec: modelSpec ?? modelSpecTemplate(),
      checklist: checklistTemplate(),
      created_by: createdBy,
      owner_key: createdBy,
      ...(source ? { deal_id: source.dealId, source_spec_version_id: source.specVersionId } : {}),
    })
    .select("*")
    .single();
  // A repeated handoff reopens the existing build; never reset its edited specs/checklist.
  if (error?.code === "23505" && source) {
    const { data: existing, error: lookupError } = await sb.from("builds")
      .select("*").eq("source_spec_version_id", source.specVersionId).maybeSingle();
    if (lookupError) throw lookupError;
    if (existing) return mapBuild(existing as Record<string, unknown>);
  }
  if (error) throw error;
  return mapBuild(data as Record<string, unknown>);
}

export async function updateBuild(id: string, patch: Record<string, unknown>): Promise<Build> {
  const { data, error } = await createClient()
    .from("builds")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return mapBuild(data as Record<string, unknown>);
}

export async function deleteBuild(build: Build, files: BuildFile[]): Promise<void> {
  const sb = createClient();
  if (files.length) {
    await sb.storage.from("builds").remove(files.map((f) => f.storagePath)); // best-effort
  }
  const { error } = await sb.from("builds").delete().eq("id", build.id);
  if (error) throw error;
}

export async function fetchBuildFiles(buildIds: string[]): Promise<BuildFile[]> {
  if (!buildIds.length) return [];
  const { data, error } = await createClient()
    .from("build_files")
    .select("*")
    .in("build_id", buildIds)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapFile);
}


export async function uploadBuildFile(buildId: string, file: File, uploadedBy: string, view = ""): Promise<BuildFile> {
  const sb = createClient();
  const safe = file.name.replace(/[^\w.-]+/g, "_");
  const path = `${buildId}/${crypto.randomUUID().slice(0, 8)}_${safe}`;
  const up = await sb.storage.from("builds").upload(path, file, { contentType: file.type || undefined });
  if (up.error) throw up.error;

  const { data, error } = await sb
    .from("build_files")
    .insert({
      build_id: buildId,
      storage_path: path,
      file_name: file.name,
      mime_type: file.type,
      file_size: file.size,
      uploaded_by: uploadedBy,
      view,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapFile(data as Record<string, unknown>);
}


export async function buildFileUrl(storagePath: string): Promise<string> {
  const { data, error } = await createClient().storage.from("builds").createSignedUrl(storagePath, 3600);
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteBuildFile(file: BuildFile): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("build_files").delete().eq("id", file.id);
  if (error) throw error;
  await sb.storage.from("builds").remove([file.storagePath]); // best-effort
}
