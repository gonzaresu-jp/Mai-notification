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

  setupScrollSpy();
})();
