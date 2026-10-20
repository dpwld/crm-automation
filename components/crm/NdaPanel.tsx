"use client";

import { useEffect, useState } from "react";
import { ExternalLink, FileText, Paperclip, Send, Upload } from "lucide-react";
import { Alert } from "@/components/ds/feedback/Alert";
import { Button } from "@/components/ds/core/Button";
import { Card, CardBody } from "@/components/ds/data/Card";
import { Input } from "@/components/ds/forms/Input";
import { Select } from "@/components/ds/forms/Select";
import { Spinner } from "@/components/ds/core/Spinner";
import type { Company, DocItem } from "@/types/domain";
import { useCurrentUser } from "@/lib/auth/CurrentUserContext";
import {
  MAX_UPLOAD_BYTES, docFileUrl, fetchFolderFiles, insertDoc, uploadDocFile,
} from "@/lib/data/docs";
import { fetchCompanyContactEmails } from "@/lib/data/customers";
import { canCountersignNda } from "@/lib/auth/roles";
import { NdaSendModal, type NdaContact } from "@/components/nda/NdaSendModal";
import { NdaRequestsList } from "@/components/nda/NdaRequestsList";



const STATUS_OPTIONS: { value: NonNullable<Company["ndaStatus"]>; label: string }[] = [
  { value: "none", label: "Not started" },
  { value: "in_review", label: "In review" },
  { value: "signed", label: "Signed" },
];

const NDA_CATEGORY = "engineering";
const NDA_FOLDER = "NDA";

function errMsg(err: unknown): { text: string; code: string } {
  const e = err as { message?: string; code?: string } | null;
  return { text: e?.message ?? String(err), code: e?.code ?? "" };
}

