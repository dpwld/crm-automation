'use client';
import React from 'react';



const CSS = `
.sx-check { display: inline-flex; align-items: flex-start; gap: 8px; cursor: pointer; font-family: var(--font-sans); font-size: var(--text-md); color: var(--text-default); user-select: none; }
.sx-check--disabled { cursor: not-allowed; opacity: 0.5; }
.sx-check__box {
  width: 18px; height: 18px; flex-shrink: 0; margin-top: 1px;
  border: 1.5px solid var(--border-strong);
  border-radius: var(--radius-xs);
  background: var(--surface-card);
  display: inline-flex; align-items: center; justify-content: center;
  color: #fff;
  transition: background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out);
}
.sx-check:hover .sx-check__box { border-color: var(--color-primary); }
.sx-check__native { position: absolute; opacity: 0; width: 0; height: 0; }
.sx-check__native:focus-visible + .sx-check__box { box-shadow: var(--ring-focus); border-color: var(--color-primary); }
.sx-check--checked .sx-check__box, .sx-check--indeterminate .sx-check__box {
  background: var(--color-primary); border-color: var(--color-primary);
}
.sx-check__box svg { width: 13px; height: 13px; }
.sx-check__label { line-height: 18px; }
`;

let _injected = false;
function inject() {
  if (_injected || typeof document === 'undefined') return;
  _injected = true;
  const s = document.createElement('style');
  s.setAttribute('data-sx', 'checkbox');
  s.textContent = CSS;
  document.head.appendChild(s);
}

export function Checkbox({
  checked,
  defaultChecked,
  indeterminate = false,
  disabled = false,
  onChange,
  className = '',
  children,
  ...rest
}) {
  inject();
  const ref = React.useRef(null);
  const [internal, setInternal] = React.useState(defaultChecked || false);
  const isControlled = checked !== undefined;
  const isChecked = isControlled ? checked : internal;
  React.useEffect(() => { if (ref.current) ref.current.indeterminate = indeterminate; }, [indeterminate]);
  const cls = [
    'sx-check',
    isChecked ? 'sx-check--checked' : '',
    indeterminate ? 'sx-check--indeterminate' : '',
    disabled ? 'sx-check--disabled' : '',
    className,
  ].filter(Boolean).join(' ');
  return (
    <label className={cls} style={{ position: 'relative' }}>
      <input
        ref={ref}
        type="checkbox"
        className="sx-check__native"
        checked={isControlled ? checked : undefined}
        defaultChecked={isControlled ? undefined : defaultChecked}
        disabled={disabled}
        onChange={(e) => { if (!isControlled) setInternal(e.target.checked); onChange && onChange(e); }}
        {...rest}
      />
      <span className="sx-check__box" aria-hidden="true">
        {indeterminate ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round"><path d="M5 12h14"/></svg>
        ) : isChecked ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
        ) : null}
      </span>
      {children && <span className="sx-check__label">{children}</span>}
    </label>
  );
}
