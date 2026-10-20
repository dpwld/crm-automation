"use client";

import { useEffect, useState } from "react";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { Select } from "@/components/ds/forms/Select";
import type { Company, Importance } from "@/types/domain";
import { ASSIGNABLE_OWNERS, CRM_OWNERS, TEAM, memberName } from "@/lib/mock/team";
import { awaitingReplyDays, confirmEmailDeal, fetchEmails, type CrmEmail } from "@/lib/data/emails";
import {
  DEAL_STATUS_LABEL, DEAL_STATUS_ORDER, INHOUSE_STATUS,
  fetchDealsLight,
  type DealStatus, type DealSummary,
} from "@/lib/data/deals";
import { IMPORTANCE_LABEL } from "./crmFormat";
import { CompanyContactsSection } from "./CompanyContactsSection";

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "72px 1fr", alignItems: "center", gap: 10, padding: "5px 0" }}>
      <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{label}</span>
      <div>{children}</div>
    </div>
  );
}


export function DetailPanel({
  company,
  onChange,
  variant = "sales",
  sectors = [],
  deal = null,
  onDealStatusChange,
}: {
  company: Company;
  onChange: (patch: Partial<Company>) => void;
  
  variant?: "sales" | "engineering";
  
  sectors?: string[];
  
  deal?: DealSummary | null;
  onDealStatusChange?: (deal: DealSummary, status: DealStatus) => void;
}) {
  // 빈 값은 "Unassigned"로 명시 — 값이 없을 때 첫 멤버가 선택된 것처럼 보이던 문제 방지.
  
  const ownerValue = variant === "engineering" ? company.engOwnerId : company.ownerId;
  const ownerIds = variant === "engineering" ? ASSIGNABLE_OWNERS : CRM_OWNERS;
  const ownerList = ownerValue && !ownerIds.includes(ownerValue) ? [...ownerIds, ownerValue] : ownerIds;
  const ownerOptions = [{ value: "", label: "Unassigned" }, ...ownerList.map((id) => ({ value: id, label: TEAM[id]?.fullName ?? memberName(id) }))];
  const sectorList = company.sector && !sectors.includes(company.sector) ? [...sectors, company.sector] : sectors;
  const sectorOptions = sectorList.map((x) => ({ value: x, label: x }));
  const eng = variant === "engineering";
  const importanceOptions = (["high", "med", "low"] as Importance[]).map((i) => ({ value: i, label: IMPORTANCE_LABEL[i] }));

  return (
    <div className="sx-scroll" style={{ overflowY: "auto", padding: "12px 16px 14px" }}>
      <div
        style={{
          fontSize: "var(--text-2xs)",
          fontWeight: 600,
          letterSpacing: ".06em",
          textTransform: "uppercase",
          color: "var(--text-subtle)",
          paddingBottom: 6,
        }}
      >
        Details
      </div>
      {deal && (
        <MetaRow label={`Deal ${deal.dealNo}`}>
          <Select size="sm" value={deal.status}
            options={(deal.kind === "inhouse" ? INHOUSE_STATUS : DEAL_STATUS_ORDER).map((st) => ({ value: st, label: DEAL_STATUS_LABEL[st] }))}
            onChange={(e) => onDealStatusChange?.(deal, e.target.value as DealStatus)} />
        </MetaRow>
      )}
      {}
      {eng && (
        <MetaRow label="Sector">
          <Select size="sm" options={sectorOptions} value={company.sector}
            onChange={(e) => onChange({ sector: e.target.value })} />
        </MetaRow>
      )}
      <MetaRow label="Owner">
        <Select size="sm" options={ownerOptions} value={ownerValue}
          onChange={(e) => onChange(eng ? { engOwnerId: e.target.value } : { ownerId: e.target.value })} />
      </MetaRow>
      <MetaRow label="Priority">
        <Select size="sm" options={importanceOptions} value={company.importance}
          onChange={(e) => onChange({ importance: e.target.value as Importance })} />
      </MetaRow>

      {}
      {eng && (
        <CompanyContactsSection key={`c-${company.id}`} companyId={company.id} companyName={company.name}
          space="engineering" />
      )}

      <EmailSection key={company.id} companyId={company.id} />
    </div>
  );
}


