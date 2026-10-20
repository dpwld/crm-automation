"use client";

import { useEffect, useRef, useState } from "react";
import {readJson} from "@/lib/http";
import type { NdaFields, NdaKind } from "@/lib/nda/template";
import "./sign.css";

/* NDA 상대방 서명 페이지 — 로그인 없이 메일의 비공개 링크(#토큰)로 연다.
   문서 확인 → 이름·직함 + 서명(직접 그리기 / 이름 입력) + 전자서명 동의 → 서명.
   서명하지 않을 때는 사유와 함께 거절할 수 있다. */

type Envelope = {
 documentHtml:string;
  kind: NdaKind; fields: NdaFields; status: "sent" | "viewed" | "signed" | "completed" | "declined";
  expiresAt: string | null; recipientName: string; recipientEmail: string; senderName: string;
  signerName: string | null; signedAt: string | null;
};

async function call(token: string, payload: Record<string, unknown>): Promise<Envelope> {
  const res = await fetch("/api/nda/sign", {
    method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", referrerPolicy: "no-referrer",
    body: JSON.stringify({ token, ...payload }),
  });
  const json = await readJson(res).catch(() => ({error:"Unable to read the response."}));
  if (!res.ok) throw new Error(json.error || "Please try again later.");
  return json as Envelope;
}

