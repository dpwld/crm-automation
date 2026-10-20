"use client";

import { displayCopy } from "@/lib/displayCopy";
import { useEffect, useState } from "react";
import { Send, X } from "lucide-react";
import type { Activity, Company } from "@/types/domain";
import { UserAvatar } from "@/components/common/UserAvatar";
import { Button } from "@/components/ds/core/Button";
import { Input } from "@/components/ds/forms/Input";
import { memberName } from "@/lib/mock/team";
import { useCurrentUser } from "@/lib/auth/CurrentUserContext";
import {
  deleteGlobalComment, fetchGlobalComments, insertGlobalComment, type GlobalComment,
} from "@/lib/data/globalComments";
import { formatRelative } from "./crmFormat";



const MAX_ROWS = 15;

export function GlobalActivityPanel({
  activitiesByCompany,
  companies,
  meId,
  onOpenCompany,
}: {
  activitiesByCompany: Record<string, Activity[]>;
  companies: Company[];
  meId: string;
  onOpenCompany: (companyId: string) => void;
}) {
  const me = useCurrentUser();
  const nameById = new Map(companies.map((c) => [c.id, c.name]));
  const recent = companies
    .flatMap((c) => activitiesByCompany[c.id] ?? [])
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, MAX_ROWS);

  const [comments, setComments] = useState<GlobalComment[]>([]);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    let alive = true;
    // global_comments 테이블 미실행 DB에서는 조용히 빈 목록
    fetchGlobalComments().then((list) => { if (alive) setComments(list); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  async function post() {
    const body = draft.trim();
    if (!body) return;
    setPosting(true);
    try {
      const saved = await insertGlobalComment(meId, body);
      setComments((prev) => [saved, ...prev].slice(0, 10));
      setDraft("");
    } catch (err) {
      console.error("global comment failed (run db/migrations/2026-09-02e SQL?):", err);
    } finally {
      setPosting(false);
    }
  }

  async function remove(c: GlobalComment) {
    try {
      await deleteGlobalComment(c.id);
      setComments((prev) => prev.filter((x) => x.id !== c.id));
    } catch (err) {
      console.error("global comment delete failed:", err);
    }
  }

  const label: React.CSSProperties = {
    fontSize: "var(--text-2xs)", fontWeight: 600, letterSpacing: ".05em",
    textTransform: "uppercase", color: "var(--text-subtle)",
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ flexShrink: 0, padding: "16px 16px 8px" }}>
        <span style={label}>Recent activity · All companies</span>
      </div>
      <div className="sx-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 16px 8px" }}>
        {recent.length === 0 ? (
          <div style={{ fontSize: "var(--text-sm)", color: "var(--text-subtle)", padding: "4px 0" }}>No activity yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {recent.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => onOpenCompany(a.companyId)}
                title={`Open ${nameById.get(a.companyId) ?? "company"}`}
                style={{ display: "flex", gap: 8, alignItems: "flex-start", width: "100%", textAlign: "left", padding: "6px 0", border: "none", borderBottom: "1px solid var(--border-subtle)", background: "none", cursor: "pointer" }}
              >
                <UserAvatar memberKey={a.actorId} size="xs" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  {}
                  <div style={{ fontSize: "var(--text-sm)", color: "var(--text-default)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    <span style={{ fontWeight: 600, color: "var(--text-strong)" }}>{nameById.get(a.companyId) ?? "N/A"}</span>{" "}
                    {displayCopy(a.summary.split("\n")[0])}
                  </div>
                  <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-subtle)", marginTop: 1 }}>{formatRelative(a.createdAt)}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {}
      <div style={{ flexShrink: 0, borderTop: "1px solid var(--border-subtle)", padding: "10px 16px 14px", display: "flex", flexDirection: "column", gap: 8, maxHeight: 260 }}>
        <span style={label}>Comments · General</span>
        {comments.length > 0 && (
          <div className="sx-scroll" style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, minHeight: 0 }}>
            {comments.map((c) => (
              <div key={c.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <UserAvatar memberKey={c.authorKey} size="xs" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-subtle)" }}>
                    <b style={{ color: "var(--text-muted)" }}>{memberName(c.authorKey)}</b> · {formatRelative(c.createdAt)}
                  </div>
                  <div style={{ fontSize: "var(--text-sm)", color: "var(--text-default)", whiteSpace: "pre-wrap", overflowWrap: "break-word" }}>{c.body}</div>
                </div>
                {}
                {(c.authorKey === meId || me.role === "admin") && (
                  <Button variant="ghost" size="sm" iconOnly aria-label="Delete comment" onClick={() => void remove(c)}>
                    <X size={12} />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 6 }}>
          <Input size="sm" value={draft} placeholder="Add a general comment…" style={{ flex: 1 }}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) void post(); }} />
          <Button size="sm" iconOnly aria-label="Post comment" loading={posting} disabled={!draft.trim()} onClick={() => void post()}>
            <Send size={13} />
          </Button>
        </div>
      </div>
    </div>
  );
}
