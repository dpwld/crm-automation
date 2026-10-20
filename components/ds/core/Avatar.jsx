'use client';
import React from 'react';



const CSS = `
.sx-avatar {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 36px; height: 36px;
  border-radius: var(--radius-pill);
  background: var(--blue-100);
  color: var(--blue-700);
  font-family: var(--font-sans);
  font-weight: var(--weight-semibold);
  font-size: var(--text-sm);
  line-height: 1;
  overflow: visible;
  user-select: none;
}
.sx-avatar--square { border-radius: var(--radius-md); }
.sx-avatar--xs { width: 22px; height: 22px; font-size: var(--text-2xs); }
.sx-avatar--sm { width: 28px; height: 28px; font-size: var(--text-xs); }
.sx-avatar--lg { width: 44px; height: 44px; font-size: var(--text-lg); }
.sx-avatar--xl { width: 56px; height: 56px; font-size: var(--text-2xl); }
.sx-avatar__img { width: 100%; height: 100%; object-fit: cover; border-radius: inherit; display: block; }
.sx-avatar__status {
  position: absolute; right: -1px; bottom: -1px;
  width: 30%; height: 30%; min-width: 8px; min-height: 8px;
  border-radius: 50%;
  border: 2px solid var(--surface-card);
  box-sizing: content-box;
}
.sx-avatar__status--online { background: var(--green-500); }
.sx-avatar__status--away   { background: var(--amber-500); }
.sx-avatar__status--busy   { background: var(--red-500); }
.sx-avatar__status--offline{ background: var(--gray-400); }
`;

let _injected = false;
function inject() {
  if (_injected || typeof document === 'undefined') return;
  _injected = true;
  const s = document.createElement('style');
  s.setAttribute('data-sx', 'avatar');
  s.textContent = CSS;
  document.head.appendChild(s);
}

function initialsOf(name) {
  if (!name) return '';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase();
}


function tintStyle(name) {
  if (!name) return null;
  return { background: 'var(--avatar-bg)', color: 'var(--avatar-text)' };
}

export function Avatar({
  name = '',
  src = null,
  size = 'md',
  square = false,
  status = null,
  className = '',
  style,
  ...rest
}) {
  inject();
  const cls = [
    'sx-avatar',
    size !== 'md' ? `sx-avatar--${size}` : '',
    square ? 'sx-avatar--square' : '',
    className,
  ].filter(Boolean).join(' ');
  return (
    <span className={cls} style={{ ...(src ? null : tintStyle(name)), ...style }} title={name || undefined} {...rest}>
      {src ? <img className="sx-avatar__img" src={src} alt={name} /> : initialsOf(name)}
      {status && <span className={`sx-avatar__status sx-avatar__status--${status}`} aria-hidden="true" />}
    </span>
  );
}
