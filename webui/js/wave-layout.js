
  window.__layoutReady = (async () => {
    const load = async (id, url) => {
      const el = document.getElementById(id);
      if (!el) return;
      const res = await fetch(url, { cache: 'no-cache' });
      el.innerHTML = await res.text();
    };

    await load('header-slot', '/header.php');
    window.initHeader?.();
    await load('footer-slot', '/footer.php');
  })();