function sizeLabel(bytes: number | null): string {
  if (!bytes) return "";
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function canInline(doc: DocItem): boolean {
  const t = doc.mimeType || "";
  return t === "application/pdf" || t.startsWith("image/") || /\.(pdf|png|jpe?g|gif|webp)$/i.test(doc.fileName);
}

export function NdaPanel({
  company,
  onPatch,
  onLogged,
}: {
  company: Company;
  
  onPatch: (patch: Partial<Company>) => Promise<void> | void;
  onLogged?: (summary: string) => void;
}) {
  const me = useCurrentUser();
  const [status, setStatus] = useState<NonNullable<Company["ndaStatus"]>>(company.ndaStatus ?? "none");
  const [signedOn, setSignedOn] = useState(company.ndaSignedOn ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // ── 체결본 파일 ──
  const [folderDocs, setFolderDocs] = useState<DocItem[] | null>(null);
  const [fileBusy, setFileBusy] = useState(false);
  const [fileError, setFileError] = useState("");
  const [choosing, setChoosing] = useState(false); // 연결된 파일이 있어도 교체용 목록 열기
  // 서명 URL은 문서 id로 키를 잡아 파생한다 (effect 내 동기 setState 금지 — React Compiler).
  const [preview, setPreview] = useState<{ docId: string; url: string } | null>(null);
  const [filesKey, setFilesKey] = useState(0);

  // ── 전자서명 요청 (2026-10-14) — Library에 가지 않고 이 단계에서 바로 발송 ──
  const [sendOpen, setSendOpen] = useState(false);
  const [contacts, setContacts] = useState<NdaContact[]>([]);
  const [requestsKey, setRequestsKey] = useState(0);

  const attached = company.ndaDocId ? (folderDocs ?? []).find((d) => d.id === company.ndaDocId) ?? null : null;
  const previewUrl = attached && preview?.docId === attached.id ? preview.url : null;

  useEffect(() => {
    let alive = true;
    fetchFolderFiles(NDA_CATEGORY, NDA_FOLDER)
      .then((list) => { if (alive) setFolderDocs(list); })
      .catch((err) => {
        console.error("nda folder load failed:", err);
        if (alive) { setFolderDocs([]); setFileError("Couldn't load the NDA folder — check your Library access."); }
      });
    return () => { alive = false; };
  }, [company.id, filesKey]);

  useEffect(() => {
    let alive = true;
    if (attached && attached.storagePath && canInline(attached)) {
      const docId = attached.id;
      docFileUrl(attached.storagePath)
        .then((url) => { if (alive) setPreview({ docId, url }); })
        .catch((err) => console.error("nda preview url failed:", err));
    }
    return () => { alive = false; };
  }, [attached]);

  async function openSend() {
    setContacts(await fetchCompanyContactEmails(company.id).catch(() => []));
    setSendOpen(true);
  }

  async function onSent(to: string) {
    setRequestsKey((k) => k + 1);
    onLogged?.(`NDA sent for e-signature to ${to}.`);
    if ((company.ndaStatus ?? "none") === "none") {
      setStatus("in_review");
      await Promise.resolve(onPatch({ ndaStatus: "in_review" })).catch((err) => console.error("nda status update failed:", err));
    }
  }

  // 서버가 회사 NDA 상태·체결일·파일을 이미 갱신했다 — 화면 상태만 맞춘다.
  async function onCompleted(signer: string, docId: string) {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
    setStatus("signed");
    setSignedOn(today);
    setFilesKey((k) => k + 1);
    onLogged?.(`NDA fully executed with ${signer} (e-signature). Saved to Library → Engineering → NDA.`);
    await Promise.resolve(onPatch({ ndaStatus: "signed", ndaSignedOn: today, ndaDocId: docId })).catch((err) => console.error("nda status sync failed:", err));
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await onPatch({ ndaStatus: status, ndaSignedOn: signedOn || null });
      onLogged?.(`NDA status set to ${STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status}${signedOn ? ` (signed ${signedOn})` : ""}.`);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      console.error("nda save failed:", err);
      setError("Couldn't save — if this keeps failing, run db/migrations/2026-09-17b_company_nda.sql first.");
    } finally {
      setSaving(false);
    }
  }

  function fileFail(err: unknown, verb: string) {
    console.error(`nda file ${verb} failed:`, err);
    const { text, code } = errMsg(err);
    if (code === "42501") {
      setFileError("You don't have Library edit access for Engineering (docs:write:engineering) — ask an admin to grant it.");
    } else if (text.includes("nda_doc_id") || code === "PGRST204") {
      setFileError("The database is missing the NDA-file column — run db/migrations/2026-09-17e_company_nda_file.sql first.");
    } else {
      setFileError(`Couldn't ${verb} the file — ${text}`);
    }
  }

  async function attachDoc(doc: DocItem) {
    if (fileBusy) return;
    setFileBusy(true);
    setFileError("");
    try {
      await onPatch({ ndaDocId: doc.id });
      onLogged?.(`NDA file attached: ${doc.fileName || doc.title}.`);
      setChoosing(false);
    } catch (err) {
      fileFail(err, "attach");
    } finally {
      setFileBusy(false);
    }
  }

  async function uploadAndAttach(file: File) {
    if (fileBusy) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      setFileError("That file is over the 50MB upload limit — register it as a Drive link in the Library instead.");
      return;
    }
    setFileBusy(true);
    setFileError("");
    try {
      const path = await uploadDocFile(file, NDA_CATEGORY);
      const doc = await insertDoc({
        kind: "file",
        category: NDA_CATEGORY,
        folder: NDA_FOLDER,
        title: file.name.replace(/\.[^.]+$/, ""),
        description: `NDA — ${company.name}`,
        tags: ["nda"],
        storagePath: path,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        createdByKey: me.id,
      });
      setFolderDocs((list) => [doc, ...(list ?? [])]);
      await onPatch({ ndaDocId: doc.id });
      onLogged?.(`NDA file uploaded and attached: ${file.name}.`);
      setChoosing(false);
    } catch (err) {
      fileFail(err, "upload");
    } finally {
      setFileBusy(false);
    }
  }

  async function unlink() {
    if (fileBusy || !attached) return;
    setFileBusy(true);
    setFileError("");
    try {
      const name = attached.fileName || attached.title;
      await onPatch({ ndaDocId: null });
      onLogged?.(`NDA file detached: ${name} (the file stays in the Library).`);
    } catch (err) {
      fileFail(err, "detach");
    } finally {
      setFileBusy(false);
    }
  }

  const missingLinked = !!company.ndaDocId && folderDocs !== null && !attached;
  const showPicker = !attached || choosing;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 980 }}>
      <Card>
        <CardBody>
          <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--text-strong)", marginBottom: 12 }}>
            NDA — sign before specs are shared
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, maxWidth: 640 }}>
            <label style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
              Status
              <Select value={status} onChange={(e) => {
                const next = e.target.value as NonNullable<Company["ndaStatus"]>;
                setStatus(next);
                // Signed로 바꾸면 비어 있는 체결일은 오늘로 (매번 날짜를 따로 고르던 수고).
                if (next === "signed" && !signedOn) setSignedOn(new Date().toLocaleDateString("en-CA"));
              }}
                options={STATUS_OPTIONS} style={{ marginTop: 4 }} />
            </label>
            <label style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
              Signed date
              <Input type="date" value={signedOn} onChange={(e) => setSignedOn(e.target.value)} style={{ marginTop: 4 }} />
            </label>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
            <Button variant="primary" size="sm" loading={saving} disabled={!dirtyOf(company, status, signedOn)} onClick={() => void save()}>Save</Button>
            {saved && <span style={{ fontSize: "var(--text-xs)", color: "var(--green-600, #16a34a)" }}>✓ Saved</span>}
          </div>
          {error && <Alert tone="warning" title="Couldn’t save" style={{ marginTop: 10 }}>{error}</Alert>}
          <div style={{ marginTop: 14, fontSize: "var(--text-xs)", color: "var(--text-muted)", background: "var(--surface-sunken)", border: "1px dashed var(--border-subtle)", borderRadius: "var(--radius-sm)", padding: "10px 12px" }}>
            Once the NDA is signed, move on to <b>Spec sheet</b> — that&apos;s where the first deal is created.
          </div>
        </CardBody>
      </Card>

      {}
      <Card>
        <CardBody>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--text-strong)" }}>E-signature</span>
            <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>Email the standard Workspace mNDA and track signing here.</span>
            <span style={{ flex: 1 }} />
            <Button variant="primary" size="sm" leftIcon={<Send size={13} />} onClick={() => void openSend()}>Send NDA</Button>
          </div>
          <NdaRequestsList companyId={company.id} refreshKey={requestsKey} canCountersign={canCountersignNda(me)}
            onCompleted={(item, docId) => void onCompleted(item.signerName || item.recipientName, docId)} />
        </CardBody>
      </Card>
      {sendOpen && (
        <NdaSendModal open kind="company" companyId={company.id} contacts={contacts}
          initialFields={{ partyBName: company.name, partyBEntity: "", partyBAddress: (company.address ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).join(", "), purpose: "" }}
          onClose={() => setSendOpen(false)} onSent={(item) => void onSent(item.recipientEmail)} />
      )}

      {}
      <Card>
        <CardBody>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--text-strong)" }}>Signed NDA file</span>
            <span style={{ flex: 1 }} />
          </div>

          {missingLinked && (
            <Alert tone="warning" title="Linked file is gone" style={{ marginBottom: 10 }}>
              The file linked to this company is no longer in your company NDA attachments.
              Attach another one below.
            </Alert>
          )}

          {attached && !choosing && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", padding: "10px 12px", flexWrap: "wrap" }}>
                <span style={{ width: 30, height: 30, borderRadius: "var(--radius-sm)", background: "var(--blue-50, rgba(59,130,246,.08))", color: "var(--color-primary)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                  <FileText size={15} />
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--text-strong)", overflowWrap: "anywhere" }}>
                    {attached.fileName || attached.title}
                  </div>
                  <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>
                    {[sizeLabel(attached.fileSize), (attached.updatedAt ?? "").slice(0, 10)].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <span style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  {previewUrl && (
                    <Button variant="ghost" size="sm" leftIcon={<ExternalLink size={12} />}
                      onClick={() => window.open(previewUrl, "_blank", "noopener")}>
                      Open
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" disabled={fileBusy} onClick={() => setChoosing(true)}>Replace</Button>
                  <Button variant="ghost" size="sm" disabled={fileBusy} onClick={() => void unlink()}>Detach</Button>
                </span>
              </div>
              {canInline(attached) ? (
                previewUrl ? (
                  <iframe src={previewUrl} title={`NDA — ${attached.fileName || attached.title}`}
                    style={{ width: "100%", height: 520, marginTop: 10, border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", background: "var(--surface-sunken)" }} />
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, color: "var(--text-muted)", fontSize: "var(--text-xs)" }}>
                    <Spinner size="sm" /> Loading preview…
                  </div>
                )
              ) : (
                <div style={{ marginTop: 10, fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                  No inline preview for this file type — use Open to view it.
                </div>
              )}
            </>
          )}

          {showPicker && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {folderDocs === null ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-muted)", fontSize: "var(--text-xs)" }}>
                  <Spinner size="sm" /> Loading the NDA folder…
                </div>
              ) : (
                <>
                  {folderDocs.length === 0 ? (
                    <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                      No files in Library → Engineering → NDA yet — upload the signed NDA below.
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>
                        Pick from the NDA folder
                      </div>
                      {folderDocs.map((d) => (
                        <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: "1px solid var(--border-subtle)" }}>
                          <FileText size={13} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <span style={{ fontSize: "var(--text-xs)", color: "var(--text-strong)", overflowWrap: "anywhere" }}>
                              {d.fileName || d.title}
                            </span>
                            <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", marginLeft: 8 }}>
                              {[sizeLabel(d.fileSize), (d.updatedAt ?? "").slice(0, 10)].filter(Boolean).join(" · ")}
                            </span>
                          </div>
                          <Button variant="ghost" size="sm" leftIcon={<Paperclip size={12} />} disabled={fileBusy}
                            onClick={() => void attachDoc(d)}>
                            Attach
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    {}
                    <label style={{ display: "inline-flex" }}>
                      <input type="file" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx" hidden disabled={fileBusy}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = "";
                          if (f) void uploadAndAttach(f);
                        }} />
                      <span className="sx-btn-like" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--color-primary)", border: "1px solid var(--color-primary)", borderRadius: "var(--radius-sm)", padding: "5px 10px", cursor: fileBusy ? "default" : "pointer", opacity: fileBusy ? 0.6 : 1 }}>
                        <Upload size={12} /> Upload from computer
                      </span>
                    </label>
                    {fileBusy && <Spinner size="sm" />}
                    {choosing && (
                      <Button variant="ghost" size="sm" onClick={() => setChoosing(false)}>Cancel</Button>
                    )}
                    <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>
                      Uploads are saved to Library → Engineering → NDA and linked to {company.name}.
                    </span>
                  </div>
                </>
              )}
            </div>
          )}

          {fileError && <Alert tone="warning" title="File action failed" style={{ marginTop: 10 }}>{fileError}</Alert>}
        </CardBody>
      </Card>
    </div>
  );
}

function dirtyOf(company: Company, status: NonNullable<Company["ndaStatus"]>, signedOn: string): boolean {
  return status !== (company.ndaStatus ?? "none") || (signedOn || null) !== (company.ndaSignedOn ?? null);
}
