'use client';
import React from 'react';



const CSS = `
.sx-stat {
  background: var(--surface-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 16px 18px;
  font-family: var(--font-sans);
  display: flex; flex-direction: column; gap: 10px;
}
.sx-stat__top { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.sx-stat__label { font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--text-muted); }
.sx-stat__icon {
  width: 30px; height: 30px; flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: var(--radius-md); background: var(--color-primary-soft); color: var(--color-primary);
}
.sx-stat__icon svg { width: 17px; height: 17px; }
.sx-stat__value { font-size: var(--text-4xl); font-weight: var(--weight-bold); color: var(--text-strong); line-height: 1; letter-spacing: var(--tracking-tight); font-variant-numeric: tabular-nums; }
.sx-stat__value small { font-size: var(--text-lg); font-weight: var(--weight-semibold); color: var(--text-muted); margin-left: 3px; }
.sx-stat__foot { display: flex; align-items: center; gap: 8px; }
.sx-stat__delta { display: inline-flex; align-items: center; gap: 3px; font-size: var(--text-sm); font-weight: var(--weight-semibold); font-variant-numeric: tabular-nums; }
.sx-stat__delta svg { width: 14px; height: 14px; }
.sx-stat__delta--up { color: var(--status-success-text); }
.sx-stat__delta--down { color: var(--status-danger-text); }
.sx-stat__delta--flat { color: var(--text-muted); }
.sx-stat__note { font-size: var(--text-xs); color: var(--text-subtle); }
`;

let _injected = false;
function inject() {
  if (_injected || typeof document === 'undefined') return;
  _injected = true;
  const s = document.createElement('style');
  s.setAttribute('data-sx', 'statcard');
  s.textContent = CSS;
  document.head.appendChild(s);
}

const Arrow = ({ dir }) => dir === 'up'
  ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7M9 7h8v8"/></svg>
  : dir === 'down'
  ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M7 7 17 17M17 9v8H9"/></svg>
  : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M5 12h14"/></svg>;

export function StatCard({ label, value, unit = null, icon = null, delta = null, deltaDirection = 'up', note = null, className = '', ...rest }) {
  inject();
  return (
    <div className={['sx-stat', className].filter(Boolean).join(' ')} {...rest}>
      <div className="sx-stat__top">
        <span className="sx-stat__label">{label}</span>
        {icon && <span className="sx-stat__icon">{icon}</span>}
      </div>
      <div className="sx-stat__value">{value}{unit && <small>{unit}</small>}</div>
      {(delta != null || note) && (
        <div className="sx-stat__foot">
          {delta != null && (
            <span className={`sx-stat__delta sx-stat__delta--${deltaDirection}`}>
              <Arrow dir={deltaDirection} />{delta}
            </span>
          )}
          {note && <span className="sx-stat__note">{note}</span>}
        </div>
      )}
    </div>
  );
}
