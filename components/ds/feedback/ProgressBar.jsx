'use client';
import React from 'react';



const CSS = `
.sx-progress { font-family: var(--font-sans); width: 100%; }
.sx-progress__head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
.sx-progress__label { font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--text-default); }
.sx-progress__value { font-size: var(--text-sm); font-weight: var(--weight-semibold); color: var(--text-muted); font-variant-numeric: tabular-nums; }
.sx-progress__track { width: 100%; height: 8px; background: var(--surface-active); border-radius: var(--radius-pill); overflow: hidden; }
.sx-progress--sm .sx-progress__track { height: 5px; }
.sx-progress--lg .sx-progress__track { height: 12px; }
.sx-progress__fill { height: 100%; border-radius: inherit; background: var(--color-primary); transition: width var(--dur-slow) var(--ease-out); }
.sx-progress__fill--success { background: var(--green-500); }
.sx-progress__fill--warning { background: var(--amber-500); }
.sx-progress__fill--danger { background: var(--red-500); }
`;

let _injected = false;
function inject() {
  if (_injected || typeof document === 'undefined') return;
  _injected = true;
  const s = document.createElement('style');
  s.setAttribute('data-sx', 'progress');
  s.textContent = CSS;
  document.head.appendChild(s);
}

export function ProgressBar({ value = 0, max = 100, label = null, showValue = false, tone = 'primary', size = 'md', className = '', ...rest }) {
  inject();
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const fillTone = tone !== 'primary' ? ` sx-progress__fill--${tone}` : '';
  return (
    <div className={['sx-progress', size !== 'md' ? `sx-progress--${size}` : '', className].filter(Boolean).join(' ')} {...rest}>
      {(label || showValue) && (
        <div className="sx-progress__head">
          {label && <span className="sx-progress__label">{label}</span>}
          {showValue && <span className="sx-progress__value">{Math.round(pct)}%</span>}
        </div>
      )}
      <div className="sx-progress__track" role="progressbar" aria-valuenow={value} aria-valuemax={max}>
        <div className={`sx-progress__fill${fillTone}`} style={{ width: pct + '%' }} />
      </div>
    </div>
  );
}
