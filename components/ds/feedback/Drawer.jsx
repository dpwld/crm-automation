'use client';
import React from 'react';
import { leaveGhost } from './leaveGhost';



const CSS = `
.sx-drawer__scrim {
  position: fixed; inset: 0; z-index: 900;
  background: rgba(24,24,27,0.32);
  animation: sx-drawer-fade var(--dur-base) var(--ease-out);
}
@keyframes sx-drawer-fade { from { opacity: 0; } to { opacity: 1; } }
.sx-drawer {
  position: fixed; top: 0; right: 0; bottom: 0; z-index: 901;
  width: 460px; max-width: 100vw;
  background: var(--surface-card);
  border-left: 1px solid var(--border-subtle);
  box-shadow: var(--shadow-xl);
  display: flex; flex-direction: column;
  font-family: var(--font-sans);
  animation: sx-drawer-slide var(--dur-slow) var(--ease-out);
}
@keyframes sx-drawer-slide { from { transform: translateX(24px); opacity: 0.4; } to { transform: none; opacity: 1; } }
.sx-drawer--left { right: auto; left: 0; border-left: none; border-right: 1px solid var(--border-subtle); }
.sx-drawer--left { animation: sx-drawer-slide-l var(--dur-slow) var(--ease-out); }
@keyframes sx-drawer-slide-l { from { transform: translateX(-24px); opacity: 0.4; } to { transform: none; opacity: 1; } }
.sx-drawer__scrim.is-leaving { animation: sx-drawer-fade-out 170ms ease-in forwards; }
@keyframes sx-drawer-fade-out { to { opacity: 0; } }
.sx-drawer.is-leaving { animation: sx-drawer-leave 170ms ease-in forwards; }
.sx-drawer--left.is-leaving { animation: sx-drawer-leave-l 170ms ease-in forwards; }
@keyframes sx-drawer-leave { to { transform: translateX(32px); opacity: 0; } }
@keyframes sx-drawer-leave-l { to { transform: translateX(-32px); opacity: 0; } }

.sx-drawer__header {
  display: flex; align-items: center; gap: 11px;
  padding: 0 16px 0 20px; height: var(--topbar-height); flex-shrink: 0;
  border-bottom: 1px solid var(--border-subtle);
}
.sx-drawer__title { flex: 1; min-width: 0; display: flex; align-items: center; gap: 9px;
  font-size: var(--text-lg); font-weight: var(--weight-semibold); color: var(--text-strong);
  letter-spacing: var(--tracking-snug); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sx-drawer__title-icon { display: inline-flex; color: var(--color-primary); flex-shrink: 0; }
.sx-drawer__actions { display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0; }
.sx-drawer__close {
  width: 32px; height: 32px; flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
  border: none; background: none; border-radius: var(--radius-md);
  color: var(--text-muted); cursor: pointer;
  transition: background var(--dur-fast), color var(--dur-fast);
}
.sx-drawer__close:hover { background: var(--surface-hover); color: var(--text-strong); }
.sx-drawer__close svg { width: 18px; height: 18px; }
.sx-drawer__body { flex: 1; min-height: 0; overflow-y: auto; padding: 20px; }
.sx-drawer__footer {
  flex-shrink: 0; border-top: 1px solid var(--border-subtle);
  padding: 14px 20px; background: var(--surface-card);
}
`;

let _injected = false;
function inject() {
  if (_injected || typeof document === 'undefined') return;
  _injected = true;
  const s = document.createElement('style');
  s.setAttribute('data-sx', 'drawer');
  s.textContent = CSS;
  document.head.appendChild(s);
}

export function Drawer({
  open = false,
  onClose = null,
  title = null,
  titleIcon = null,
  side = 'right',
  width = 460,
  scrim = false,
  closeOnOutside = false,
  headerActions = null,
  footer = null,
  bodyClassName = '',
  className = '',
  children,
  ...rest
}) {
  inject();
  const asideRef = React.useRef(null);
  const scrimRef = React.useRef(null);
  // 닫힐 때(open→false 또는 언마운트) 보이던 모습을 복제해 밀려나며 사라지게 한다.
  React.useLayoutEffect(() => {
    if (!open) return;
    const aside = asideRef.current;
    const scrimEl = scrimRef.current;
    return () => { leaveGhost(scrimEl, 'is-leaving'); leaveGhost(aside, 'is-leaving'); };
  }, [open]);
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape' && onClose) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  // closeOnOutside: 드로어 밖을 누르면 닫는다. blur 저장(설명·제목 등)이 먼저
  // 실행되도록 다음 틱으로 미뤄서 닫는다. 드로어 내부에서 띄운 모달·팝업은
  // DOM상 드로어 자식이라 contains()로 걸러진다.
  React.useEffect(() => {
    if (!open || !closeOnOutside || !onClose) return;
    const onDown = (e) => {
      const el = asideRef.current;
      if (!el || el.contains(e.target)) return;
      setTimeout(() => onClose(), 0);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open, closeOnOutside, onClose]);
  if (!open) return null;
  return (
    <React.Fragment>
      {scrim && <div ref={scrimRef} className="sx-drawer__scrim" onClick={onClose || undefined} />}
      <aside
        ref={asideRef}
        className={['sx-drawer', side === 'left' ? 'sx-drawer--left' : '', className].filter(Boolean).join(' ')}
        style={{ width }}
        role="dialog"
        aria-modal={scrim ? 'true' : undefined}
        {...rest}
      >
        <div className="sx-drawer__header">
          <div className="sx-drawer__title" title={typeof title === 'string' ? title : undefined}>
            {titleIcon && <span className="sx-drawer__title-icon">{titleIcon}</span>}
            {title}
          </div>
          <div className="sx-drawer__actions">
            {headerActions}
            {onClose && (
              <button className="sx-drawer__close" onClick={onClose} aria-label="Close panel">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            )}
          </div>
        </div>
        <div className={['sx-drawer__body sx-scroll', bodyClassName].filter(Boolean).join(' ')}>{children}</div>
        {footer && <div className="sx-drawer__footer">{footer}</div>}
      </aside>
    </React.Fragment>
  );
}
