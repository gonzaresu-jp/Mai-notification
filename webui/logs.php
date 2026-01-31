<!doctype html>
<html lang="ja">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Update logs</title>
    <link rel="icon" href="./icon.ico">
    <link rel="stylesheet" href="/style.v1.css" />
    <style type="text/css">
        dt {font-size: 24px;}
        @media(max-width: 800px){dt{font-size: 16px} .card{display: block;} img{ max-width: 80vw!important;}}
        .bg {background-color:#B11E7C; min-width:3px; }
        img {max-width: 40vw;}
        #day {white-space: nowrap;}
    </style>
</head>
<body id="app-body">
    <div id="header-slot">
        <?php include __DIR__ . '/header.html'; ?>
    </div>

    <main>
        <h2 class="history fade">Update logs</h2>
        <div class="card">
            <dl>
                <dt>2026-02-01</dt>
            </dl>
            <div class="bg"></div>
            <dl>
                <dt>通知するプラットフォームにTwitchを追加、管理者用ログインページからのリダイレクトを修正</dt>
            </dl>
        </div>
        <div class="card">
            <dl>
                <dt id="day">2026-01-16</dt>
            </dl>
            <div class="bg"></div>
            <dl>
                <dt>phpを導入し、一部htmlをphpに変更</dt>
            </dl>
        </div>
        <div class="card">
            <dl>
                <dt id="day">2026-01-15</dt>
            </dl>
            <div class="bg"></div>
            <dl>
                <dt>通知履歴最初の5件をhistory.htmlとして生成しておくことにより初期ロードが爆速化,API統合により速度向上</dt>
            </dl>
        </div>
        <div class="card">
            <dl>
                <dt id="day">2026-01-14</dt>
            </dl>
            <div class="bg"></div>
            <dl>
                <dt>Node.jsをv20.18.1→v24.13.0に更新,初期ロード時ハンバーガーメニューが即時開けないように1s遅延,初期状態でGiptもTrueになるように変更,速度向上のためスマホでは使われないFontAwesomeを読み込まないように変更,画像ファイルの最適化</dt>
            </dl>
        </div>
        <div class="card">
            <dl>
                <dt id="day">2026-01-13</dt>
            </dl>
            <div class="bg"></div>
            <dl>
                <dt>html,css,jsはキャッシュせず画像ファイルのみキャッシュするようにservice-worker.jsを変更</dt>
            </dl>
        </div>
        <div class="card">
            <dl>
                <dt id="day">2026-01-08</dt>
            </dl>
            <div class="bg"></div>
            <dl>
                <dt>Gipt稼働,左からまいちゃんが出現する追加</dt>
            </dl>
        </div>
        <div class="card">
            <dl>
                <dt id="day">2026-01-07</dt>
            </dl>
            <div class="bg"></div>
            <dl>
                <dt>PCでのプッシュ通知外部リンク先を新しいタブで開くように変更,メニューよりfooterが前面に出ていたのを修正</dt>
            </dl>
        </div>
        <div class="card">
            <dl>
                <dt id="day">2026-01-06</dt>
            </dl>
            <div class="bg"></div>
            <dl>
                <dt>各ページheaderとfooterの統一,Gipt機能停止,メニューバーのスクロール,Update logsの追加</dt>
            </dl>
        </div>
        <div class="card">
            <dl>
                <dt id="day">2025-12-21</dt>
            </dl>
            <div class="bg"></div>
            <dl>
                <dt>Gipt追加</dt>
            </dl>
        </div>
        <div class="card">
            <dl>
                <dt id="day">2025-11-29</dt>
            </dl>
            <div class="bg"></div>
            <dl>
                <dt>YTコミュニティ以外、全てのプラットフォームで動作確認済み</dt>
            </dl>
        </div>
        <div class="card">
            <dl>
                <dt id="day">2025-11-26</dt>
            </dl>
            <div class="bg"></div>
            <dl>
                <dt>リリース,推し日数追加</dt>
            </dl>
        </div>
        <div class="card">
            <dl>
                <dt id="day">2025-11-25</dt>
            </dl>
            <div class="bg"></div>
            <dl>
                <dt>横スワイプメニュー開閉,通知履歴プラットフォーム毎表示切り替え</dt>
            </dl>
        </div>
        <div class="card">
            <dl>
                <dt id="day">2025-11-17</dt>
            </dl>
            <div class="bg"></div>
            <dl>
                <dt>テスト運用開始</dt>
            </dl>
        </div>
        <div class="card">
            <dl>
                <dt id="day">2025-11-09</dt>
            </dl>
            <div class="bg"></div>
            <dl>
                <dt>開発開始</dt>
            </dl>
            <img src="/start.png">
        </div>
        
<a href="../" 
   style="text-decoration:none; color:inherit; display:block;">
    <div style="
        background-color:#FFF;
        min-height:60px;
        display:flex;
        align-items:center;
        justify-content:center;
        padding:10px 20px; /* ←クリック範囲を広げる */
    ">
        <h3 style="margin:0;">通知ダッシュボードに戻る</h3>
    </div>
</a>




    </main>

    <div id="footer-slot">
        <?php include __DIR__ . '/footer.html'; ?>
    </div>

<!-- iOS Helper を main.js より先に読み込む -->
    <script src="/ios-helper.js" defer></script>
    <script type="module" src="/js/main.js" defer></script>
    <script>
const btn = document.getElementById('btn-log-settings');
const menu = document.getElementById('log-settings-container');

btn.addEventListener('click', () => {
  const open = menu.classList.toggle('is-open');
  btn.setAttribute('aria-expanded', open);
  menu.setAttribute('aria-hidden', !open);
});

// メニュー外クリックで閉じる
document.addEventListener('click', (e) => {
  if (!btn.contains(e.target) && !menu.contains(e.target)) {
    menu.classList.remove('is-open');
    btn.setAttribute('aria-expanded', false);
    menu.setAttribute('aria-hidden', true);
  }
});

</script>

<script>
function initOshiDays() {
  const STORAGE_KEY = "maistart_date";
  const DEFAULT_DATE = "2020-01-07";
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  const dateInput = document.getElementById("start");              // header内
  const meetValueEl = document.getElementById("days-to-meet");     // main内
  const meetStatItem = meetValueEl?.closest(".stat-item");

  if (!meetValueEl || !meetStatItem) return; // 表示側がないなら何もしない
  if (!dateInput) return;                    // headerが未挿入なら何もしない（待つ側で保証する）

  function parseYMD(ymd) {
    if (!ymd) return null;
    const parts = ymd.split("-").map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
    return new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
  }
  function stripTime(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  }
  function daysSinceLocal(date) {
    const now = stripTime(new Date()).getTime();
    const then = stripTime(date).getTime();
    return Math.max(0, Math.floor((now - then) / MS_PER_DAY));
  }

  function loadAndApply() {
    const stored = localStorage.getItem(STORAGE_KEY);
    let effective = stored || dateInput.value || null;

    // DEFAULT_DATE を「未設定扱い」
    if (!effective || effective === DEFAULT_DATE) {
      meetStatItem.style.display = "none";
      meetValueEl.textContent = "0 日";
      if (!stored) dateInput.value = "";
      return;
    }

    const parsed = parseYMD(effective);
    if (!parsed) {
      meetStatItem.style.display = "none";
      return;
    }

    const since = daysSinceLocal(parsed);
    meetValueEl.textContent = `${since} 日`;
    meetStatItem.style.display = "";
    if (dateInput.value !== effective) dateInput.value = effective;
  }

  function saveDate(value) {
    if (!value || value === DEFAULT_DATE) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, value);
    loadAndApply();
  }

  // 多重登録防止
  if (dateInput.dataset.boundOshiDays === "1") {
    loadAndApply();
    return;
  }
  dateInput.dataset.boundOshiDays = "1";

  loadAndApply();
  dateInput.addEventListener("change", (e) => saveDate(e.target.value));

  // 「保存」ボタン（ユーザー名保存と共用）でも保存したいなら
  const saveBtn = document.getElementById("subscriber-name-submit");
  if (saveBtn && !saveBtn.dataset.boundOshiDays) {
    saveBtn.dataset.boundOshiDays = "1";
    saveBtn.addEventListener("click", () => saveDate(dateInput.value));
  }

  // 日付跨ぎ対策
  setInterval(loadAndApply, 60 * 1000);
}


