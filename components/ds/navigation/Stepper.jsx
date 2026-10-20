'use client';
import React from 'react';



const CSS = `
.sx-stepper { display: flex; align-items: flex-start; font-family: var(--font-sans); width: 100%; min-width: max-content; }
.sx-step { display: flex; align-items: center; flex: 1 0 auto; min-width: max-content; }
.sx-step:last-child { flex: 0 0 auto; }
.sx-step__node { display: flex; align-items: center; gap: 10px; cursor: default; flex-shrink: 0; }
.sx-step--clickable .sx-step__node { cursor: pointer; }
.sx-step__circle {
  width: 28px; height: 28px; flex-shrink: 0;
  border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: var(--text-sm); font-weight: var(--weight-semibold); font-variant-numeric: tabular-nums;
  border: 1.5px solid var(--border-strong);
  background: var(--surface-card); color: var(--text-muted);
  transition: background-color var(--dur-base) var(--ease-out), border-color var(--dur-base) var(--ease-out), color var(--dur-base) var(--ease-out);
}
.sx-step__circle svg { width: 15px; height: 15px; }
.sx-step__text { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.sx-step__title { font-size: var(--text-sm); font-weight: var(--weight-semibold); color: var(--text-muted); white-space: nowrap; }
.sx-step__sub { font-size: var(--text-xs); color: var(--text-subtle); white-space: nowrap; }
.sx-step__line { flex: 1; height: 2px; background: var(--border-subtle); margin: 0 12px; border-radius: 2px; min-width: 16px; }


.sx-step--complete .sx-step__circle { background: var(--color-primary); border-color: var(--color-primary); color: #fff; }
.sx-step--complete .sx-step__title { color: var(--text-default); }
.sx-step--complete .sx-step__line { background: var(--color-primary); }

.sx-step--current .sx-step__circle { border-color: var(--color-primary); color: var(--color-primary); box-shadow: 0 0 0 4px var(--color-primary-soft); }
.sx-step--current .sx-step__title { color: var(--text-strong); }

.sx-step--active .sx-step__node { background: var(--color-primary-soft); border-radius: var(--radius-md); padding: 4px 10px; margin: -4px -2px; }
.sx-step--active .sx-step__title { color: var(--color-primary); }
.sx-step--active .sx-step__circle { border-color: var(--color-primary); color: var(--color-primary); }
.sx-step--clickable .sx-step__node:hover { background: var(--surface-sunken); border-radius: var(--radius-md); }
.sx-step--active.sx-step--clickable .sx-step__node:hover { background: var(--color-primary-soft); }
`;

let _injected = false;
function inject() {
  if (_injected || typeof document === 'undefined') return;
  _injected = true;
  const s = document.createElement('style');
  s.setAttribute('data-sx', 'stepper');
  s.textContent = CSS;
  document.head.appendChild(s);
}

const Check = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>;

export function Stepper({ steps = [], current = 0, active = null, onStepClick = null, clickAny = false, className = '', ...rest }) {
  inject();
  return (
    <div className={['sx-stepper', className].filter(Boolean).join(' ')} {...rest}>
      {steps.map((st, i) => {
        const state = i < current ? 'complete' : i === current ? 'current' : 'upcoming';
        const clickable = onStepClick && (clickAny || i <= current);
        return (
          <div key={i} className={`sx-step sx-step--${state}${clickable ? ' sx-step--clickable' : ''}${active === i ? ' sx-step--active' : ''}`}>
            <div className="sx-step__node" onClick={clickable ? () => onStepClick(i) : undefined}>
              <span className="sx-step__circle">{state === 'complete' ? <Check /> : (st.icon || i + 1)}</span>
              <span className="sx-step__text">
                <span className="sx-step__title">{st.title}</span>
                {st.subtitle && <span className="sx-step__sub">{st.subtitle}</span>}
              </span>
            </div>
            {i < steps.length - 1 && <span className="sx-step__line" />}
          </div>
        );
      })}
    </div>
  );
}
