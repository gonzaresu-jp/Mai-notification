<header>
    <div class="header-left">
        <img src="/icon.webp" alt="まいちゃんロゴ" class="logo fade" fetchpriority="high" />
        <a href="/" rel="noopener noreferrer" style="text-decoration: none; color: inherit;">
            <h2 class="fade">まいちゃん通知</h2>
        </a>
        <a href="/status" class="header-status-link fade" id="header-status-indicator" title="システムの稼働状況">
            <span class="status-dot"></span>
        </a>
    </div>

    <!-- ログインボタン（ヘッダー右側に常時表示） -->
    <div class="header-auth fade" id="header-auth">
        <!-- 未ログイン時 -->
        <button class="auth-login-btn google" id="header-login-btn" style="display:none;" onclick="headerLoginWithGoogle()"
            aria-label="Googleでログイン">
            <svg width="16" height="16" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true">
                <path
                    d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
                    fill="#4285F4" />
                <path
                    d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
                    fill="#34A853" />
                <path
                    d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"
                    fill="#FBBC05" />
                <path
                    d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 6.293C4.672 4.166 6.656 3.58 9 3.58z"
                    fill="#EA4335" />
            </svg>
        </button>

        <button class="auth-login-btn discord" id="header-discord-login-btn" style="display:none;" onclick="headerLoginWithDiscord()"
            aria-label="Discordでログイン">
            <i class="fa-brands fa-discord" style="font-size: 1.1rem;"></i>
        </button>

        <!-- ログイン済み時 -->
        <div class="auth-user-chip" id="header-user-chip" style="display:none;">
            <img class="auth-avatar" id="header-avatar" src="" alt="" width="28" height="28" />
        </div>

        <!-- 読み込み中 -->
        <div class="auth-loading" id="header-auth-loading">
            <span class="auth-loading-dot"></span>
        </div>
    </div>

    <div class="hamburger-icon fade" id="hamburger-toggle" role="button" tabindex="0" aria-label="メニューを開く"
        aria-controls="nav-menu" aria-expanded="false">
        <span></span>
        <span></span>
        <span></span>
    </div>

    <nav id="nav-menu" aria-label="ハンバーガーメニュー">
        <ul class="nav-list">
            <li><button id="btn-send-test">テスト通知を送信</button></li>

            <li class="menu-notification-toggle">
                <!-- 画像切り替えコンテナ -->
                <div class="toggle-image-container">
                    <img src="/off.webp" alt="" class="toggle-image off" />
                    <img src="/on.webp" alt="" class="toggle-image on" />
                </div>

                <div class="toggle-controls-wrapper">
                    <span>通知を受信する</span>
                    <div class="toggle-notify">
                        <input id="toggle-notify" type="checkbox" aria-label="通知を受信する" />
                        <span class="slider" aria-hidden="true"></span>
                    </div>
                </div>
            </li>

            <!-- ナビメニュー内のログイン情報（ログイン済み時のみ表示） -->
            <li class="nav-setting-item nav-auth-info" id="nav-auth-info" style="display:none;">
                <div class="nav-user-info">
                    <img class="nav-auth-avatar" id="nav-avatar" src="" alt="" width="36" height="36" />
                    <div class="nav-user-text">
                        <span class="nav-user-name" id="nav-display-name"></span>
                        <span class="nav-user-email" id="nav-email"></span>
                    </div>
                </div>
                <!-- 推し日数（ログイン時はサーバー保存値を表示） -->
                <div class="nav-oshi-info" id="nav-oshi-info" style="display:none;">
                    <i class="fa-solid fa-heart" style="color:#e75480;font-size:0.8rem;"></i>
                    <span id="nav-oshi-days-text"></span>
                </div>
            </li>

            <!-- ログインCTA（未ログイン時のみ表示） -->
            <li class="nav-setting-item nav-login-cta" id="nav-login-cta">
                <div class="nav-login-prompt">
                    <p class="nav-login-desc">ログインするとどのデバイスからでも<br>通知設定や推し日数を引き継げます</p>
                    <div class="nav-login-btns">
                        <button class="nav-auth-btn google" onclick="headerLoginWithGoogle()">
                            <svg width="14" height="14" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                                <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4" />
                                <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853" />
                                <path d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05" />
                                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 6.293C4.672 4.166 6.656 3.58 9 3.58z" fill="#EA4335" />
                            </svg>
                            Google
                        </button>
                        <button class="nav-auth-btn discord" onclick="headerLoginWithDiscord()">
                            <i class="fa-brands fa-discord"></i>
                            Discord
                        </button>
                    </div>
                </div>
            </li>
            <!-- ログアウトボタン（ログイン済み時のみ） -->
            <li id="nav-logout-item" style="display:none;">
                <button onclick="headerLogout()" class="nav-logout-btn">
                    <img id="nav-logout-avatar" class="nav-logout-avatar" src="" alt="">
                    <i class="fa-solid fa-right-from-bracket" style="margin-right:6px;"></i>ログアウト
                </button>
            </li>

            <li class="nav-setting-item">
                <div id="subscriber-name-settings" class="platform-subscriber-name-section">

                    <div class="platform-name-row">
                        <div class="platform-name-label">ユーザー名</div>
                    </div>

                    <div class="platform-name-controls">
                        <div class="subscriber-input-wrapper">
                            <input id="subscriber-name-input" type="text" class="platform-name-input"
                                placeholder="ユーザー名を入力">

                            <img id="subscriber-linked-icon" class="subscriber-linked"
                                src="https://img.icons8.com/?size=100&id=sz8cPVwzLrMP&format=png&color=000000"
                                alt="linked" style="display:none;">
                        </div>

                        <button id="subscriber-name-submit" class="platform-setting-button">保存</button>
                    </div>

                    <label for="start" class="platform-name-row">推し始め</label>
                    <input type="date" id="start" name="trip-start" min="2020-01-01" max="2099-12-31"
                        title="推し始めの日付を選択してください" />

                    <div id="subscriber-name-status" class="platform-name-status"></div>
                </div>
            </li>




            <li class="nav-setting-item">
                <div id="platform-settings">
                    <ul class="platform-settings-list">
                        <li>
                            <button id="toggle-twitcasting" class="platform-setting-button is-on">
                                TwitCasting: ON
                            </button>
                        </li>
                        <li>
                            <button id="toggle-youtube" class="platform-setting-button is-on">
                                YouTube: ON
                            </button>
                        </li>
                        <li>
                            <button id="toggle-youtube-community" class="platform-setting-button is-on">
                                YouTube Community: ON
                            </button>
                        </li>
                        <li>
                            <button id="toggle-twitch" class="platform-setting-button is-on">
                                Twitch: ON
                            </button>
                        </li>
                        <li>
                            <button id="toggle-bilibili" class="platform-setting-button is-on">
                                Bilibili: ON
                            </button>
                        </li>
                        <li>
                            <button id="toggle-fanbox" class="platform-setting-button is-on">
                                Pixiv Fanbox: ON
                            </button>
                        </li>
                        <li>
                            <button id="toggle-twitter-main" class="platform-setting-button is-on">
                                Twitter(@koinoya_mai): ON
                            </button>
                        </li>
                        <li>
                            <button id="toggle-twitter-sub" class="platform-setting-button is-on">
                                Twitter(@koinoyamai17): ON
                            </button>
                        </li>
                        <!--<li>
                                <button id="toggle-gipt" class="platform-setting-button is-on">
                                    Gipt: ON
                                </button>
                            </li>-->
                        <li>
                            <button id="toggle-milestone" class="platform-setting-button is-on">
                                記念日通知: ON
                            </button>
                        </li>
                        <li>
                            <button id="toggle-schedule" class="platform-setting-button is-on">
                                スケジュール: ON
                            </button>
                        </li>
                    </ul>
                </div>
            </li>

            <li><a href="https://github.com/gonzaresu-jp/Mai-notification" target="_blank"
                    rel="noopener noreferrer">GitHubページ(使用方法)</a></li>
            <li><a href="/info/" rel="noopener noreferrer">このサービスについて</a></li>
            <li><a href="/download/" rel="noopener noreferrer">Androidアプリをダウンロード</a></li>
            <li><a href="/logs/" rel="noopener noreferrer">Update logs</a></li>
            <li><a href="/status" rel="noopener noreferrer">システム稼働状況</a></li>
            <li><a href="https://form.jotform.com/253191048959063" target="_blank" rel="noopener noreferrer">不具合報告</a>
            </li>


        </ul>
    </nav>

    <div id="menu-overlay" style="position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 999; display: none;">
    </div>
