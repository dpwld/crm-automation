"use client";

import { splitMentions } from "@/lib/mentions";


export function MentionText({ body }: { body: string }) {
  const parts = splitMentions(body);
  return (
    <span style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
      {parts.map((p, i) =>
        p.mention ? (
          <span key={i} style={{ color: "var(--color-primary)", fontWeight: 600 }}>{p.text}</span>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </span>
  );
}
