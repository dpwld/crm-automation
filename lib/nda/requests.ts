import type {NdaKind,NdaFields} from "./template";
export type NdaRequestRow = {
  id: string; kind: NdaKind; company_id: string | null; fields: NdaFields;
  recipient_name: string; recipient_email: string; cc: string[]; subject: string; message: string;
  status: "sending" | "sent" | "viewed" | "signed" | "completed" | "declined" | "voided" | "failed";
  token_hash: string | null; expires_at: string | null; document_sha256: string;
  sent_by_email: string; sent_by_name: string; sent_at: string | null; viewed_at: string | null; viewed_ip: string | null;
  signer_name: string | null; signer_title: string | null; signer_tz: string | null; signature_png: string | null;
  signed_at: string | null; signer_ip: string | null; signer_ua: string | null;
  decline_reason: string | null; declined_at: string | null;
  countersigned_by: string | null; countersigned_at: string | null; final_doc_id: string | null;
  error: string; created_at: string;
};


export function listItem(r: NdaRequestRow) {
  const expired = (r.status === "sent" || r.status === "viewed") && !!r.expires_at && new Date(r.expires_at) < new Date();
  return {
    id: r.id, kind: r.kind, companyId: r.company_id, fields: r.fields,
    recipientName: r.recipient_name, recipientEmail: r.recipient_email, cc: r.cc,
    status: expired ? "expired" : r.status, expiresAt: r.expires_at,
    sentByEmail: r.sent_by_email, sentByName: r.sent_by_name, sentAt: r.sent_at, viewedAt: r.viewed_at,
    signerName: r.signer_name, signerTitle: r.signer_title, signedAt: r.signed_at,
    declineReason: r.decline_reason, declinedAt: r.declined_at,
    countersignedBy: r.countersigned_by, countersignedAt: r.countersigned_at, finalDocId: r.final_doc_id,
    error: r.error, createdAt: r.created_at,
  };
}
export type NdaRequestItem = ReturnType<typeof listItem>;
