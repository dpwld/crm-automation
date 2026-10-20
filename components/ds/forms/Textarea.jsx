'use client';
import React from 'react';



const CSS = `
.sx-textarea {
  width: 100%;
  min-height: 80px;
  background: var(--surface-card);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  font-family: var(--font-sans);
  font-size: var(--text-md);
  line-height: var(--leading-normal);
  color: var(--text-strong);
  padding: 9px 12px;
  resize: vertical;
  outline: none;
  transition: border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out);
}
.sx-textarea:hover { border-color: var(--border-strong); }
.sx-textarea:focus { border-color: var(--color-primary); box-shadow: var(--ring-focus); }
.sx-textarea::placeholder { color: var(--text-subtle); }
.sx-textarea--error { border-color: var(--red-500); }
.sx-textarea:disabled { background: var(--surface-sunken); color: var(--text-subtle); cursor: not-allowed; }
`;

let _injected = false;
function inject() {
  if (_injected || typeof document === 'undefined') return;
  _injected = true;
  const s = document.createElement('style');
  s.setAttribute('data-sx', 'textarea');
  s.textContent = CSS;
  document.head.appendChild(s);
}

export function Textarea({ error = false, className = '', rows = 3, ...rest }) {
  inject();
  const cls = ['sx-textarea', error ? 'sx-textarea--error' : '', className].filter(Boolean).join(' ');
  return <textarea className={cls} rows={rows} {...rest} />;
}
