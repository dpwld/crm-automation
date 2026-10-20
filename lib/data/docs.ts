import { createClient } from "@/lib/supabase/client";
import type { DocItem, DocKind } from "@/types/domain";



export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

function mapItem(r: Record<string, unknown>): DocItem {
  return {
    id: r.id as string,
    kind: r.kind as DocKind,
    category: (r.category as string) ?? "business",
    folder: (r.folder as string) ?? "",
    title: (r.title as string) ?? "",
    description: (r.description as string) ?? "",
    tags: (r.tags as string[]) ?? [],
    url: (r.url as string) ?? "",
    storagePath: (r.storage_path as string) ?? "",
    fileName: (r.file_name as string) ?? "",
    fileSize: (r.file_size as number) ?? null,
    mimeType: (r.mime_type as string) ?? "",
    content: (r.content as string) ?? "",
    createdByKey: (r.created_by_key as string) ?? "",
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export async function fetchFolderFiles(category: string, folder: string): Promise<DocItem[]> {
  const { data, error } = await createClient()
    .from("doc_items")
    .select("*")
    .eq("category", category)
    .eq("folder", folder)
    .eq("kind", "file")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapItem);
}

export interface DocInput {
  kind: DocKind;
  category: string;
  
  folder?: string;
  title: string;
  description: string;
  tags: string[];
  url?: string;
  storagePath?: string;
  fileName?: string;
  fileSize?: number | null;
  mimeType?: string;
  content?: string;
  createdByKey: string;
}

export async function insertDoc(input: DocInput): Promise<DocItem> {
  const { data, error } = await createClient()
    .from("doc_items")
    .insert({
      kind: input.kind,
      category: input.category,
      // folder 컬럼(2026-09-07 SQL) 미실행 DB 보호 — 폴더 지정 시에만 보낸다.
      ...(input.folder ? { folder: input.folder } : {}),
      title: input.title,
      description: input.description,
      tags: input.tags,
      url: input.url ?? "",
      storage_path: input.storagePath ?? "",
      file_name: input.fileName ?? "",
      file_size: input.fileSize ?? null,
      mime_type: input.mimeType ?? "",
      content: input.content ?? "",
      created_by_key: input.createdByKey,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapItem(data as Record<string, unknown>);
}

export async function uploadDocFile(file: File, category: string): Promise<string> {
  // Storage keys must be ASCII-safe (Hangul/tildes → "Invalid key"); the real
  // name is preserved in the file_name column. Sanitise the key only.
  const safe = file.name.replace(/[^\w.-]+/g, "_");
  const path = `${category}/${crypto.randomUUID().slice(0, 8)}_${safe}`;
  const { error } = await createClient().storage.from("docs").upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (error) throw error;
  return path;
}


export async function docFileUrl(storagePath: string): Promise<string> {
  const { data, error } = await createClient().storage.from("docs").createSignedUrl(storagePath, 3600);
  if (error) throw error;
  return data.signedUrl;
}


export async function uploadDocItemImage(file: File): Promise<string> {
  const safe = file.name.replace(/[^\w.-]+/g, "_");
  const path = `doc-items/${crypto.randomUUID().slice(0, 8)}_${safe}`;
  const { error } = await createClient().storage.from("docs").upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (error) throw error;
  return path;
}


export async function lineItemImageUrl(storagePath: string): Promise<string> {
  const bucket = storagePath.startsWith("doc-items/") ? "docs" : "builds";
  const { data, error } = await createClient().storage.from(bucket).createSignedUrl(storagePath, 3600);
  if (error) throw error;
  return data.signedUrl;
}
