
export function leaveGhost(el, leavingClass, ms = 170) {
  if (!el || typeof document === 'undefined') return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const ghost = el.cloneNode(true);
  ghost.classList.add(leavingClass);
  ghost.setAttribute('aria-hidden', 'true');
  ghost.removeAttribute('id');
  ghost.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
  ghost.style.pointerEvents = 'none';
  document.body.appendChild(ghost);
  // 복제본은 스크롤 위치를 잃으므로 원본의 스크롤을 옮겨 내용이 튀지 않게 한다.
  const src = el.querySelectorAll('*');
  const dst = ghost.querySelectorAll('*');
  for (let i = 0; i < src.length; i++) {
    if (src[i].scrollTop) dst[i].scrollTop = src[i].scrollTop;
    // 입력값은 속성이 아니라 프로퍼티라 복제되지 않는다 — 사라지는 동안 빈칸으로 깜빡이지 않게 옮긴다.
    const tag = src[i].tagName;
    if ((tag === 'INPUT' && src[i].type !== 'file') || tag === 'TEXTAREA' || tag === 'SELECT') dst[i].value = src[i].value;
  }
  window.setTimeout(() => ghost.remove(), ms);
}
