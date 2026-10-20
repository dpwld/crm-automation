import { createClient } from "@/lib/supabase/client";



export interface RegistryPart {
  id: string;
  serial: number;
  partCode: string;
  regDate: string;
  customer: string;
  internalLabel: string;
  descriptor: string;
  stlName: string;
  status: string;
  testResult: "" | "success" | "fail";
  adopted: boolean;
  notes: string;
  createdByKey: string;
  createdAt: string;
}


function mapPart(r: Record<string, unknown>): RegistryPart {
  return {
    id: r.id as string,
    serial: Number(r.serial ?? 0),
    partCode: (r.part_code as string) ?? "",
    regDate: (r.reg_date as string) ?? "",
    customer: (r.customer as string) ?? "House",
    internalLabel: (r.internal_label as string) ?? "",
    descriptor: (r.descriptor as string) ?? "",
    stlName: (r.stl_name as string) ?? "",
    status: (r.status as string) ?? "",
    testResult: ((r.test_result as string) ?? "") as RegistryPart["testResult"],
    adopted: !!r.adopted,
    notes: (r.notes as string) ?? "",
    createdByKey: (r.created_by_key as string) ?? "",
    createdAt: (r.created_at as string) ?? "",
  };
}

export async function fetchRegistryParts(): Promise<RegistryPart[]> {
  const { data, error } = await createClient()
    .from("registry_parts").select("*").order("serial", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapPart);
}

export interface NewRegistryPart { customer:string; internalLabel:string; descriptor:string; notes:string }

export async function insertRegistryPart(input: NewRegistryPart, meId: string): Promise<RegistryPart> {
  const sb = createClient();
  const { data: serialData, error: serialErr } = await sb.rpc("next_registry_serial");
  if (serialErr) throw serialErr;
  const serial = Number(serialData);
  const yy = String(new Date().getFullYear()).slice(-2);
  const partCode = `DOC-${yy}-${serial}`;
  const { data, error } = await sb
    .from("registry_parts")
    .insert({
      serial,
      part_code: partCode,
      customer: input.customer,
      internal_label: input.internalLabel,
      descriptor: input.descriptor,
      stl_name: `${partCode}.stl`,
      notes: input.notes,
      created_by_key: meId,
    })
    .select("*").single();
  if (error) throw error;
  return mapPart(data as Record<string, unknown>);
}

export async function updateRegistryPart(id: string, patch: Partial<Pick<RegistryPart, "status" | "notes" | "internalLabel" | "testResult" | "adopted">>): Promise<RegistryPart> {
  const db: Record<string, unknown> = {};
  if (patch.status !== undefined) db.status = patch.status;
  if (patch.notes !== undefined) db.notes = patch.notes;
  if (patch.internalLabel !== undefined) db.internal_label = patch.internalLabel;
  if (patch.testResult !== undefined) db.test_result = patch.testResult;
  if (patch.adopted !== undefined) db.adopted = patch.adopted;
  const { data, error } = await createClient()
    .from("registry_parts").update(db).eq("id", id).select("*").single();
  if (error) throw error;
  return mapPart(data as Record<string, unknown>);
}