/** 잉크가 있는 영역만 잘라 PNG로 — 서명란에 꽉 차게 들어가도록. */
function trimmedPng(canvas: HTMLCanvasElement): string | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const { width, height } = canvas;
  const px = ctx.getImageData(0, 0, width, height).data;
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (px[(y * width + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return null;
  const pad = 8;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(width - 1, x1 + pad); y1 = Math.min(height - 1, y1 + pad);
  const scale = Math.min(1, 240 / (y1 - y0 + 1));
  const out = document.createElement("canvas");
  out.width = Math.round((x1 - x0 + 1) * scale); out.height = Math.round((y1 - y0 + 1) * scale);
  out.getContext("2d")!.drawImage(canvas, x0, y0, x1 - x0 + 1, y1 - y0 + 1, 0, 0, out.width, out.height);
  return out.toDataURL("image/png");
}

function SignaturePad({ mode, typed, onInk }: { mode: "draw" | "type"; typed: string; onInk: (has: boolean) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  // 그리기 모드에서는 이름을 고쳐도 그린 서명을 지우지 않는다.
  const typedText = mode === "type" ? typed : "";

  function fit() {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    c.width = Math.round(c.clientWidth * dpr); c.height = Math.round(c.clientHeight * dpr);
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = 2.4; ctx.strokeStyle = "#0f172a"; ctx.fillStyle = "#0f172a";
  }

  // 모드·입력 이름이 바뀌면 캔버스를 다시 그린다 (타이핑 서명은 필기체 폰트 로드 후).
  useEffect(() => {
    fit();
    onInk(false);
    if (mode !== "type") return;
    const c = canvasRef.current!;
    let alive = true;
    const family = getComputedStyle(c).getPropertyValue("--font-sign").trim() || "cursive";
    const font = `48px ${family}`;
    document.fonts.load(font).catch(() => undefined).then(() => {
      if (!alive) return;
      fit();
      const ctx = c.getContext("2d")!;
      const text = typedText.trim();
      if (!text) { onInk(false); return; }
      let size = 48;
      ctx.font = `${size}px ${family}`;
      const max = c.clientWidth - 40;
      const w = ctx.measureText(text).width;
      if (w > max) { size = Math.max(18, (size * max) / w); ctx.font = `${size}px ${family}`; }
      ctx.textBaseline = "middle";
      ctx.fillText(text, 20, c.clientHeight / 2);
      onInk(true);
    });
    return () => { alive = false; };
  }, [mode, typedText, onInk]);

  useEffect(() => {
    const onResize = () => { fit(); onInk(false); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [onInk]);

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  return (
    <div className="nda-sign-pad">
      <canvas
        ref={canvasRef}
        data-sign-canvas
        aria-label={mode === "draw" ? "Signature drawing area" : "Typed signature preview"}
        onPointerDown={(e) => {
          if (mode !== "draw") return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drawing.current = true;
          const ctx = e.currentTarget.getContext("2d")!;
          const p = point(e);
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + 0.1, p.y + 0.1); ctx.stroke();
          onInk(true);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = e.currentTarget.getContext("2d")!;
          const p = point(e);
          ctx.lineTo(p.x, p.y); ctx.stroke();
        }}
        onPointerUp={() => { drawing.current = false; }}
        onPointerCancel={() => { drawing.current = false; }}
      />
      {mode === "draw" && <span className="hint">Sign here with your mouse or finger</span>}
      {mode === "draw" && (
        <button type="button" className="clear" onClick={() => { fit(); onInk(false); }}>Clear</button>
      )}
    </div>
  );
}

export default function SignPage() {
  const token = useRef("");
  const [env, setEnv] = useState<Envelope | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<"draw" | "type">("draw");
  const [hasInk, setHasInk] = useState(false);
  const [consent, setConsent] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");

  useEffect(() => {
    token.current = window.location.hash.slice(1);
    let alive = true;
    call(token.current, { action: "view" })
      .then((e) => { if (alive) { setEnv(e); setName(e.recipientName); } })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : "Unable to open this agreement."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  async function sign() {
    if (busy || !env) return;
    const canvas = document.querySelector<HTMLCanvasElement>("canvas[data-sign-canvas]");
    const signature = canvas ? trimmedPng(canvas) : null;
    if (!signature) { setError("Draw or type your signature."); return; }
    setBusy(true); setError("");
    try {
      setEnv(await call(token.current, {
        action: "sign", name, title, consent, signature,
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }));
    } catch (e) { setError(e instanceof Error ? e.message : "Please try again."); }
    finally { setBusy(false); }
  }

  async function decline() {
    if (busy) return;
    setBusy(true); setError("");
    try { setEnv(await call(token.current, { action: "decline", reason })); setDeclining(false); }
    catch (e) { setError(e instanceof Error ? e.message : "Please try again."); }
    finally { setBusy(false); }
  }

  const open = env && (env.status === "sent" || env.status === "viewed");
  const company = env?.kind === "company";
  const canSign = !!open && !!name.trim() && (!company || !!title.trim()) && hasInk && consent;

  return (
    <main className="nda-sign-page">
      <div className="nda-sign-wrap">
        <div className="nda-sign-top"><span>NDA</span></div>
        {loading && <div className="nda-sign-spinner" role="status" aria-label="Loading" />}
        {!loading && !env && error && <div className="nda-sign-card"><div className="nda-sign-error" role="alert">{error}</div></div>}
        {env && !open && (
          <div className="nda-sign-card">
            <div className="nda-sign-done" aria-hidden="true">{env.status === "declined" ? "–" : "✓"}</div>
            {env.status === "declined" ? (
              <><h1>You declined to sign.</h1><p>Your response has been recorded. {env.senderName} at your organisation will follow up with you.</p></>
            ) : env.status === "completed" ? (
              <><h1>This agreement is fully executed.</h1><p>Both parties have signed. The executed copy was emailed to {env.recipientEmail}.</p></>
            ) : (
              <><h1>Thank you for signing.</h1><p>your organisation will countersign shortly, and the fully executed agreement will be emailed to {env.recipientEmail}.</p></>
            )}
          </div>
        )}
        {env && open && (
          <>
            <div className="nda-sign-card">
              <h1>Please review and sign</h1>
              <p>{env.senderName} sent you this Nondisclosure Agreement for {env.fields.partyBName}. Read it below, then sign at the bottom of this page.</p>
            </div>
            <div className="nda-sign-doc" tabIndex={0} aria-label="Agreement text"
              dangerouslySetInnerHTML={{ __html: env.documentHtml }} />
            <div className="nda-sign-card">
              <div className="nda-sign-form">
                <h1 style={{ fontSize: 20 }}>Sign as {env.fields.partyBName}</h1>
                <div className="nda-sign-row">
                  <label>Full name<input type="text" id="nda-name" value={name} autoComplete="name" onChange={(e) => setName(e.target.value)} /></label>
                  {company && <label>Title<input type="text" id="nda-title" value={title} autoComplete="organization-title" placeholder="e.g. General Manager" onChange={(e) => setTitle(e.target.value)} /></label>}
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>Signature</span>
                    <div className="nda-sign-tabs">
                      <button type="button" aria-pressed={mode === "draw"} onClick={() => setMode("draw")}>Draw</button>
                      <button type="button" aria-pressed={mode === "type"} onClick={() => setMode("type")}>Type</button>
                    </div>
                  </div>
                  <SignaturePad mode={mode} typed={name} onInk={setHasInk} />
                  <span className="nda-sign-muted">Please use English letters for your name{company ? " and title" : ""} so they print correctly on the agreement.</span>
                </div>
                <label className="nda-sign-consent">
                  <input type="checkbox" id="nda-consent" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                  <span>I agree to sign this agreement electronically. My electronic signature has the same legal effect as a handwritten signature.</span>
                </label>
                {error && <div className="nda-sign-error" role="alert">{error}</div>}
                {!declining ? (
                  <div className="nda-sign-actions">
                    <button type="button" className="nda-sign-primary" disabled={!canSign || busy} onClick={() => void sign()}>{busy ? "Signing…" : "Sign agreement"}</button>
                    <button type="button" className="nda-sign-link" onClick={() => setDeclining(true)}>Decline to sign</button>
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: 10 }}>
                    <label>Reason (optional)<textarea id="nda-decline-reason" rows={3} value={reason} maxLength={1000} placeholder="Let your organisation know what needs to change" onChange={(e) => setReason(e.target.value)} /></label>
                    <div className="nda-sign-actions">
                      <button type="button" className="nda-sign-danger" disabled={busy} onClick={() => void decline()}>{busy ? "Sending…" : "Decline to sign"}</button>
                      <button type="button" className="nda-sign-link" onClick={() => setDeclining(false)}>Back to signing</button>
                    </div>
                  </div>
                )}
                {env.expiresAt && <span className="nda-sign-muted">This private link expires on {new Date(env.expiresAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}.</span>}
              </div>
            </div>
          </>
        )}
        <p className="nda-sign-foot">Questions about this agreement? Reply to the email you received from your organisation.</p>
      </div>
    </main>
  );
}
