"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardBody } from "@/components/ds/data/Card";
import { Badge } from "@/components/ds/core/Badge";
import { Spinner } from "@/components/ds/core/Spinner";
import { Input } from "@/components/ds/forms/Input";
import { UserAvatar } from "@/components/common/UserAvatar";
import type { Company } from "@/types/domain";
import { fetchCompanyEngagement } from "@/lib/data/crm";
import {
  SALES_STAGE_LABEL, dealValueOf, execBadgeOf, fetchDealSummaries, salesStageOf, updateDeal,
  type DealStatus, type DealSummary, type SalesStage,
} from "@/lib/data/deals";



type DealStage = "spec" | "quoting" | "customer_po" | "invoiced" | "closed";
type CompanyStage = "targeting" | "first_contact" | "nda";

const COLUMNS: { key: CompanyStage | DealStage; label: string; color: string; kind: "company" | "deal" }[] = [
  { key: "targeting", label: "Targeting", color: "var(--gray-400, #9ca3af)", kind: "company" },
  { key: "first_contact", label: "First contact", color: "var(--blue-400, #60a5fa)", kind: "company" },
  { key: "nda", label: "NDA", color: "var(--color-primary)", kind: "company" },
  { key: "spec", label: "Spec sheet", color: "var(--blue-500)", kind: "deal" },
  { key: "quoting", label: "Quotation", color: "var(--amber-500)", kind: "deal" },
  { key: "customer_po", label: "Customer PO", color: "var(--violet-600)", kind: "deal" },
  { key: "invoiced", label: "Invoice", color: "var(--green-600)", kind: "deal" },
  { key: "closed", label: "Done", color: "var(--green-500, #22c55e)", kind: "deal" },
];


function dealColOf(status: DealStatus): DealStage {
  const stage = salesStageOf(status);
  return stage === "first_contact" || stage === "nda" ? "spec" : (stage as DealStage);
}


function fmtMoney(n: number, currency: string): string {
  return `${currency === "KRW" ? "₩" : "$"}${n.toLocaleString("en-US")}`;
}

