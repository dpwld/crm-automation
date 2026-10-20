'use client';
import React from 'react';



const CSS = `
.sx-formfield { display: flex; flex-direction: column; gap: 6px; width: 100%; font-family: var(--font-sans); }
.sx-formfield__label { display: inline-flex; align-items: center; gap: 5px; font-size: var(--text-sm); font-weight: var(--weight-semibold); color: var(--text-strong); line-height: 1.3; }
.sx-formfield__req { color: var(--red-500); }
.sx-formfield__optional { font-weight: var(--weight-regular); color: var(--text-subtle); font-size: var(--text-xs); }
.sx-formfield__hint { font-size: var(--text-xs); color: var(--text-muted); line-height: 1.4; }
.sx-formfield__error { display: inline-flex; align-items: center; gap: 5px; font-size: var(--text-xs); color: var(--status-danger-text); line-height: 1.4; }
.sx-formfield__error svg { width: 13px; height: 13px; flex-shrink: 0; }
`;

let _injected = false;
function inject() {
  if (_injected || typeof document === 'undefined') return;
  _injected = true;
  const s = document.createElement('style');
  s.setAttribute('data-sx', 'formfield');
  s.textContent = CSS;
  document.head.appendChild(s);
}

export function FormField({ label, required = false, optional = false, hint = null, error = null, htmlFor = null, className = '', children, ...rest }) {
  inject();
  const cls = ['sx-formfield', className].filter(Boolean).join(' ');
  return (
    <div className={cls} {...rest}>
      {label && (
        <label className="sx-formfield__label" htmlFor={htmlFor || undefined}>
          {label}
          {required && <span className="sx-formfield__req" aria-hidden="true">*</span>}
          {optional && !required && <span className="sx-formfield__optional">Optional</span>}
        </label>
      )}
      {children}
      {error ? (
        <span className="sx-formfield__error">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
          {error}
        </span>
      ) : hint ? (
        <span className="sx-formfield__hint">{hint}</span>
      ) : null}
    </div>
  );
}