function EmailSection({ companyId }: { companyId: string }) {
  const [emails, setEmails] = useState<CrmEmail[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  // 딜 배지·복수 딜 확인용 — 이 회사 딜 목록 (미실행 DB에서는 빈 목록)
  const [dealOpts, setDealOpts] = useState<{ id: string; dealNo: string }[]>([]);
  const [confirmBusy, setConfirmBusy] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    // 회사가 바뀌면 key로 리마운트되므로 여기서 동기 리셋은 불필요
    fetchEmails(companyId)
      .then((list) => { if (alive) setEmails(list); })
      .catch(() => { if (alive) setEmails([]); }); // 테이블 미생성(2026-08-06c SQL 전)도 조용히
    fetchDealsLight()
      .then((all) => { if (alive) setDealOpts(all.filter((d) => d.companyId === companyId).map((d) => ({ id: d.id, dealNo: d.dealNo }))); })
      .catch(() => {});
    return () => { alive = false; };
  }, [companyId]);

  const dealNoOf = (id: string | null) => dealOpts.find((d) => d.id === id)?.dealNo ?? null;

  async function confirmDeal(email: CrmEmail, dealId: string | null) {
    setConfirmBusy(email.id);
    try {
      await confirmEmailDeal(email.id, dealId);
      setEmails((list) => (list ?? []).map((e) => (e.id === email.id ? { ...e, dealId, matchStatus: "confirmed" } : e)));
    } catch (err) {
      console.error("email deal confirm failed:", err);
    } finally {
      setConfirmBusy(null);
    }
  }

  // 반영 제외(excluded) 메일은 우측 요약에서 숨긴다 — 복구는 Timeline에서.
  const visible = (emails ?? []).filter((e) => e.recordStatus !== "excluded");
  if (emails === null || visible.length === 0) return null; // 수집된 메일이 없으면 섹션 자체를 숨김

  const waiting = awaitingReplyDays(visible);
  const fmt = (iso: string | null) => (iso ? iso.slice(0, 10) : "N/A");

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 6 }}>
        <span style={{ fontSize: "var(--text-2xs)", fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--text-subtle)" }}>
          Emails
        </span>
        {waiting != null && waiting >= 1 && (
          <span style={{ fontSize: "var(--text-2xs)", fontWeight: 600, color: "var(--amber-600, #b45309)", background: "var(--amber-50, #fffbeb)", border: "1px solid var(--amber-200, #fde68a)", borderRadius: 999, padding: "1px 8px" }}>
            Awaiting reply · day {waiting}
          </span>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {visible.slice(0, 8).map((e) => (
          <div key={e.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <button
            type="button"
            onClick={() => setExpanded((cur) => (cur === e.id ? null : e.id))}
            style={{ width: "100%", textAlign: "left", border: "none", background: "none", cursor: "pointer", padding: "6px 0", fontFamily: "var(--font-sans)" }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              {e.direction === "outbound"
                ? <ArrowUpRight size={12} style={{ color: "var(--color-primary)", flexShrink: 0 }} />
                : <ArrowDownLeft size={12} style={{ color: "var(--green-600, #16a34a)", flexShrink: 0 }} />}
              <span style={{ flex: 1, minWidth: 0, fontSize: "var(--text-xs)", color: "var(--text-strong)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {e.subject || "(no subject)"}
              </span>
              {e.dealId && dealNoOf(e.dealId) && (
                <span style={{ fontSize: "var(--text-2xs)", fontFamily: "var(--font-mono)", color: "var(--color-primary)", background: "var(--color-primary-soft, #eef3fb)", borderRadius: 999, padding: "0 6px", flexShrink: 0 }}>
                  {dealNoOf(e.dealId)}
                </span>
              )}
              {e.matchStatus === "review" && (
                <span style={{ fontSize: "var(--text-2xs)", fontWeight: 600, color: "var(--amber-600, #b45309)", background: "var(--amber-50, #fffbeb)", borderRadius: 999, padding: "0 6px", flexShrink: 0 }}>
                  Deal?
                </span>
              )}
              <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-subtle)", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{fmt(e.sentAt)}</span>
            </span>
          </button>
          {expanded === e.id && (
            <div style={{ paddingBottom: 6, fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>
              {e.direction === "outbound" ? `→ ${e.toAddrs}` : `← ${e.fromAddr}`}
              {e.snippet ? ` · ${e.snippet}` : ""}
              {}
              {e.matchStatus === "review" && dealOpts.length > 0 && (
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", paddingTop: 6 }}>
                  <span style={{ color: "var(--text-subtle)" }}>Link to:</span>
                  {dealOpts.map((d) => (
                    <button key={d.id} type="button" disabled={confirmBusy === e.id}
                      onClick={() => void confirmDeal(e, d.id)}
                      style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-2xs)", color: "var(--color-primary)", background: "var(--color-primary-soft, #eef3fb)", border: "1px solid transparent", borderRadius: 999, padding: "2px 8px", cursor: "pointer" }}>
                      → {d.dealNo}
                    </button>
                  ))}
                  <button type="button" disabled={confirmBusy === e.id}
                    onClick={() => void confirmDeal(e, null)}
                    style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", background: "var(--surface-sunken)", border: "1px solid transparent", borderRadius: 999, padding: "2px 8px", cursor: "pointer" }}>
                    Company only
                  </button>
                </div>
              )}
            </div>
          )}
          </div>
        ))}
      </div>
    </div>
  );
}
