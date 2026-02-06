<!-- まいちゃん愛してる！ -->
<!doctype html>
<html lang="ja">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
    <title>まいちゃん通知ダッシュボード</title>

    <meta name="description" content="まいちゃんの配信や活動の通知を受け取れるサービスです。" />

    <meta property="og:url" content="https://mai.honna-yuzuki.com/" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="まいちゃん通知ダッシュボード" />
    <meta property="og:description" content="まいちゃんの配信や活動の通知を受け取れるサービスです。" />
    <meta property="og:site_name" content="まいちゃん通知" />
    <meta property="og:image" content="https://mai.honna-yuzuki.com/social.jpg" />
    <meta property="og:locale" content="ja_JP" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:site" content="@Yuzuki_Mai_17" /> 
    <meta name="twitter:image" content="https://mai.honna-yuzuki.com/social.jpg" />
    
    <!-- iOS対応のmeta情報 -->
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="まいちゃん通知" />

    <meta name="mobile-web-app-capable" content="yes">
    
    <!-- アイコン -->
    <link rel="icon" href="./icon.webp">
    <link rel="apple-touch-icon" href="./icon-192.webp" />
    <link rel="apple-touch-icon" sizes="192x192" href="./icon-192.webp" />
    <link rel="apple-touch-icon" sizes="512x512" href="./icon-512.webp" />
    
    <!-- manifest -->
    <link rel="manifest" href="./manifest.json" />
    
    <link rel="stylesheet" href="./style.v1.css" />
    <link rel="stylesheet" href="./top-card.css" />
    <link rel="preconnect" href="https://elza.poitou-mora.ts.net">
    <!-- iOS Helper を main.js より先に読み込む -->
    <script src="/ios-helper.js" defer></script>
    <script>
    (() => {
      // PC判定：hover可能 かつ fine pointer（=マウス前提）
      const isDesktop = matchMedia("(hover:hover) and (pointer:fine)").matches;
    
      if (!isDesktop) return; // スマホは読み込まない
    
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://use.fontawesome.com/releases/v7.1.0/css/all.css";
      link.crossOrigin = "anonymous"; // 任意
      document.head.appendChild(link);
    })();
    </script>

</head>
<body id="app-body" class="menu-transitions-disabled">
    <div id="header-slot">
        <?php include __DIR__ . '/header.html'; ?>
    </div>

    <!-- 左画像パネル -->
    <div class="left-mai">
        <div class="btn btn-flat open"><i class="fa-solid fa-angle-right" style="color: #040300;">    </i></div>
        <div class="mask">
            <img src="./left-mai.webp" alt="まいちゃん" fetchpriority="high" />
        
        </div>
        <main>
            <!--
            <div class="stats-card">
                <h2>お知らせ</h2>
                <div class="stat-item">
                    <p>通知履歴を5件だけhtmlで生成することにより体感のロード時間が爆速に！個人的にはもっさり感がなくなって喜んでいる。</p>
                </div>
            </div>
            -->
           <div class="stats-card">
 

  <div class="stats-carousel">
    <div class="stats-carousel-inner">

    <!-- ===== ページ1：既存カウント（まとめたまま） ===== -->
    <div class="stats-page">
       <h2 style="margin-top:0;font-size:1.5rem;">カウント</h2>
      <div class="stats-grid">
        <div class="stat-item">
          <div class="label">デビューから</div>
          <div class="value" id="days-since-debut">0</div>
        </div>

        <div class="stat-item">
          <div class="label">お誕生日まで</div>
          <div class="value" id="days-to-birthday">0</div>
        </div>

        <div class="stat-item">
          <div class="label">周年記念まで</div>
          <div class="value" id="days-to-anniversary">0</div>
        </div>

        <div class="stat-item">
          <div class="label">推してから</div>
          <div class="value" id="days-to-meet">0</div>
        </div>
      </div>
    </div>


    <!-- 週間予定表 -->
  <div class="stats-page">   <!-- ← これ追加 -->
    <h2 style="margin-top:0;font-size:1.5rem;">今週の予定</h2>
    <div id="weekly-schedule"></div>
  </div>

<!-- JavaScript読み込み -->
<script src="/js/weekly-schedule.js"></script>
<script>
document.addEventListener('DOMContentLoaded', () => {
    loadWeeklySchedule('weekly-schedule');
    enableAutoReload(5); // 5分ごとに自動更新
});
</script>

    </div>
  </div>
  
</div>
<div class="carousel-dots"></div>

<script>
// ============================
// カルーセル制御（高さ可変・スワイプ・ドット）
// ============================
const carousel = document.querySelector('.stats-carousel');
const inner = document.querySelector('.stats-carousel-inner');
const dotsWrap = document.querySelector('.carousel-dots');

