"use client";

import { useState } from "react";
import { ListChecks, Search, Trash2 } from "lucide-react";
import { DataTable } from "@/components/ds/data/DataTable";
import { Tag } from "@/components/ds/core/Tag";
import { Button } from "@/components/ds/core/Button";
import { Input } from "@/components/ds/forms/Input";
import { Select } from "@/components/ds/forms/Select";
import { Modal } from "@/components/ds/feedback/Modal";
import type { Company, Importance } from "@/types/domain";
import { ASSIGNABLE_OWNERS, CRM_OWNERS, TEAM, memberName } from "@/lib/mock/team";
import { IMPORTANCE_COLOR, IMPORTANCE_LABEL, formatValue, formatRelative } from "./crmFormat";
import { CompanyFavoriteButton } from "./CompanyFavoriteButton";
import { UserAvatar } from "@/components/common/UserAvatar";



const IMPORTANCE_RANK: Record<Company["importance"], number> = { high: 0, med: 1, low: 2 };


type SortState = { key: string; dir: "asc" | "desc" } | null;

function loadSort(storageKey: string): SortState {
  if (typeof window === "undefined") return null;
  try {
    const v = JSON.parse(window.localStorage.getItem(storageKey) ?? "null") as SortState;
    return v && typeof v.key === "string" && (v.dir === "asc" || v.dir === "desc") ? v : null;
  } catch {
    return null;
  }
}

function saveSort(storageKey: string, value: SortState) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(value));
  } catch {  }
}