(async () => {
  const load = async (id, url) => {
    const el = document.getElementById(id);
    if (!el) return;
    const res = await fetch(url, { cache: 'no-cache' });
    el.innerHTML = await res.text();
  };
})();
</script>
<script>
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./service-worker.js')
            .then(reg => console.log('Service Worker 登録成功', reg))
            .catch(err => console.error('Service Worker 登録失敗', err));
    }

// 1. フェードイン用関数（定義するだけ。ロード時は呼ばない）
    function applyHamburgerSequentialFadeIn() {
        const menuItems = document.querySelectorAll('#nav-menu > .nav-list > li');
        const delayIncrement = 100; 

        menuItems.forEach((item, index) => {
            const delay = index * delayIncrement;
            setTimeout(() => {
                item.classList.add('is-faded-in');
            }, delay);
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
    const body = document.getElementById('app-body');

    // 1) 初期はトランジション無効（bodyに class を付けておく）
    //    ここでは最小遅延で「初回描画を挟んで」トランジションを有効にする。
    requestAnimationFrame(() => {
        // 1フレーム待ってからさらに次フレームで class を除去 → トランジションが発火するのは以降の操作だけ
        requestAnimationFrame(() => {
            body.classList.remove('menu-transitions-disabled');
        });
    });

    // --- 以下は既存の初期化処理（メニュー初期化等） ---
    const toggle = document.getElementById('hamburger-toggle');
    const overlay = document.getElementById('menu-overlay');
    const notifyToggle = document.getElementById('toggle-notify');

    // メニュー項目集合
    const menuItems = document.querySelectorAll('#nav-menu > .nav-list > li');
    // 初期状態として is-faded-in を外しておく（念のため）
    menuItems.forEach(item => item.classList.remove('is-faded-in'));

    function applyHamburgerSequentialFadeIn() {
        const delayIncrement = 100;
        menuItems.forEach((item, index) => {
            const delay = index * delayIncrement;
            setTimeout(() => {
                item.classList.add('is-faded-in');
            }, delay);
        });
    }

    function toggleMenu(isOpen) {
        if (isOpen) {
            // 開くときはまずクラスを外して確実に 0 → 1 の遷移が発生するように
            menuItems.forEach(item => item.classList.remove('is-faded-in'));

            body.classList.add('menu-open');
            toggle.setAttribute('aria-expanded', 'true');
            overlay.style.display = 'block';

            // スライド等の外枠アニメーションがあるなら遅延（既定値の 300ms 等）
            setTimeout(() => applyHamburgerSequentialFadeIn(), 300);
        } else {
            body.classList.remove('menu-open');
            toggle.setAttribute('aria-expanded', 'false');
            overlay.style.display = 'none';
            menuItems.forEach(item => item.classList.remove('is-faded-in'));
        }
    }

    // --- 右端スワイプでメニュー開閉 ---
// 挿入場所: document.addEventListener('DOMContentLoaded', ...) 内、toggleMenu 定義の直後
(function installRightEdgeSwipeMenu() {
    const EDGE_START = 270;
    const OPEN_THRESHOLD = 60;
    const CLOSE_THRESHOLD = 60;
    const MAX_VERTICAL_DELTA = 30;
    let pointerActive = false;
    let startX = 0, startY = 0;
    let trackingForOpen = false;
    let trackingForClose = false;

    function isMenuOpen() {
        return document.body.classList.contains('menu-open');
    }

    function onPointerDown(e) {
        const x = e.clientX || (e.touches && e.touches[0].clientX);
        const y = e.clientY || (e.touches && e.touches[0].clientY);

        startX = x; startY = y;
        pointerActive = true;
        trackingForOpen = false;
        trackingForClose = false;

        if (!isMenuOpen() && startX >= (window.innerWidth - EDGE_START)) {
            trackingForOpen = true;
        }

        if (isMenuOpen()) {
            const menu = document.getElementById('nav-menu');
            const overlay = document.getElementById('menu-overlay');
            const target = e.target || (e.touches && e.touches[0].target);
            
            if (overlay && overlay.style.display !== 'none' && overlay.contains(target)) {
                trackingForClose = true;
            } else if (menu) {
                const r = menu.getBoundingClientRect();
                if (startX >= r.left && startX <= r.right && startY >= r.top && startY <= r.bottom) {
                    trackingForClose = true;
                }
            }
        }
    }

    function onPointerMove(e) {
        if (!pointerActive) return;
        
        const x = e.clientX || (e.touches && e.touches[0].clientX);
        const y = e.clientY || (e.touches && e.touches[0].clientY);
        const dx = x - startX;
        const dy = y - startY;

        if (Math.abs(dy) > MAX_VERTICAL_DELTA) {
            trackingForOpen = false;
            trackingForClose = false;
            return;
        }

        if (trackingForOpen && dx < -OPEN_THRESHOLD) {
            toggleMenu(true);
            trackingForOpen = false;
            pointerActive = false;
            if (e.cancelable) e.preventDefault();
            return;
        }

        if (trackingForClose && dx > CLOSE_THRESHOLD) {
            toggleMenu(false);
            trackingForClose = false;
            pointerActive = false;
            if (e.cancelable) e.preventDefault();
            return;
        }
    }

    function onPointerUp() {
        pointerActive = false;
        trackingForOpen = false;
        trackingForClose = false;
    }

    // タッチデバイス優先で登録
    if ('ontouchstart' in window) {
        // タッチデバイスの場合
        document.addEventListener('touchstart', onPointerDown, { passive: true });
        document.addEventListener('touchmove', onPointerMove, { passive: false }); // passive: false が重要
        document.addEventListener('touchend', onPointerUp, { passive: true });
        document.addEventListener('touchcancel', onPointerUp, { passive: true });
    } else if (window.PointerEvent) {
        // Pointer Events 対応デバイス
        document.addEventListener('pointerdown', onPointerDown, { passive: true });
        document.addEventListener('pointermove', onPointerMove, { passive: false });
        document.addEventListener('pointerup', onPointerUp, { passive: true });
        document.addEventListener('pointercancel', onPointerUp, { passive: true });
    }
})();

    toggle.addEventListener('click', () => {
        const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
        toggleMenu(!isExpanded);
    });
    overlay.addEventListener('click', () => toggleMenu(false));

    if (notifyToggle) {
        function updateToggleImage() {
            if (notifyToggle.checked) body.classList.add('notifications-enabled');
            else body.classList.remove('notifications-enabled');
        }
        notifyToggle.addEventListener('change', updateToggleImage);
        setTimeout(updateToggleImage, 100);
    }
});

</script>
</body>
</html>