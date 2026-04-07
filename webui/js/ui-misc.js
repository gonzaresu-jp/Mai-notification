// ui-misc.js - ログ設定メニューの開閉・コピーボタン

// ===== ログ設定メニュー & リンク設定メニュー =====
(() => {
  const logBtn = document.getElementById('btn-log-settings');
  const logMenu = document.getElementById('log-settings-container');
  const linkBtn = document.getElementById('btn-link-settings');
  const linkMenu = document.getElementById('link-settings-container');

  if (logBtn && logMenu) {
    logBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = logMenu.classList.toggle('is-open');
      logBtn.setAttribute('aria-expanded', String(open));
      logMenu.setAttribute('aria-hidden', String(!open));
      
      // リンク設定が開いていたら閉じる
      if (open && linkMenu && linkMenu.classList.contains('is-open')) {
        linkMenu.classList.remove('is-open');
        linkBtn.setAttribute('aria-expanded', 'false');
        linkMenu.setAttribute('aria-hidden', 'true');
      }
    });
  }

  if (linkBtn && linkMenu) {
    linkBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = linkMenu.classList.toggle('is-open');
      linkBtn.setAttribute('aria-expanded', String(open));
      linkMenu.setAttribute('aria-hidden', String(!open));

      // ログ設定が開いていたら閉じる
      if (open && logMenu && logMenu.classList.contains('is-open')) {
        logMenu.classList.remove('is-open');
        logBtn.setAttribute('aria-expanded', 'false');
        logMenu.setAttribute('aria-hidden', 'true');
      }
    });
  }

  // メニュー外クリックで閉じる
  document.addEventListener('click', e => {
    // ログ設定
    if (logBtn && logMenu && !logBtn.contains(e.target) && !logMenu.contains(e.target)) {
      logMenu.classList.remove('is-open');
      logBtn.setAttribute('aria-expanded', 'false');
      logMenu.setAttribute('aria-hidden', 'true');
    }
    // リンク設定
    if (linkBtn && linkMenu && !linkBtn.contains(e.target) && !linkMenu.contains(e.target)) {
      linkMenu.classList.remove('is-open');
      linkBtn.setAttribute('aria-expanded', 'false');
      linkMenu.setAttribute('aria-hidden', 'true');
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

    ta.style.cssText = `
      position:fixed;
      top:-1000px;
      left:-1000px;
    `;

    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }

  document.addEventListener('click', async e => {
    const btn = e.target.closest('.stat-copy-btn');
    if (!btn) return;

    const item = btn.closest('.stat-item');

    const label =
      item?.querySelector('.label')?.textContent?.trim() ?? '';

    const id = btn.dataset.copyTarget;

    const valueText =
      (id
        ? document.getElementById(id)
        : item?.querySelector('.value')
      )?.textContent?.trim() ?? '';

    const text = `${label} ${valueText}`.trim();
    if (!text) return;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        fallbackCopy(text);
      }
    } catch {
      fallbackCopy(text);
    }

    // UI状態変更（FontAwesome壊さない）
    btn.classList.add('copied');

    // 連打対策
    if (btn._copyTimer) clearTimeout(btn._copyTimer);

    btn._copyTimer = setTimeout(() => {
      btn.classList.remove('copied');
      btn._copyTimer = null;
    }, 900);

  });

})();