export function CompanyTable({
  companies,
  onSelect,
  ownerField = "ownerId",
  showValue = true,
  onBulkPatch,
  onBulkDelete,
  favoriteIds = [],
  favoritesDisabled = false,
  onToggleFavorite,
}: {
  companies: Company[];
  favoriteIds?: string[];
  favoritesDisabled?: boolean;
  onToggleFavorite?: (id: string) => void;
  onSelect: (id: string) => void;
  
  ownerField?: "ownerId" | "engOwnerId";
  
  showValue?: boolean;
  
  onBulkPatch?: (ids: string[], patch: Partial<Company>) => void;
  
  onBulkDelete?: (ids: string[]) => void;
}) {
  // 화면별 키(CRM=ownerId / Engineering=engOwnerId) — 두 화면이 다른 정렬을 기억한다.
  const sortStorageKey = `companies.sort.${ownerField}`;
  const [sort, setSort] = useState<SortState>(() => loadSort(sortStorageKey));
  const [query, setQuery] = useState("");
  const [sectorFilter, setSectorFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  function sortVal(r: Company, key: string): string | number {
    switch (key) {
      case "favorite": return favoriteIds.includes(r.id) ? 0 : 1;
      case "partyCode": return r.partyCode || "\uffff"; // 코드 없는 행은 뒤로
      case "name": return r.name.toLowerCase();
      case "sector": return r.sector.toLowerCase();
      case "owner": return r[ownerField] ? memberName(r[ownerField]).toLowerCase() : "\uffff";
      case "importance": return IMPORTANCE_RANK[r.importance];
      case "value": return r.value ?? -1;
      case "updatedAt": return r.updatedAt;
      default: return "";
    }
  }

  
  const q = query.trim().toLowerCase();
  const filtered = companies.filter((r) => {
    if (q && !r.name.toLowerCase().includes(q) && !r.partyCode.toLowerCase().includes(q)) return false;
    if (sectorFilter && r.sector !== sectorFilter) return false;
    if (ownerFilter && (ownerFilter === "unassigned" ? !!r[ownerField] : r[ownerField] !== ownerFilter)) return false;
    if (priorityFilter && r.importance !== priorityFilter) return false;
    return true;
  });

  const rows = [...filtered].sort((a, b) => {
    const favoriteOrder = Number(favoriteIds.includes(b.id)) - Number(favoriteIds.includes(a.id));
    if (favoriteOrder) return favoriteOrder;
    if (!sort) return 0;
    const va = sortVal(a, sort.key);
    const vb = sortVal(b, sort.key);
    const c = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
    return sort.dir === "asc" ? c : -c;
  });

  
  const sectorOptions = [...new Set(companies.map((r) => r.sector))].sort();
  const ownerIdsInData = [...new Set(companies.map((r) => r[ownerField]).filter(Boolean))]
    .sort((a, b) => memberName(a).localeCompare(memberName(b)));
  const priorityOptions = (["high", "med", "low"] as Importance[]).map((i) => ({ value: i, label: IMPORTANCE_LABEL[i] }));

  
  const assignableIds = ownerField === "engOwnerId" ? ASSIGNABLE_OWNERS : CRM_OWNERS;
  const assignableOptions = [
    { value: "unassigned", label: "Unassigned" },
    ...assignableIds.map((id) => ({ value: id, label: TEAM[id]?.fullName ?? memberName(id) })),
  ];

  function applyPatch(patch: Partial<Company>) {
    if (selectedIds.length === 0) return;
    onBulkPatch?.(selectedIds, patch);
  }

  const columns = [
    ...(onToggleFavorite ? [{ key: "favorite", header: "★", width: 48, render: (r: Company) => <CompanyFavoriteButton name={r.name} favorite={favoriteIds.includes(r.id)} disabled={favoritesDisabled} onToggle={() => onToggleFavorite(r.id)} /> }] : []),
    {
      key: "partyCode", header: "Code", width: 72, mono: true, sortable: true,
      render: (r: Company) => r.partyCode || <span style={{ color: "var(--text-subtle)" }}>N/A</span>,
    },
    { key: "name", header: "Company", strong: true, width: 160, sortable: true },
    { key: "sector", header: "Sector", width: 120, sortable: true },
    {
      key: "owner", header: "Owner", width: 150, sortable: true,
      render: (r: Company) => {
        const owner = r[ownerField];
        return (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            {owner ? <UserAvatar memberKey={owner} size="xs" /> : null}
            <span style={owner ? undefined : { color: "var(--text-subtle)" }}>{owner ? memberName(owner) : "Unassigned"}</span>
          </span>
        );
      },
    },
    {
      key: "importance", header: "Priority", width: 110, sortable: true,
      render: (r: Company) => (
        <Tag size="sm" dotColor={IMPORTANCE_COLOR[r.importance]}>{IMPORTANCE_LABEL[r.importance]}</Tag>
      ),
    },
    ...(showValue
      ? [{ key: "value", header: "Value", width: 110, num: true, align: "right" as const, sortable: true, render: (r: Company) => formatValue(r.value) }]
      : []),
    { key: "updatedAt", header: "Updated", width: 96, sortable: true, render: (r: Company) => (
      <span style={{ color: "var(--text-muted)" }}>{formatRelative(r.updatedAt)}</span>
    ) },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ width: 220 }}>
          <Input size="sm" icon={<Search size={13} />} placeholder="Search company, code…"
            value={query} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)} />
        </div>
        {}
        <Select size="sm" value={sectorFilter}
          options={[{ value: "", label: "All sectors" }, ...sectorOptions.map((s) => ({ value: s, label: s }))]}
          onChange={(e) => setSectorFilter(e.target.value)} style={{ width: 140 }} />
        <Select size="sm" value={ownerFilter}
          options={[{ value: "", label: "All owners" }, { value: "unassigned", label: "Unassigned" }, ...ownerIdsInData.map((id) => ({ value: id, label: memberName(id) }))]}
          onChange={(e) => setOwnerFilter(e.target.value)} style={{ width: 140 }} />
        <Select size="sm" value={priorityFilter}
          options={[{ value: "", label: "All priorities" }, ...priorityOptions]}
          onChange={(e) => setPriorityFilter(e.target.value)} style={{ width: 130 }} />
        <div style={{ flex: 1 }} />
        {selectMode && selectedIds.length > 0 && (
          <>
            <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
              {selectedIds.length} selected
            </span>
            <Select size="sm" value="" placeholder="Set owner…"
              options={assignableOptions}
              onChange={(e) => {
                const v = e.target.value === "unassigned" ? "" : e.target.value;
                applyPatch(ownerField === "engOwnerId" ? { engOwnerId: v } : { ownerId: v });
              }} style={{ width: 130 }} />
            <Select size="sm" value="" placeholder="Set priority…"
              options={priorityOptions}
              onChange={(e) => applyPatch({ importance: e.target.value as Importance })} style={{ width: 120 }} />
            <Select size="sm" value="" placeholder="Set sector…"
              options={sectorOptions.map((s) => ({ value: s, label: s }))}
              onChange={(e) => applyPatch({ sector: e.target.value })} style={{ width: 120 }} />
            <Button variant="danger" size="sm" leftIcon={<Trash2 size={14} />} onClick={() => setConfirmBulkDelete(true)}>
              Delete
            </Button>
          </>
        )}
        <Button variant={selectMode ? "secondary" : "ghost"} size="sm" leftIcon={<ListChecks size={14} />}
          onClick={() => { setSelectMode((on) => !on); setSelectedIds([]); }}>
          Select
        </Button>
      </div>

      <DataTable
        resizable
        storageKey="crm-companies"
        columns={columns}
        data={rows}
        rowKey={(r: Company) => r.id}
        stickyHeader
        hover
        sortKey={sort?.key ?? null}
        sortDir={sort?.dir ?? null}
        onSort={(key: string, dir: "asc" | "desc") => { setSort({ key, dir }); saveSort(sortStorageKey, { key, dir }); }}
        selectable={selectMode}
        selectedKeys={selectMode ? selectedIds : null}
        onSelectionChange={(keys: Array<string | number>) => setSelectedIds(keys.map(String))}
        onRowClick={(r: Company) => onSelect(r.id)}
      />

      {}
      <Modal
        open={confirmBulkDelete}
        onClose={() => setConfirmBulkDelete(false)}
        size="sm"
        title="Delete companies"
        subtitle={`${selectedIds.length} compan${selectedIds.length === 1 ? "y" : "ies"} selected`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmBulkDelete(false)}>Cancel</Button>
            <Button variant="danger" onClick={() => {
              setConfirmBulkDelete(false);
              onBulkDelete?.(selectedIds);
              setSelectedIds([]);
            }}>Delete</Button>
          </>
        }
      >
        This removes the {selectedIds.length === 1 ? "selected company" : `${selectedIds.length} selected companies`} and
        their data (requirement tables, activity) from the list. This can’t be undone.
      </Modal>
    </div>
  );
}