let current = 0;
let startX = 0;
let startY = 0;
let tracking = false;

const pages = inner.querySelectorAll('.stats-page');
const maxPage = pages.length - 1;

const threshold = 60;
const dots = [];

/**
 * 状態更新（スライド・高さ・ドット）
 */
function update() {
    if (!inner || !carousel) return;

    // スライド移動
    inner.style.transform = `translateX(-${current * 100}%)`;

    // 高さの調整
    const activePage = pages[current];

    if (activePage) {
        const newHeight = activePage.offsetHeight;
        carousel.style.height = newHeight + 'px';
    }

    // ドットの状態更新
    dots.forEach((d, i) => {
        d.classList.toggle('active', i === current);
    });
}

/**
 * ドットの生成
 */
function initDots() {
    dotsWrap.innerHTML = ''; 
    dots.length = 0; // 配列をクリア
    for (let i = 0; i <= maxPage; i++) {
        const b = document.createElement('button');
        b.addEventListener('click', () => {
            current = i;
            update();
        });
        dotsWrap.appendChild(b);
        dots.push(b);
    }
}

// ===== pointerイベント（スワイプ） =====
carousel.addEventListener('pointerdown', e => {
    startX = e.clientX;
    startY = e.clientY;
    tracking = true;
});

carousel.addEventListener('pointerup', e => {
    if (!tracking) return;
    tracking = false;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (Math.abs(dx) < Math.abs(dy)) return; // 縦スクロール優先
    if (Math.abs(dx) < threshold) return;

    if (dx < 0 && current < maxPage) current++;
    if (dx > 0 && current > 0) current--;

    update();
});

// 親パネルへの伝播遮断
['pointerdown','pointermove','pointerup','mousedown','mouseup','touchstart','touchend'].forEach(type => {
    carousel.addEventListener(type, e => {
        e.stopPropagation();
    }, { passive: false }); // passive: false にして確実に止める
});

// --- 実行順序の整理 ---
document.addEventListener('DOMContentLoaded', () => {
    initDots();        // 2. ドット作成
    
    // 3. 初回表示（レンダリング時間を考慮して少し待つ）
    setTimeout(update, 100); 
});

