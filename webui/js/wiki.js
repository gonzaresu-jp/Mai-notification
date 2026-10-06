(() => {
  "use strict";

  // 目次のスクロールスパイ（記事本文は静的・API依存なし）
  function setupScrollSpy() {
    const links = [...document.querySelectorAll(".wk-toc-list a")];
    const sections = links
      .map((a) => document.getElementById(a.getAttribute("href").slice(1)))
      .filter(Boolean);
    if (!sections.length || !("IntersectionObserver" in window)) return;

    const visible = new Map();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) visible.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0);
        let bestId = null;
        let bestRatio = 0;
        for (const [id, ratio] of visible) {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestId = id;
          }
        }
        if (!bestId) return;
        links.forEach((a) => a.classList.toggle("is-active", a.getAttribute("href") === "#" + bestId));
      },
      { rootMargin: "-76px 0px -55% 0px", threshold: [0, 0.1, 0.5, 1] }
    );
    sections.forEach((s) => observer.observe(s));
    links[0]?.classList.add("is-active");
  }

  // ---- 衣装画像のライトボックス（新規タブではなくポップアップで拡大表示）
  // document 委譲なので、複数あるギャラリー全部・後から増えた画像も対象
  function setupLightbox() {
    let lastFocus = null;

    function close() {
      const lb = document.querySelector(".wk-lightbox");
      if (lb) lb.remove();
      document.removeEventListener("keydown", onKey);
      if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
    }

    function onKey(e) {
      if (e.key === "Escape") close();
    }

    document.addEventListener("click", (e) => {
      if (!e.target || typeof e.target.closest !== "function") return;
      const a = e.target.closest(".wk-costume-gallery a");
      if (!a) return;
      e.preventDefault();
      const img = a.querySelector("img");
      const fig = a.closest("figure");
      const capEl = fig && fig.querySelector("figcaption");
      const src = a.getAttribute("href");
      const cap = (capEl && capEl.textContent) || (img && img.getAttribute("alt")) || "";

      lastFocus = document.activeElement;
      const lb = document.createElement("div");
      lb.className = "wk-lightbox";
      lb.setAttribute("role", "dialog");
      lb.setAttribute("aria-modal", "true");
      lb.setAttribute("aria-label", cap || "画像の拡大表示");
      lb.innerHTML =
        `<button type="button" class="wk-lb-close" aria-label="閉じる">&times;</button>` +
        `<img src="${src.replace(/"/g, "&quot;")}" alt="${cap.replace(/"/g, "&quot;")}" />` +
        `<div class="wk-lb-cap"></div>`;
      lb.querySelector(".wk-lb-cap").textContent = cap;
      lb.addEventListener("click", close);
      document.body.appendChild(lb);
      document.addEventListener("keydown", onKey);
      lb.querySelector(".wk-lb-close").focus();
    });
  }

  setupLightbox();
  setupScrollSpy();
})();