</header>

<style>
    /* ========================================
   ヘッダー認証UI
======================================== */

    /* ヘッダー右側の認証エリア */
    .header-auth {
        display: flex;
        align-items: center;
        margin-right: 8px;
        flex-shrink: 0;
    }

    /* システムステータス */
    .header-status-link {
        display: flex;
        align-items: center;
        justify-content: center;
        margin-left: 8px;
        padding: 4px;
        border-radius: 50%;
        transition: background 0.2s;
        text-decoration: none;
    }

    .header-status-link:hover {
        background: rgba(255, 255, 255, 0.1);
    }

    .status-dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: #999;
        /* 初期値: 不明 */
        box-shadow: 0 0 5px rgba(0, 0, 0, 0.2);
        transition: background 0.3s, box-shadow 0.3s;
    }

    .status-dot.ok {
        background: #4caf50;
        box-shadow: 0 0 8px rgba(76, 175, 80, 0.6);
    }

    .status-dot.warning {
        background: #ff9800;
        box-shadow: 0 0 8px rgba(255, 152, 0, 0.6);
    }

    .status-dot.error {
        background: #f44336;
        box-shadow: 0 0 8px rgba(244, 67, 54, 0.6);
    }

    .status-dot.running {
        background: #2196f3;
        animation: status-pulse 1.5s infinite;
    }

    @keyframes status-pulse {
        0% {
            opacity: 1;
            transform: scale(1);
        }

        50% {
            opacity: 0.6;
            transform: scale(0.9);
        }

        100% {
            opacity: 1;
            transform: scale(1);
        }
    }

    /* ヘッダーのログインボタン共通 */
    .auth-login-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 34px;
        height: 34px;
        padding: 0;
        border-radius: 50%;
        border: 1.5px solid rgba(255, 255, 255, 0.3);
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
        cursor: pointer;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        backdrop-filter: blur(8px);
    }

    .auth-login-btn.google:hover {
        background: rgba(255, 255, 255, 0.2);
        border-color: #fff;
    }

    .auth-login-btn.discord {
        margin-left: 6px;
    }

    .auth-login-btn.discord:hover {
        background: #5865F2;
        border-color: #5865F2;
        box-shadow: 0 0 10px rgba(88, 101, 242, 0.5);
    }

    .auth-login-btn:active {
        transform: scale(0.92);
    }

    .auth-login-btn:hover {
        background: rgba(255, 255, 255, 0.22);
        border-color: rgba(255, 255, 255, 0.55);
    }

    .auth-login-btn:active {
        transform: scale(0.96);
    }

    /* ログイン済みユーザーチップ */
    .auth-user-chip {
        display: flex;
        align-items: center;
        gap: 7px;
        border-radius: 20px;
        background: rgba(255, 255, 255, 0.14);
        border: 1.5px solid rgba(255, 255, 255, 0.28);
        backdrop-filter: blur(6px);
        cursor: default;
    }

    .auth-avatar {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        object-fit: cover;
        border: 1.5px solid rgba(255, 255, 255, 0.5);
        flex-shrink: 0;
    }

    .nav-logout-btn {
        width: 100%;
        padding: 12px 16px;
        background: none;
        border: none;
        color: #e57373 !important;

        align-items: center;
        gap: 10px;

        text-align: left;
        font-size: 0.9rem;
        cursor: pointer;
        display: flex !important;
    }

    .nav-logout-btn:hover {
        background: rgba(255, 255, 255, 0.1);
    }

    .nav-logout-avatar {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        object-fit: cover;
        flex-shrink: 0;
        border: 1px solid rgba(255, 255, 255, 0.4);
    }

    /* 読み込み中ドット */
    .auth-loading {
        display: flex;
        align-items: center;
    }

    .auth-loading-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.5);
        animation: authDotPulse 1.2s ease-in-out infinite;
    }

    @keyframes authDotPulse {

        0%,
        100% {
            opacity: 0.3;
            transform: scale(0.85);
        }

        50% {
            opacity: 1;
            transform: scale(1.1);
        }
    }

    /* ========================================
   ナビメニュー内のユーザー情報
======================================== */
    .nav-auth-avatar {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        object-fit: cover;
        border: 2px solid rgba(255, 255, 255, 0.4);
        flex-shrink: 0;
    }

    /* 推し日数バッジ */
    .nav-oshi-info {
        display: flex;
        align-items: center;
        gap: 5px;
        margin-top: 4px;
        font-size: 0.78rem;
        color: rgba(255, 255, 255, 0.8);
    }

    /* ========================================
   ログインCTA（未ログイン時）
======================================== */
    .nav-login-prompt {
        padding: 4px 0 6px;
    }

    .nav-login-desc {
        font-size: 0.75rem;
        color: rgba(255, 255, 255, 0.65);
        line-height: 1.55;
        margin: 0 0 10px;
    }

    /* ナビメニュー内のログインボタン */
    .nav-login-btns {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
        margin-top: 10px;
    }

    .nav-auth-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 10px;
        border-radius: 10px;
        border: 1.5px solid rgba(255, 255, 255, 0.2);
        background: rgba(255, 255, 255, 0.08);
        color: #fff;
        font-size: 0.85rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
    }

    .nav-auth-btn.google:hover {
        background: rgba(255, 255, 255, 0.15);
        border-color: rgba(255, 255, 255, 0.4);
    }

    .nav-auth-btn.discord {
        background: rgba(88, 101, 242, 0.1);
        border-color: rgba(88, 101, 242, 0.3);
    }

    .nav-auth-btn.discord:hover {
        background: #5865F2;
        border-color: #5865F2;
    }
