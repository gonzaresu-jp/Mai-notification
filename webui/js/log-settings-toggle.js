
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

    