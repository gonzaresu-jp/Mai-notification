// ui-misc.js - ログ設定メニューの開閉・コピーボタン

// ===== ログ設定メニュー =====
(() => {
  const btn  = document.getElementById('btn-log-settings');
  const menu = document.getElementById('log-settings-container');
  if (!btn || !menu) return;

  btn.addEventListener('click', () => {
    const open = menu.classList.toggle('is-open');
    btn.setAttribute('aria-expanded', open);
    menu.setAttribute('aria-hidden', !open);
  });

  // メニュー外クリックで閉じる
  document.addEventListener('click', e => {
    if (!btn.contains(e.target) && !menu.contains(e.target)) {
      menu.classList.remove('is-open');
      btn.setAttribute('aria-expanded', 'false');
      menu.setAttribute('aria-hidden', 'true');
    }
  });
})();


// ===== stat コピーボタン =====
(() => {
  function fallbackCopy(text) {
    const ta = Object.assign(document.createElement('textarea'), {
      value: text,
      readOnly: true,
    });
    ta.style.cssText = 'position:absolute;left:-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }

  document.addEventListener('click', async e => {
    const btn = e.target.closest('.stat-copy-btn');
    if (!btn) return;

    const item      = btn.closest('.stat-item');
    const label     = item?.querySelector('.label')?.textContent?.trim() ?? '';
    const id        = btn.dataset.copyTarget;
    const valueText = (id ? document.getElementById(id) : item?.querySelector('.value'))
                        ?.textContent?.trim() ?? '';
    const text = `${label} ${valueText}`.trim();
    if (!text) return;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        fallbackCopy(text);
      }
      const original = btn.textContent;
      btn.textContent = 'copied';
      setTimeout(() => { btn.textContent = original; }, 900);
    } catch {
      fallbackCopy(text);
    }
  });
})();
