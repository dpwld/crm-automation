'use client';
import React from 'react';



const CSS = `
.sx-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  font-family: var(--font-sans);
  font-weight: var(--weight-medium);
  font-size: var(--text-sm);
  line-height: 1;
  color: var(--text-default);
  background: var(--surface-card);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-pill);
  white-space: nowrap;
  transition: background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out);
}
.sx-tag--sm { height: 24px; font-size: var(--text-xs); padding: 0 8px; gap: 4px; }
.sx-tag--clickable { cursor: pointer; }
.sx-tag--clickable:hover { background: var(--surface-hover); border-color: var(--border-strong); }
.sx-tag--active { background: var(--color-primary-soft); border-color: var(--blue-300); color: var(--color-primary-soft-text); }
.sx-tag svg { width: 14px; height: 14px; }
.sx-tag__dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.sx-tag__x {
  display: inline-flex; align-items: center; justify-content: center;
  width: 16px; height: 16px; margin-right: -3px;
  border-radius: 50%; cursor: pointer; color: var(--text-muted);
  transition: background var(--dur-fast), color var(--dur-fast);
}
.sx-tag__x:hover { background: var(--surface-active); color: var(--text-strong); }
`;

let _injected = false;
function inject() {
  if (_injected || typeof document === 'undefined') return;
  _injected = true;
  const s = document.createElement('style');
  s.setAttribute('data-sx', 'tag');
  s.textContent = CSS;
  document.head.appendChild(s);
}

export function Tag({
  size = 'md',
  active = false,
  dotColor = null,
  onRemove = null,
  onClick = null,
  className = '',
  children,
  ...rest
}) {
  inject();
  const clickable = !!onClick;
  const cls = [
    'sx-tag',
    size === 'sm' ? 'sx-tag--sm' : '',
    clickable ? 'sx-tag--clickable' : '',
    active ? 'sx-tag--active' : '',
    className,
  ].filter(Boolean).join(' ');
  return (
    <span className={cls} onClick={onClick} {...rest}>
      {dotColor && <span className="sx-tag__dot" style={{ background: dotColor }} aria-hidden="true" />}
      {children}
      {onRemove && (
        <span
          className="sx-tag__x"
          role="button"
          aria-label="Remove"
          onClick={(e) => { e.stopPropagation(); onRemove(e); }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </span>
      )}
    </span>
  );
}
