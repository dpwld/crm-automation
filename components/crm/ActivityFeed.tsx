"use client";

import { displayCopy } from "@/lib/displayCopy";
import { useState } from "react";
import { Modal } from "@/components/ds/feedback/Modal";
import { Button } from "@/components/ds/core/Button";
import { Comment } from "@/components/ds/collaboration/Comment";
import type { Activity, Comment as CommentT } from "@/types/domain";
import { memberName, TEAM } from "@/lib/mock/team";
import { useCurrentUser } from "@/lib/auth/CurrentUserContext";
import { MentionComposer } from "@/components/common/MentionComposer";
import { MentionText } from "@/components/common/MentionText";
import { ReactionBar } from "@/components/common/ReactionBar";
import { formatTimestamp } from "./crmFormat";
import { UserAvatar } from "@/components/common/UserAvatar";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: "var(--text-2xs)", fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--text-subtle)", padding: "0 0 8px" }}>
      {children}
    </div>
  );
}

export function ActivityFeed({
  activities,
  comments,
  onReact,
  onAddComment,
  onDeleteComment,
}: {
  activities: Activity[];
  comments: CommentT[];
  
  onReact: (commentId: string, emoji: string, on: boolean) => void;
  onAddComment: (text: string, parentId?: string | null) => void;
  
  onDeleteComment: (commentId: string) => void;
}) {
  const me = useCurrentUser();
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; hasReplies: boolean } | null>(null);
  const roots = comments.filter((c) => c.parentId === null);
  const repliesOf = (id: string) => comments.filter((c) => c.parentId === id);

  function renderComment(c: CommentT, isRoot: boolean) {
    const author = TEAM[c.authorId];
    const replies = repliesOf(c.id);
    return (
      <Comment
        key={c.id}
        author={author?.fullName ?? memberName(c.authorId)}
        badge={author?.title || undefined}
        time={formatTimestamp(c.createdAt)}
        avatar={<UserAvatar memberKey={c.authorId} size="sm" />}
        showLike={false}
        onReply={isRoot ? () => setReplyingTo((id) => (id === c.id ? null : c.id)) : null}
        replyCount={replies.length || null}
        replies={replies.length ? replies.map((r) => renderComment(r, false)) : null}
      >
        <MentionText body={c.body} />
        <ReactionBar reactions={c.reactions} myId={me.id} onToggle={(emoji, on) => onReact(c.id, emoji, on)} />
        {}
        {(c.authorId === me.id || me.role === "admin") && (
          <button
            type="button"
            onClick={() => setConfirmDelete({ id: c.id, hasReplies: replies.length > 0 })}
            style={{ display: "block", marginTop: 4, border: "none", background: "none", cursor: "pointer", padding: 0, fontSize: "var(--text-2xs)", color: "var(--text-subtle)" }}
          >
            Delete{replies.length > 0 ? " (incl. replies)" : ""}
          </button>
        )}
      </Comment>
    );
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div className="sx-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "16px 16px 8px" }}>
        <SectionLabel>Activity log</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 18 }}>
          {[...activities].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map((a) => (
            <div key={a.id} style={{ display: "flex", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--border-subtle)" }}>
              <UserAvatar memberKey={a.actorId} size="xs" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "var(--text-sm)", color: "var(--text-default)", whiteSpace: "pre-line" }}>
                  <span style={{ fontWeight: 600, color: "var(--text-strong)" }}>{memberName(a.actorId)}</span>{" "}
                  {displayCopy(a.summary)}
                </div>
                <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-subtle)", marginTop: 1 }}>{formatTimestamp(a.createdAt)}</div>
              </div>
            </div>
          ))}
        </div>

        <SectionLabel>Comments</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {roots.length ? roots.map((c) => (
            <div key={c.id}>
              {renderComment(c, true)}
              {replyingTo === c.id && (
                <div style={{ paddingLeft: 28, paddingBottom: 8 }}>
                  <MentionComposer
                    avatarName={me.fullName}
                    placeholder="Write a reply…  (@name to mention)"
                    onSubmit={(text) => {
                      onAddComment(text, c.id);
                      setReplyingTo(null);
                    }}
                  />
                </div>
              )}
            </div>
          )) : (
            <div style={{ fontSize: "var(--text-sm)", color: "var(--text-subtle)", padding: "4px 0" }}>No comments yet.</div>
          )}
        </div>
      </div>

      <div style={{ flexShrink: 0, borderTop: "1px solid var(--border-subtle)", padding: 12, background: "var(--surface-card)" }}>
        <MentionComposer
          avatarName={me.fullName}
          placeholder="Add a comment…  (@name to mention)"
          onSubmit={(text) => onAddComment(text)}
        />
      </div>
      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Delete comment"
        size="sm"
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                if (confirmDelete) onDeleteComment(confirmDelete.id);
                setConfirmDelete(null);
              }}
            >
              Delete
            </Button>
          </div>
        }
      >
        {confirmDelete?.hasReplies ? "Replies to this comment are deleted too. This can’t be undone." : "This can’t be undone."}
      </Modal>

    </div>
  );
}
