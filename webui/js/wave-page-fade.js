
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

