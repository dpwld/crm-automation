'use client';
import React from 'react';



const CSS = `
.sx-toast {
  display: flex; align-items: flex-start; gap: 11px;
  background: var(--surface-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  padding: 12px 14px; min-width: 280px; max-width: 400px;
  font-family: var(--font-sans);
  animation: sx-toast-in 240ms cubic-bezier(0.2, 0.8, 0.3, 1);
}
@keyframes sx-toast-in { from { opacity: 0; transform: translateY(10px) scale(0.98); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .sx-toast { animation: none; } }
.sx-toast__accent { width: 3px; align-self: stretch; border-radius: 3px; flex-shrink: 0; background: var(--color-primary); }
.sx-toast--success .sx-toast__accent { background: var(--green-500); }
.sx-toast--warning .sx-toast__accent { background: var(--amber-500); }
.sx-toast--danger  .sx-toast__accent { background: var(--red-500); }
.sx-toast__icon { flex-shrink: 0; margin-top: 1px; display: inline-flex; color: var(--color-primary); }
.sx-toast--success .sx-toast__icon { color: var(--green-600); }
.sx-toast--warning .sx-toast__icon { color: var(--amber-600); }
.sx-toast--danger  .sx-toast__icon { color: var(--red-500); }
.sx-toast__icon svg { width: 18px; height: 18px; }
.sx-toast__body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.sx-toast__title { font-size: var(--text-md); font-weight: var(--weight-semibold); color: var(--text-strong); line-height: 1.4; }
.sx-toast__desc { font-size: var(--text-sm); color: var(--text-muted); line-height: 1.45; }
.sx-toast__close { flex-shrink: 0; width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center; border-radius: var(--radius-sm); color: var(--text-subtle); cursor: pointer; background: none; border: none; }
.sx-toast__close:hover { background: var(--surface-hover); color: var(--text-strong); }
.sx-toast__close svg { width: 14px; height: 14px; }
`;

let _injected = false;
function inject() {
  if (_injected || typeof document === 'undefined') return;
  _injected = true;
  const s = document.createElement('style');
  s.setAttribute('data-sx', 'toast');
  s.textContent = CSS;
  document.head.appendChild(s);
}

const ICONS = {
  info: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>,
  success: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>,
  warning: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>,
  danger: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/></svg>,
};

export function Toast({ tone = 'info', title = null, icon, onClose = null, className = '', children, ...rest }) {
  inject();
  return (
    <div className={['sx-toast', `sx-toast--${tone}`, className].filter(Boolean).join(' ')} role="status" {...rest}>
      <span className="sx-toast__accent" aria-hidden="true" />
      <span className="sx-toast__icon">{icon !== undefined ? icon : ICONS[tone]}</span>
      <div className="sx-toast__body">
        {title && <div className="sx-toast__title">{title}</div>}
        {children && <div className="sx-toast__desc">{children}</div>}
      </div>
      {onClose && (
        <button className="sx-toast__close" onClick={onClose} aria-label="Dismiss">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      )}
    </div>
  );
}
