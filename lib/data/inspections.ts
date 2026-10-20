import { createClient } from "@/lib/supabase/client";



export interface PartPhoto {
  id: string;
  partId: string;
  slot: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  uploadedBy: string;
  createdAt: string;
}

function mapPhoto(r: Record<string, unknown>): PartPhoto {
  return {
    id: r.id as string,
    partId: r.part_id as string,
    slot: (r.slot as string) ?? "Overall",
    storagePath: (r.storage_path as string) ?? "",
    fileName: (r.file_name as string) ?? "",
    mimeType: (r.mime_type as string) ?? "",
    uploadedBy: (r.uploaded_by as string) ?? "",
    createdAt: (r.created_at as string) ?? "",
  };
}

export async function fetchPartPhotos(partIds: string[]): Promise<PartPhoto[]> {
  if (partIds.length === 0) return [];
  const { data, error } = await createClient()
    .from("part_inspection_files")
    .select("*")
    .in("part_id", partIds)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapPhoto);
}

export async function uploadPartPhoto(partId: string, slot: string, file: File, uploadedBy: string): Promise<PartPhoto> {
  const sb = createClient();
  const safe = file.name.replace(/[^\w.-]+/g, "_");
  const path = `inspections/${partId}/${crypto.randomUUID().slice(0, 8)}_${safe}`;
  const up = await sb.storage.from("builds").upload(path, file, { contentType: file.type || undefined });
  if (up.error) throw up.error;
  const { data, error } = await sb
    .from("part_inspection_files")
    .insert({ part_id: partId, slot, storage_path: path, file_name: file.name, mime_type: file.type, uploaded_by: uploadedBy })
    .select("*")
    .single();
  if (error) throw error;
  return mapPhoto(data as Record<string, unknown>);
}

export async function deletePartPhoto(photo: PartPhoto): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("part_inspection_files").delete().eq("id", photo.id);
  if (error) throw error;
  await sb.storage.from("builds").remove([photo.storagePath]); // best-effort
}


export async function partPhotoUrl(storagePath: string): Promise<string> {
  const { data, error } = await createClient().storage.from("builds").createSignedUrl(storagePath, 3600);
  if (error) throw error;
  return data.signedUrl;
}