</style>

<script>
    (function () {
        'use strict';

        async function initHeaderAuth() {
            const loading = document.getElementById('header-auth-loading');
            const loginBtn = document.getElementById('header-login-btn');
            const discordLoginBtn = document.getElementById('header-discord-login-btn');
            const chip = document.getElementById('header-user-chip');
            const avatar = document.getElementById('header-avatar');
            const logoutItem = document.getElementById('nav-logout-item');
            const loginCta = document.getElementById('nav-login-cta');
            const logoutAvatar = document.getElementById('nav-logout-avatar');

            try {
                const res = await fetch('/api/user/me', { credentials: 'include' });

                // 401 = 未ログイン（正常ケース）。throwせず下のcatchに流してログイン前表示へ
                if (!res.ok) {
                    window.__authUser = null;
                    chip.style.display = 'none';
                    loginBtn.style.display = 'flex';
                    discordLoginBtn.style.display = 'flex';
                    logoutItem.style.display = 'none';
                    loginCta.style.display = 'block';
                    loading.style.display = 'none';
                    return;
                }

                const user = await res.json();

                avatar.src = user.avatar_url || '/default-avatar.webp';
                logoutAvatar.src = avatar.src;

                chip.style.display = 'flex';
                loginBtn.style.display = 'none';
                discordLoginBtn.style.display = 'none';
                logoutItem.style.display = 'block';
                loginCta.style.display = 'none';
                loading.style.display = 'none';

                // auth-settings-bridge.js が参照するグローバル変数をセット
                window.__authUser = user;

                // ページ読み込みのたびに clientId を紐づけ（未紐づけの補完）
                const storedClientId = localStorage.getItem('clientId') || '';
                if (storedClientId) {
                    fetch('/api/user/link-subscription', {
                        method: 'POST',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ client_id: storedClientId }),
                    }).catch(() => { });
                }

                // Androidアプリの場合は android_devices.user_id を紐づけ
                try {
                    const isAndroid = typeof window !== 'undefined'
                        && window.MaiApp
                        && typeof window.MaiApp.isAndroidApp === 'function'
                        && window.MaiApp.isAndroidApp();
                    if (isAndroid) {
                        const androidClientId = window.MaiApp.getAndroidClientId && window.MaiApp.getAndroidClientId();
                        const linkClientId = androidClientId || storedClientId;
                        if (linkClientId) {
                            fetch('/api/android/link-user', {
                                method: 'POST',
                                credentials: 'include',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ clientId: linkClientId })
                            }).catch(() => { });
                        }
                    }
                } catch { }

            } catch {
                // ネットワークエラー等の予期せぬ失敗
                chip.style.display = 'none';
                loginBtn.style.display = 'flex';
                discordLoginBtn.style.display = 'flex';
                logoutItem.style.display = 'none';
                loginCta.style.display = 'block';
                loading.style.display = 'none';

                window.__authUser = null;
            }
        }

        async function updateStatusIndicator() {
            const indicator = document.getElementById('header-status-indicator');
            if (!indicator) return;
            const dot = indicator.querySelector('.status-dot');
            try {
                // 1. スクレイパー状態の取得
                const res = await fetch('/api/scraper-status');
                if (!res.ok) throw new Error('status endpoint failed');
                const data = await res.json();
                const items = data.items || [];
                
                // 2. サーバーリソース状況の取得（高負荷時のステータス反映用）
                let sysData = null;
                try {
                    const sysRes = await fetch('/api/system-info');
                    if (sysRes.ok) sysData = await sysRes.json();
                } catch(e) { }

                let hasError = false;
                let hasWarning = false;
                let isRunning = false;

                // スクラッパー状態の評価
                if (items.length > 0) {
                    const effectiveItems = items.map(i => {
                        if (i.status !== 'running') return i;
                        const staleSec = (Date.now() - new Date(i.last_run).getTime()) / 1000;
                        return staleSec > 180 ? { ...i, status: 'success' } : i;
                    });
                    if (effectiveItems.some(i => i.status === 'error')) hasError = true;
                    if (effectiveItems.some(i => i.status === 'running')) isRunning = true;
                }

                // サーバーリソースの評価（70%で警告、90%以上でエラー扱い）
                if (sysData) {
                    const cpuUsage = sysData.cpu?.usagePercent || 0;
                    const memUsage = sysData.memory?.usagePercent || 0;
                    if (cpuUsage >= 90 || memUsage >= 95) hasError = true;
                    else if (cpuUsage >= 70 || memUsage >= 80) hasWarning = true;
                }

                dot.className = 'status-dot';
                if (hasError) dot.classList.add('error');
                else if (hasWarning) dot.classList.add('warning');
                else if (isRunning) dot.classList.add('running');
                else dot.classList.add('ok');

            } catch (e) {
                dot.className = 'status-dot'; // 通信エラー等はグレー（Unknown）
            }
        }

        document.addEventListener('DOMContentLoaded', () => {
            initHeaderAuth();
            updateStatusIndicator();
            setInterval(updateStatusIndicator, 60000); // 1分毎に更新
        });
    })();

    function headerLoginWithGoogle() {
        // config.js と同じキー名 'clientId' を使う
        const clientId = localStorage.getItem('clientId') || '';
        const returnTo = location.pathname + location.search;
        location.href =
            `/auth/google?client_id=${encodeURIComponent(clientId)}&returnTo=${encodeURIComponent(returnTo)}`;
    }

    function headerLoginWithDiscord() {
        const clientId = localStorage.getItem('clientId') || '';
        const returnTo = location.pathname + location.search;
        location.href =
            `/auth/discord?client_id=${encodeURIComponent(clientId)}&returnTo=${encodeURIComponent(returnTo)}`;
    }

    async function headerLogout() {
        let clientId = localStorage.getItem('clientId') || localStorage.getItem('client_id') || '';
        try {
            const isAndroid = typeof window !== 'undefined'
                && window.MaiApp
                && typeof window.MaiApp.isAndroidApp === 'function'
                && window.MaiApp.isAndroidApp();
            if (isAndroid && window.MaiApp.getAndroidClientId) {
                clientId = window.MaiApp.getAndroidClientId() || clientId;
            }
        } catch { }

        await fetch('/auth/logout', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId })
        });
        location.reload();
    }
</script>