window.addEventListener('load', update);
window.addEventListener('resize', update);
</script>

    
            <div class="log-section">
                <h2 class="history fade">通知履歴</h2>
                
                <div class="controls">
                    <div class="controls-left">
                        <button id="btn-refresh" class="fade d2">更新</button>
                    </div>
                    <button id="btn-log-settings" class="fade d2" aria-expanded="false"     aria-controls="log-settings-container">表示設定</button>
                    <div id="log-settings-container" class="log-settings-container" aria-hidden="   true">
                        <ul class="view-list">
                            <li>
                                <button id="filter-sync-notification" class="filter-button is-on"   >
                                    通知設定連動: ON
                                </button>
                            </li>
                            <li>
                                <button id="filter-twitcasting" class="filter-button is-on"     disabled>
                                    TwitCasting: ON
                                </button>
                            </li>
                            <li>
                                <button id="filter-youtube" class="filter-button is-on" disabled>
                                    YouTube: ON
                                </button>
                            </li>
                            <li>
                                <button id="filter-youtube-community" class="filter-button is-on"    disabled>
                                    YouTube Community: ON
                                </button>
                            </li>
                            <li>
                                <button id="filter-twitch" class="filter-button is-on" disabled>
                                    Twitch: ON
                                </button>
                            <li>
                                <button id="filter-fanbox" class="filter-button is-on" disabled>
                                    Pixiv Fanbox: ON
                                </button>
                            </li>
                            <li>
                                <button id="filter-twitter-main" class="filter-button is-on"    disabled>
                                    Twitter(@koinoya_mai): ON
                                </button>
                            </li>
                            <li>
                                <button id="filter-twitter-sub" class="filter-button is-on"     disabled>
                                    Twitter(@koinoyamai17): ON
                                </button>
                            </li>
                            <!--<li>
                                <button id="filter-gipt" class="filter-button is-on" disabled>
                                    Gipt: ON
                                </button>
                            </li>-->
                            <li>
                                <button id="filter-milestone" class="filter-button is-on"   disabled>
                                    記念日通知: ON
                                </button>
                            </li>
                        </ul>
                    </div>
    
                    <select id="limit" style="display:none;">
                        <option value="5">初期表示</option>
                        <option value="50">追加読み込み</option>
                    </select>
                </div>
                
                <div id="logs" class="log-container">
                    <?php include __DIR__ . '/history.html'; ?>

                </div>
                
                <button id="more-logs-button" style="display:none;">もっと見る</button>
                <div id="status" class="muted"></div>
            </div>
        </main>
    </div>
    <div id="footer-slot">
        <?php include __DIR__ . '/footer.html'; ?>
    </div>

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
    (() => {
        const DEBUT_DATE = new Date(2021, 2, 21);
        const BIRTHDAY = { month: 0, day: 7 };
        const ANNIVERSARY = { month: 2, day: 21 };
        const UPDATE_INTERVAL = 60 * 1000;
        const MS_PER_DAY = 24 * 60 * 60 * 1000;

        function nextOccurrence(monthZeroBased, day) {
            const now = new Date();
            const year = now.getFullYear();
            let candidate = new Date(year, monthZeroBased, day, 0, 0, 0, 0);
            if (stripTime(candidate) < stripTime(now)) {
                candidate = new Date(year + 1, monthZeroBased, day, 0, 0, 0, 0);
            }
            return candidate;
        }

        function stripTime(d) {
            return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
        }

        function daysDiff(target, now = new Date()) {
            const t = stripTime(target).getTime();
            const n = stripTime(now).getTime();
            return Math.floor((t - n) / MS_PER_DAY);
        }

        function daysSince(date) {
            const n = stripTime(new Date()).getTime();
            const d = stripTime(date).getTime();
            return Math.floor((n - d) / MS_PER_DAY);
        }

        function setValue(id, value) {
            const el = document.getElementById(id);
            if (el) el.textContent = String(value) + ` 日`;
        }

        function updateAll() {
            const now = new Date();
            const since = Math.max(0, daysSince(DEBUT_DATE));
            setValue('days-since-debut', since);

            const nextBday = nextOccurrence(BIRTHDAY.month, BIRTHDAY.day);
            const daysToBday = daysDiff(nextBday, now);
            setValue('days-to-birthday', daysToBday);

            const nextAnn = nextOccurrence(ANNIVERSARY.month, ANNIVERSARY.day);
            const daysToAnn = daysDiff(nextAnn, now);
            setValue('days-to-anniversary', daysToAnn);
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                updateAll();
                setInterval(updateAll, UPDATE_INTERVAL);
            });
        } else {
            updateAll();
            setInterval(updateAll, UPDATE_INTERVAL);
        }
    })();
    </script>
    <script>
    (() => {
      const img = document.querySelector('.left-mai .mask img');
      if (!img) return;

      function updatePanelWidth() {
        if (!img.naturalWidth || !img.naturalHeight) return;

        const ratio = img.naturalWidth / img.naturalHeight;
        const vh = window.innerHeight;
        const widthPx = vh * ratio;

        document.documentElement.style.setProperty(
          '--panel-width',
          `${widthPx-100}px`
        );
      }

      if (img.complete) {
        updatePanelWidth();
      } else {
        img.addEventListener('load', updatePanelWidth);
      }

      // 画面回転・リサイズ対応
      window.addEventListener('resize', updatePanelWidth);
    })();
    </script>

    <script>
    (() => {
      const root = document.querySelector('.left-mai');
      if (!root) return;

      const btn    = root.querySelector('div.open');
      const imgbtn = root.querySelector('.mask');

      // ===== クリックトグル =====
      const toggle = (e) => {
      // もしクリックされたターゲットが、カルーセルの中身だったら何もしない
      if (e.target.closest('.stats-carousel') || e.target.closest('.carousel-dots')) {
          return;
      }
      
      if (e) e.preventDefault();
      root.classList.toggle('is-open');
      };

      btn?.addEventListener('click', toggle, { passive: false });
      imgbtn?.addEventListener('click', toggle, { passive: false });

      // ===== 横スワイプ処理 =====
      let startX = 0;
      let startY = 0;
      let tracking = false;

      const THRESHOLD = 50; // スワイプ判定距離(px)

      const onStart = (e) => {
        const p = e.touches ? e.touches[0] : e;
        startX = p.clientX;
        startY = p.clientY;
        tracking = true;
      };

      const onEnd = (e) => {
        if (!tracking) return;
        tracking = false;

        const p = e.changedTouches ? e.changedTouches[0] : e;
        const dx = p.clientX - startX;
        const dy = p.clientY - startY;

        // 縦スクロール優先（横成分が弱い場合は無視）
        if (Math.abs(dx) < Math.abs(dy)) return;

        if (dx > THRESHOLD) {
          // 右スワイプ → open
          root.classList.add('is-open');
        } else if (dx < -THRESHOLD) {
          // 左スワイプ → close
          root.classList.remove('is-open');
        }
      };

      // touch
      root.addEventListener('touchstart', onStart, { passive: true });
      root.addEventListener('touchend', onEnd, { passive: true });

      // mouse（PCトラックパッド対応）
      root.addEventListener('mousedown', onStart);
      window.addEventListener('mouseup', onEnd);
    })();
</script>

</body>
</html>