export function DealsBoard({
  companies = [],
  companyName,
  onOpenCompany,
  onSelectCompany,
  onMoved,
  selectedDealId = null,
  onSelectDeal,
  refreshKey = 0,
}: {
  
  companies?: Company[];
  
  companyName: (id: string | null) => string;
  onOpenCompany: (companyId: string) => void;
  
  onSelectCompany?: (company: Company, stage: CompanyStage) => void;
  
  onMoved?: (deal: DealSummary, status: DealStatus) => void;
  
  selectedDealId?: string | null;
  onSelectDeal?: (deal: DealSummary) => void;
  
  refreshKey?: number;
}) {
  const [deals, setDeals] = useState<DealSummary[] | null>(null);
  const [engagement, setEngagement] = useState<{ touched: Set<string>; targeted: Set<string> } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<DealStage | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let alive = true;
    fetchDealSummaries()
      .then((d) => { if (alive) setDeals(d); })
      .catch((err) => { console.error("deals board load failed:", err); if (alive) setDeals([]); });
    fetchCompanyEngagement()
      .then((e) => { if (alive) setEngagement(e); })
      .catch(() => { if (alive) setEngagement({ touched: new Set(), targeted: new Set() }); });
    return () => { alive = false; };
  }, [refreshKey]);

  // 딜번호·제목·회사명 부분일치 필터 (대소문자 무시)
  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q || !deals) return deals ?? [];
    return deals.filter((d) =>
      d.dealNo.toLowerCase().includes(q) ||
      d.title.toLowerCase().includes(q) ||
      companyName(d.companyId).toLowerCase().includes(q));
  }, [deals, q, companyName]);

  // 회사 칼럼 배정 — 딜이 있으면 딜 카드가 대표하므로 제외. 우선순위 NDA > 접촉 > 타겟팅 노트.
  const companiesByCol = useMemo(() => {
    const withDeals = new Set((deals ?? []).map((d) => d.companyId).filter(Boolean) as string[]);
    const cols: Record<CompanyStage, Company[]> = { targeting: [], first_contact: [], nda: [] };
    if (!engagement) return cols;
    for (const c of companies) {
      if (withDeals.has(c.id) || c.stage === "lost" || c.name === "In-house") continue;
      if (q && !c.name.toLowerCase().includes(q)) continue;
      if (c.ndaStatus === "in_review" || c.ndaStatus === "signed") cols.nda.push(c);
      else if (engagement.touched.has(c.id)) cols.first_contact.push(c);
      else cols.targeting.push(c);
    }
    return cols;
  }, [companies, deals, engagement, q]);

  async function move(deal: DealSummary, status: DealStatus) {
    if (deal.status === status) return;
    setDeals((list) => (list ?? []).map((d) => (d.id === deal.id ? { ...d, status } : d)));
    try {
      await updateDeal(deal.id, { status });
      onMoved?.(deal, status);
    } catch (err) {
      console.error("deal move failed:", err);
      setDeals((list) => (list ?? []).map((d) => (d.id === deal.id ? { ...d, status: deal.status } : d)));
    }
  }

  if (deals === null) {
    return <div style={{ display: "grid", placeItems: "center", padding: 40 }}><Spinner /></div>;
  }

  return (
    
    <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: "1 0 auto" }}>
      {}
      <div className="crm-deals-toolbar" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <span style={{
          display: "inline-flex", alignItems: "center", padding: "3px 10px",
          borderRadius: 999, background: "var(--color-primary-soft)", color: "var(--color-primary)",
          fontSize: "var(--text-xs)", fontWeight: 600, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
        }}>
          {filtered.length} deals · {companiesByCol.targeting.length + companiesByCol.first_contact.length + companiesByCol.nda.length} early-stage
        </span>
        <Input size="sm" placeholder="Search deals & companies…" value={query}
          onChange={(e) => setQuery(e.target.value)} style={{ width: 230 }} />
      </div>

      <div style={{ display: "flex", gap: 14, alignItems: "stretch", overflowX: "auto", flex: "1 0 auto" }}>
        {COLUMNS.map((col) => {
          const colDeals = col.kind === "deal" ? filtered.filter((d) => dealColOf(d.status) === col.key) : [];
          const colCompanies = col.kind === "company" ? companiesByCol[col.key as CompanyStage] : [];
          const count = col.kind === "deal" ? colDeals.length : colCompanies.length;
          const quoted = colDeals.map(dealValueOf).filter((v): v is NonNullable<ReturnType<typeof dealValueOf>> => v != null);
          const sum = quoted.reduce((acc, v) => acc + v.amount, 0);
          return (
            <div
              key={col.key}
              onDragOver={(e) => {
                if (col.kind !== "deal" || !e.dataTransfer.types.includes("text/crm-deal")) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setOverCol(col.key as DealStage);
              }}
              onDragLeave={() => setOverCol((c) => (c === col.key ? null : c))}
              onDrop={(e) => {
                if (col.kind !== "deal") return;
                e.preventDefault();
                const id = e.dataTransfer.getData("text/crm-deal");
                const deal = filtered.find((d) => d.id === id);
                if (deal) void move(deal, col.key as DealStatus);
                setDragId(null);
                setOverCol(null);
              }}
              style={{
                width: 232, flexShrink: 0, display: "flex", flexDirection: "column",
                borderRadius: "var(--radius-md)",
                outline: overCol === col.key && dragId ? "1.5px dashed var(--color-primary)" : "none",
                outlineOffset: 2,
              }}
            >
              {}
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 4px 10px" }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, flexShrink: 0, background: col.color }} />
                <span style={{ fontWeight: 600, fontSize: "var(--text-sm)", color: "var(--text-strong)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {col.label}
                </span>
                <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
                  {count}
                </span>
                {quoted.length > 0 && (
                  <span style={{ marginLeft: "auto", fontSize: "var(--text-2xs)", color: "var(--text-muted)", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                    {fmtMoney(sum, quoted[0].currency)}
                  </span>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 40, flex: 1 }}>
                {}
                {colCompanies.map((c) => (
                  <Card key={c.id} interactive
                    onClick={() => (onSelectCompany ? onSelectCompany(c, col.key as CompanyStage) : onOpenCompany(c.id))}
                    style={{ cursor: "pointer", flexShrink: 0, background: `color-mix(in srgb, ${col.color} 8%, var(--surface-card))` }}
                    title={onSelectCompany ? "Click: show details below" : "Click: open the company"}>
                    <CardBody style={{ padding: "9px 12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ flex: 1, fontWeight: 600, color: "var(--text-strong)", fontSize: "var(--text-sm)", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {c.name}
                        </span>
                        {col.key === "nda" && (
                          <Badge tone={c.ndaStatus === "signed" ? "success" : "warning"} size="sm">
                            {c.ndaStatus === "signed" ? "Signed" : "In review"}
                          </Badge>
                        )}
                      </div>
                      {c.sector && (
                        <div style={{ marginTop: 5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          <span style={{
                            fontSize: "var(--text-2xs)", fontWeight: 600, borderRadius: 999, padding: "1px 8px",
                            background: "var(--avatar-bg)", color: "var(--gray-700, #3f3f46)",
                          }}>
                            {c.sector}
                          </span>
                        </div>
                      )}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 7 }}>
                        <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-subtle)" }}>
                          {col.key === "targeting" ? "Researching" : col.key === "first_contact" ? "In conversation" : "NDA stage"}
                        </span>
                        {c.ownerId ? <UserAvatar memberKey={c.ownerId} size="xs" /> : null}
                      </div>
                    </CardBody>
                  </Card>
                ))}

                {}
                {colDeals.map((d) => {
                  const execBadge = execBadgeOf(d.status);
                  return (
                    <Card key={d.id} interactive draggable={!execBadge}
                      onDragStart={(e: React.DragEvent) => {
                        e.dataTransfer.setData("text/crm-deal", d.id);
                        e.dataTransfer.effectAllowed = "move";
                        setTimeout(() => setDragId(d.id), 0);
                      }}
                      onDragEnd={() => { setDragId(null); setOverCol(null); }}
                      onClick={() => { if (onSelectDeal) onSelectDeal(d); else if (d.companyId) onOpenCompany(d.companyId); }}
                      style={{
                        cursor: execBadge ? "pointer" : "grab", flexShrink: 0, opacity: dragId === d.id ? 0.4 : 1,
                        background: `color-mix(in srgb, ${col.color} 8%, var(--surface-card))`,
                        outline: selectedDealId === d.id ? "2px solid var(--color-primary)" : "none", outlineOffset: 1,
                      }}
                      title={execBadge
                        ? "Execution in progress · change status in the company screen"
                        : "Click: open the company · Drag: move stage"}>
                      <CardBody style={{ padding: "9px 12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: "var(--text-2xs)", fontWeight: 700, color: "var(--color-primary)" }}>
                            {d.dealNo}
                          </span>
                          {execBadge ? <Badge tone="warning" size="sm">{execBadge}</Badge> : null}
                        </div>
                        <div style={{ fontWeight: 600, color: "var(--text-strong)", fontSize: "var(--text-sm)", lineHeight: 1.3, marginTop: 2, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                          {d.title}
                        </div>
                        <div style={{ marginTop: 5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          <span style={{
                            fontSize: "var(--text-2xs)", fontWeight: 600, borderRadius: 999, padding: "1px 8px",
                            background: "var(--avatar-bg)", color: "var(--gray-700, #3f3f46)",
                          }}>
                            {companyName(d.companyId)}
                          </span>
                        </div>
                        {(() => { const v = dealValueOf(d); return v ? (
                          <div style={{ marginTop: 5, fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--text-strong)", fontVariantNumeric: "tabular-nums" }}>
                            {fmtMoney(v.amount, v.currency)}{v.source === "quote" ? <span style={{ fontWeight: 500, color: "var(--text-subtle)" }}> quote</span> : null}
                          </div>
                        ) : null; })()}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 7 }}>
                          <span style={{ display: "inline-flex", gap: 4 }}>
                            {d.partCount > 0 && <Badge tone="success" size="sm">parts {d.partCount}</Badge>}
                            {d.vendorPoCount > 0 && <Badge tone="warning" size="sm">PO {d.vendorPoCount}</Badge>}
                          </span>
                          {d.ownerKey ? <UserAvatar memberKey={d.ownerKey} size="xs" /> : null}
                        </div>
                      </CardBody>
                    </Card>
                  );
                })}

                {count === 0 && (
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)", padding: "8px 4px" }}>
                    {col.kind === "company" ? "No companies" : "No deals"}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
