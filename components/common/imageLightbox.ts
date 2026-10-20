

export function openImageLightbox(src: string): void {
  if (!src) return;
  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:9999;background:rgba(10,12,16,.88);" +
    "display:flex;align-items:center;justify-content:center;cursor:zoom-out;padding:28px;";
  const img = document.createElement("img");
  img.src = src;
  img.alt = "";
  img.style.cssText =
    "max-width:96%;max-height:96%;object-fit:contain;border-radius:8px;" +
    "box-shadow:0 8px 40px rgba(0,0,0,.5);background:#fff;";
  overlay.appendChild(img);
  const close = () => {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") close();
  };
  // 닫기 클릭이 드로어의 "바깥 클릭 닫기" 감지로 전파돼 작업 드로어까지 닫히는
  // 것을 막는다 (2026-09-28 QA).
  // Drawer의 바깥 감지는 pointerdown 리스너라 pointer 계열도 함께 막아야 한다.
  for (const type of ["pointerdown", "pointerup", "mousedown", "mouseup", "click"] as const) {
    overlay.addEventListener(type, (e) => {
      e.stopPropagation();
      if (type === "click") close();
    });
  }
  document.addEventListener("keydown", onKey);
  document.body.appendChild(overlay);
}
