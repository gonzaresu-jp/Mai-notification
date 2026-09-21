
        // 認証チェック
        (async () => {
            try {
                const response = await fetch('/api/admin/verify', {
                    credentials: 'include'
                });
                
                if (!response.ok) {
                    throw new Error('認証失敗');
                }
            } catch (error) {
                window.location.href = './admin/login';
                return;
            }
        })();

        // タブ切替（ロード時とURLハッシュで復元）
        function switchAdminTab(tabName, updateHash) {
            const tab = (tabName || '').trim();
            document.querySelectorAll('.admin-tab').forEach((b) => {
                b.classList.toggle('is-active', b.dataset.tab === tab);
            });
            document.querySelectorAll('.admin-panel').forEach((p) => {
                p.classList.toggle('is-active', p.dataset.panel === tab);
            });
            if (updateHash !== false && tab) {
                history.replaceState(null, '', '#tab=' + tab);
            }
        }
        document.querySelectorAll('.admin-tab').forEach((b) => {
            b.addEventListener('click', () => switchAdminTab(b.dataset.tab, true));
        });
        (function initTabFromHash() {
            const m = location.hash.match(/tab=([a-zA-Z0-9_-]+)/);
            const target = m ? m[1] : null;
            if (target && document.querySelector('.admin-panel[data-panel="' + target + '"]')) {
                switchAdminTab(target, false);
            }
        })();

        const form = document.getElementById('notification-form');
        const titleInput = document.getElementById('title');
        const bodyInput = document.getElementById('body');
        const urlInput = document.getElementById('url');
        const iconInput = document.getElementById('icon');
        const clientIdInput = document.getElementById('clientId');
        const btnSend = document.getElementById('btn-send');
        const btnClear = document.getElementById('btn-clear');
        const statusMessage = document.getElementById('status-message');
        const previewTitle = document.getElementById('preview-title');
        const previewBody = document.getElementById('preview-body');
        const scheduleAtInput = document.getElementById('scheduleAt');
        const weeklyDateInput = document.getElementById('weekly-date');
        const weeklyMessageText = document.getElementById('weekly-message-text');
        const weeklyWeekInfo = document.getElementById('weekly-week-info');
        const btnWeeklyLoad = document.getElementById('btn-weekly-load');
        const btnWeeklySave = document.getElementById('btn-weekly-save');
        const weeklyMessageStatus = document.getElementById('weekly-message-status');
        const eventContainer = document.getElementById('event-container');
        const btnEvCreate = document.getElementById('btn-ev-create');
        const btnEvReload = document.getElementById('btn-ev-reload');
        const eventModal = document.getElementById('event-modal');
        const evModalTitle = document.getElementById('ev-modal-title');
        const evForm = document.getElementById('ev-form');
        const evTitle = document.getElementById('ev-title');
        const evStartTime = document.getElementById('ev-start-time');
        const evTimePeriod = document.getElementById('ev-time-period');
        const evConfirmed = document.getElementById('ev-confirmed');
        const evPlatform = document.getElementById('ev-platform');
        const evType = document.getElementById('ev-type');
        const evUrl = document.getElementById('ev-url');
        const evThumbUrl = document.getElementById('ev-thumb-url');
        const evDescription = document.getElementById('ev-description');
        const evThumbPicker = document.getElementById('ev-thumb-picker');
        const btnEvClose = document.getElementById('btn-ev-close');
        const btnEvCancel = document.getElementById('btn-ev-cancel');
        
        // プレビュー更新
        function updatePreview() {
            previewTitle.textContent = titleInput.value || 'タイトルがここに表示されます';
            previewBody.textContent = bodyInput.value || 'メッセージがここに表示されます';
        }

        // 送信対象・予約時刻の表示更新
        function updatePreviewMeta() {
            const meta = document.getElementById('preview-meta');
            if (!meta) return;
            const parts = [];
            if (scheduleAtInput.value) {
                const d = new Date(scheduleAtInput.value);
                if (!isNaN(d.getTime())) {
                    parts.push(`⏰ <b>${d.toLocaleString('ja-JP')} に予約送信</b>`);
                }
            } else {
                parts.push('<i class="fa-solid fa-bolt"></i> <b>即時送信</b>');
            }
            if (clientIdInput.value.trim()) {
                parts.push(`<i class="fa-solid fa-bullseye"></i> 特定デバイス <code style="font-size:.78rem">${esc_html(clientIdInput.value.trim())}</code>`);
            } else {
                parts.push('<i class="fa-solid fa-users"></i> 全員に通知');
            }
            meta.innerHTML = parts.join('<span style="opacity:.3">|</span>');
        }

        function esc_html(s) {
            return String(s == null ? '' : s)
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        }
        updatePreviewMeta();
        titleInput.addEventListener('input', updatePreview);
        bodyInput.addEventListener('input', updatePreview);
        scheduleAtInput.addEventListener('input', updatePreviewMeta);
        clientIdInput.addEventListener('input', () => { updatePreviewMeta(); updateSendButton(); });
        
        // クリアボタン
        btnClear.addEventListener('click', () => {
            form.reset();
            iconInput.value = './ad.webp';
            updatePreview();
            updatePreviewMeta();
            statusMessage.classList.remove('show');
        });
        
        // 送信処理
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const title = titleInput.value.trim();
            const body = bodyInput.value.trim();
            const url = urlInput.value.trim();
            const icon = iconInput.value.trim();
            const clientId = clientIdInput.value.trim();
            const scheduleAt = scheduleAtInput.value.trim();
            
            if (!title || !body) {
                showStatus('タイトルとメッセージは必須です', 'error');
                return;
            }
            
            btnSend.disabled = true;
            btnSend.textContent = '送信中...';
            
            try {
                
                const response = await fetch('/api/admin/notify', {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        type: 'admin',
                        settingKey: 'admin',
                        // clientId を API に渡す
                        clientId: clientId || undefined,
                        scheduleAt: scheduleAt || undefined,
                        data: {
                            title: title,
                            body: body,
                            url: url || './',
                            icon: icon || './icon.webp'
                        }
                    })
                });
                
                if (response.status === 401) {
                    window.location.href = '/pushweb/login';
                    return;
                }
                
                if (!response.ok) {
                    throw new Error(`送信失敗: ${response.status}`);
                }
                
                const result = await response.json();
                showStatus(`<i class="fa-solid fa-circle-check"></i> 送信成功！（${result.message || '完了'}）`, 'success');
                
                // フォームをクリア
                setTimeout(() => {
                    form.reset();
                    iconInput.value = './ad.ico';
                    updatePreview();
                    updatePreviewMeta();
                    updateSendButton();
                }, 2000);
                
            } catch (error) {
                showStatus(`<i class="fa-solid fa-circle-xmark"></i> 送信エラー: ${error.message}`, 'error');
            } finally {
                btnSend.disabled = false;
                btnSend.innerHTML = '<i class="fa-solid fa-paper-plane"></i> 全員に送信';
            }
        });

        function updateSendButton() {
            if (scheduleAtInput.value) {
                btnSend.textContent = '⏰ 予約送信';
            } else if (clientIdInput.value.trim()) {
                btnSend.innerHTML = '<i class="fa-solid fa-paper-plane"></i> 特定デバイスに送信';
            } else {
                btnSend.innerHTML = '<i class="fa-solid fa-paper-plane"></i> 全員に送信';
            }
        }

        // リスナーに追加
        scheduleAtInput.addEventListener('input', () => { updateSendButton(); updatePreviewMeta(); });
        clientIdInput.addEventListener('input', updateSendButton);

        // フォームロード時にも実行
        updateSendButton();

        function formatDateLocal(date) {
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
        }

        async function loadWeeklyMessageByDate() {
            const date = weeklyDateInput.value || formatDateLocal(new Date());

            btnWeeklyLoad.disabled = true;
            btnWeeklyLoad.textContent = '読み込み中...';

            try {
                const response = await fetch(`/api/admin/weekly-message?date=${encodeURIComponent(date)}`, {
                    credentials: 'include'
                });

                if (response.status === 401) {
                    window.location.href = './admin/login';
                    return;
                }

                if (!response.ok) {
                    throw new Error(`取得失敗: ${response.status}`);
                }

                const result = await response.json();
                weeklyMessageText.value = result.message || '';
                weeklyWeekInfo.textContent = `対象週: ${result.weekStart} / 更新: ${result.updatedAt || '-'}`;
                showWeeklyStatus('読み込みました', 'success');
            } catch (error) {
                showWeeklyStatus(`取得エラー: ${error.message}`, 'error');
            } finally {
                btnWeeklyLoad.disabled = false;
                btnWeeklyLoad.textContent = '読み込み';
            }
        }

        async function saveWeeklyMessage() {
            const date = weeklyDateInput.value || formatDateLocal(new Date());
            const message = weeklyMessageText.value.trim();

            if (!message) {
                showWeeklyStatus('メッセージを入力してください', 'error');
                return;
            }

            btnWeeklySave.disabled = true;
            btnWeeklySave.textContent = '保存中...';

            try {
                const response = await fetch('/api/admin/weekly-message', {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ date, message })
                });

                if (response.status === 401) {
                    window.location.href = './admin/login';
                    return;
                }

                if (!response.ok) {
                    const errData = await response.json().catch(() => ({}));
                    throw new Error(errData.error || `保存失敗: ${response.status}`);
                }

                const result = await response.json();
                weeklyWeekInfo.textContent = `対象週: ${result.weekStart}`;
                showWeeklyStatus('保存しました', 'success');
                await loadWeeklyMessageByDate();
            } catch (error) {
                showWeeklyStatus(`保存エラー: ${error.message}`, 'error');
            } finally {
                btnWeeklySave.disabled = false;
                btnWeeklySave.textContent = '保存';
            }
        }

        function showWeeklyStatus(message, type) {
            weeklyMessageStatus.textContent = message;
            weeklyMessageStatus.className = `status-message show ${type}`;
            setTimeout(() => {
                weeklyMessageStatus.classList.remove('show');
            }, 4000);
        }

        weeklyDateInput.addEventListener('change', loadWeeklyMessageByDate);
        btnWeeklyLoad.addEventListener('click', loadWeeklyMessageByDate);
        btnWeeklySave.addEventListener('click', saveWeeklyMessage);

        weeklyDateInput.value = formatDateLocal(new Date());
        loadWeeklyMessageByDate();

        const EV_THUMBNAILS = [
            'https://mai.honna-yuzuki.com/thumb/th-yt-main.webp',
            'https://mai.honna-yuzuki.com/thumb/twitch.webp',
            'https://mai.honna-yuzuki.com/thumb/bilibili.webp',
            'https://mai.honna-yuzuki.com/thumb/twitcasting.webp',
            'https://mai.honna-yuzuki.com/thumb/1on1.webp',
        ];
        const EV_PLATFORM_URL_TEMPLATES = {
            youtube: 'https://www.youtube.com/@koinoyamaich',
            twitcasting: 'https://twitcasting.tv/c:koinoya_mai',
            twitch: 'https://www.twitch.tv/koinoya_mai',
            bilibili: 'https://live.bilibili.com/23105590',
            other: ''
        };
        let editingEventId = null;

        function evEscapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text == null ? '' : String(text);
            return div.innerHTML;
        }

        function evToDatetimeLocal(value) {
            if (!value) return '';
            const d = new Date(value);
            if (Number.isNaN(d.getTime())) return '';
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const hh = String(d.getHours()).padStart(2, '0');
            const mm = String(d.getMinutes()).padStart(2, '0');
            return `${y}-${m}-${day}T${hh}:${mm}`;
        }

        async function evAdminFetch(url, options = {}) {
            const headers = {
                ...(options.body ? { 'Content-Type': 'application/json' } : {})
            };
            const response = await fetch(url, { ...options, credentials: 'include', headers: { ...headers, ...(options.headers || {}) } });
            if (response.status === 401) {
                window.location.href = './admin/login';
                throw new Error('認証期限が切れました');
            }
            if (!response.ok) {
                const text = await response.text().catch(() => '');
                throw new Error(`API ${response.status}: ${text}`);
            }
            return response;
        }

        function evRenderThumbnailPicker() {
            evThumbPicker.innerHTML = EV_THUMBNAILS.map((thumbUrl) => `
                <div class="thumb-item" data-url="${thumbUrl}">
                    <img src="${thumbUrl}" alt="thumbnail">
                </div>
            `).join('');

            evThumbPicker.addEventListener('click', (e) => {
                const item = e.target.closest('.thumb-item');
                if (!item) return;
                evThumbPicker.querySelectorAll('.thumb-item').forEach((el) => el.classList.remove('selected'));
                item.classList.add('selected');
                evThumbUrl.value = item.dataset.url || '';
            });

            evThumbUrl.addEventListener('input', () => {
                const value = evThumbUrl.value.trim();
                evThumbPicker.querySelectorAll('.thumb-item').forEach((el) => {
                    el.classList.toggle('selected', el.dataset.url === value);
                });
            });
        }

        function evRenderEventItem(event) {
            const thumbHtml = event.thumbnail_url
                ? `<div class="event-thumbnail"><img src="${event.thumbnail_url}" alt="${evEscapeHtml(event.title)}"></div>`
                : '<div class="event-thumbnail"></div>';
            const statusText = event.status === 'live' ? 'LIVE' : event.status === 'ended' ? '終了' : '予定';
            const platformBadge = event.platform === 'youtube'
                ? '<span class="badge badge-youtube">YouTube</span>'
                : event.platform === 'twitcasting'
                    ? '<span class="badge badge-twitcasting">TwitCasting</span>'
                    : '';
            const confirmedBadge = Number(event.confirmed) === 1
                ? '<span class="badge badge-confirmed">確定</span>'
                : '<span class="badge badge-unconfirmed">未定</span>';
            const EV_PERIOD_LABELS = { MORNING: '朝', NOON: '昼', EVENING: '夕方', NIGHT: '夜', LATE_NIGHT: '深夜' };
            const periodLabel = event.time_period ? EV_PERIOD_LABELS[event.time_period] : null;
            const startTimeText = periodLabel
                ? (event.start_time ? new Date(event.start_time).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', timeZone:'Asia/Tokyo' }) : '') + ` ${periodLabel}ごろ`
                : (event.start_time
                    ? new Date(event.start_time).toLocaleString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone:'Asia/Tokyo' })
                    : '日時未定');

            return `
                <div class="event-item">
                    ${thumbHtml}
                    <div class="event-info">
                        <div class="event-title">${evEscapeHtml(event.title || '')}</div>
                        <div class="event-meta"><i class="fa-regular fa-clock"></i> ${startTimeText}</div>
                        <div class="event-badges">
                            <span class="badge badge-${event.status || 'scheduled'}">${statusText}</span>
                            ${platformBadge}
                            ${confirmedBadge}
                        </div>
                    </div>
                    <div class="event-actions">
                        <button type="button" class="event-btn event-btn-sub" data-action="edit" data-id="${event.id}">編集</button>
                        <button type="button" class="event-btn event-btn-danger" data-action="delete" data-id="${event.id}">削除</button>
                    </div>
                </div>
            `;
        }

        async function evLoadEvents() {
            eventContainer.innerHTML = '読み込み中...';
            try {
                const res = await evAdminFetch('/api/admin/events?limit=100');
                const data = await res.json();
                const items = data.items || [];
                if (!items.length) {
                    eventContainer.innerHTML = 'イベントなし';
                    return;
                }
                const filter = (document.getElementById('event-filter') || {}).value || '';
                const kw = filter.trim().toLowerCase();
                const filtered = kw
                    ? items.filter((ev) => (String(ev.title || '').toLowerCase().includes(kw)
                        || String(ev.platform || '').toLowerCase().includes(kw)
                        || String(ev.status || '').toLowerCase().includes(kw)))
                    : items;
                if (!filtered.length) {
                    eventContainer.innerHTML = '絞り込みの結果、表示できるイベントはありません';
                    return;
                }
                eventContainer.innerHTML = filtered.map(evRenderEventItem).join('');
            } catch (error) {
                eventContainer.innerHTML = `取得失敗: ${evEscapeHtml(error.message)}`;
            }
        }

        function evOpenCreateModal() {
            editingEventId = null;
            evModalTitle.textContent = '新規イベント作成';
            evForm.reset();
            evToggleMemoMode();
            eventModal.classList.add('active');
            evThumbPicker.querySelectorAll('.thumb-item').forEach((el) => el.classList.remove('selected'));
        }

        function evCloseModal() {
            eventModal.classList.remove('active');
        }

        async function evEditEvent(id) {
            try {
                const res = await evAdminFetch(`/api/admin/events/${id}`);
                const event = await res.json();
                editingEventId = id;
                evModalTitle.textContent = 'イベント編集';
                evTitle.value = event.title || '';
                evStartTime.type = 'datetime-local'; // 値代入前に必ず日時モードへ（前回編集のdateモード残りを解消）
                evStartTime.value = evToDatetimeLocal(event.start_time);
                evTimePeriod.value = event.time_period || '';
                evPlatform.value = event.platform || 'other';
                evType.value = event.event_type || 'live';
                evUrl.value = event.url || '';
                evThumbUrl.value = event.thumbnail_url || '';
                evDescription.value = event.description || '';
                evConfirmed.value = Number(event.confirmed) === 1 ? 'true' : '';
                // メモの場合は日付フィールドに復元
                if (event.event_type === 'memo' && event.start_time) {
                    evMemoDate.value = event.start_time.slice(0, 10);
                } else {
                    evMemoDate.value = '';
                }
                evThumbPicker.querySelectorAll('.thumb-item').forEach((el) => {
                    el.classList.toggle('selected', el.dataset.url === (event.thumbnail_url || ''));
                });
                evToggleMemoMode();
                eventModal.classList.add('active');
            } catch (error) {
                showStatus(`イベント読込エラー: ${error.message}`, 'error');
            }
        }

        async function evDeleteEvent(id) {
            if (!confirm('削除しますか？')) return;
            try {
                await evAdminFetch(`/api/admin/events/${id}`, { method: 'DELETE' });
                showStatus('イベントを削除しました', 'success');
                await evLoadEvents();
            } catch (error) {
                showStatus(`削除エラー: ${error.message}`, 'error');
            }
        }

        async function evHandleSubmit(e) {
            e.preventDefault();
            const isMemo = evType.value === 'memo';
            const payload = {
                title: evTitle.value.trim(),
                start_time: isMemo
                    ? (evMemoDate.value ? evMemoDate.value + 'T00:00' : null)
                    : (evStartTime.value || null),
                platform: evPlatform.value,
                event_type: evType.value,
                time_period: (!isMemo && evTimePeriod.value) ? evTimePeriod.value : null,
                url: evUrl.value.trim(),
                thumbnail_url: evThumbUrl.value.trim(),
                description: evDescription.value.trim(),
                confirmed: evConfirmed.value === 'true'
            };
            if (!payload.title) {
                showStatus('イベントタイトルは必須です', 'error');
                return;
            }
            if (isMemo && !evMemoDate.value) {
                showStatus('メモには日付が必須です', 'error');
                return;
            }
            if (payload.time_period && !payload.start_time) {
                showStatus('時間帯を指定する場合は開始日を入力してください', 'error');
                return;
            }

            try {
                const targetUrl = editingEventId ? `/api/admin/events/${editingEventId}` : '/api/admin/events';
                const method = editingEventId ? 'PUT' : 'POST';
                await evAdminFetch(targetUrl, { method, body: JSON.stringify(payload) });
                showStatus(editingEventId ? 'イベントを更新しました' : 'イベントを作成しました', 'success');
                evCloseModal();
                await evLoadEvents();
            } catch (error) {
                showStatus(`保存エラー: ${error.message}`, 'error');
            }
        }

        evPlatform.addEventListener('change', (e) => {
            if (evUrl.value.trim() !== '') return;
            evUrl.value = EV_PLATFORM_URL_TEMPLATES[e.target.value] || '';
        });

        // メモ選択時はURL・サムネ・プラットフォーム・時刻を日付のみ入力に切り替え
        const evMemoHideTargets = [
            evUrl.closest('.form-group'),
            evThumbUrl.closest('.form-group'),
            document.getElementById('ev-thumb-picker').closest('.form-group'),
            evPlatform.closest('.form-group'),
        ];
        const evStartTimeGroup = document.getElementById('ev-start-time-group');
        const evMemoDateGroup  = document.getElementById('ev-memo-date-group');
        const evMemoDate       = document.getElementById('ev-memo-date');

        const evTimePeriodGroup = document.getElementById('ev-time-period-group');
        const evStartTimeLabel  = document.querySelector('label[for="ev-start-time"]');

        // 時間帯を選ぶと開始日時欄を「日付のみ」に切替（時刻入力は不要）。
        // 解除すると日時入力に戻す。date部分は保持する。
        function evToggleTimePeriodMode() {
            const hasPeriod = !!evTimePeriod.value && evType.value !== 'memo';
            const datePart = (evStartTime.value || '').slice(0, 10);
            if (hasPeriod) {
                evStartTime.type = 'date';
                evStartTime.value = datePart; // "YYYY-MM-DD"
                if (evStartTimeLabel) evStartTimeLabel.textContent = '開始日（時刻は「時間帯」で表示）';
            } else {
                evStartTime.type = 'datetime-local';
                if (evStartTimeLabel) evStartTimeLabel.textContent = '開始日時';
            }
        }
        evTimePeriod.addEventListener('change', evToggleTimePeriodMode);

        function evToggleMemoMode() {
            const isMemo = evType.value === 'memo';
            evMemoHideTargets.forEach(el => { if (el) el.style.display = isMemo ? 'none' : ''; });
            evTimePeriodGroup.style.display = isMemo ? 'none' : '';
            if (isMemo) evTimePeriod.value = '';
            evStartTimeGroup.style.display = isMemo ? 'none' : '';
            evMemoDateGroup.style.display  = isMemo ? '' : 'none';
            if (isMemo) {
                evPlatform.value = 'other';
                evUrl.value = '';
                evThumbUrl.value = '';
                evStartTime.value = '';
            } else {
                evMemoDate.value = '';
            }
            evToggleTimePeriodMode();
        }
        evType.addEventListener('change', evToggleMemoMode);

        eventContainer.addEventListener('click', (e) => {
            const button = e.target.closest('button[data-action]');
            if (!button) return;
            const id = parseInt(button.dataset.id, 10);
            if (Number.isNaN(id)) return;
            if (button.dataset.action === 'edit') evEditEvent(id);
            if (button.dataset.action === 'delete') evDeleteEvent(id);
        });

        evForm.addEventListener('submit', evHandleSubmit);
        btnEvCreate.addEventListener('click', evOpenCreateModal);
        btnEvReload.addEventListener('click', evLoadEvents);
        btnEvClose.addEventListener('click', evCloseModal);
        btnEvCancel.addEventListener('click', evCloseModal);
        {
            const filterInput = document.getElementById('event-filter');
            if (filterInput) {
                let filterTimer;
                filterInput.addEventListener('input', () => {
                    clearTimeout(filterTimer);
                    filterTimer = setTimeout(evLoadEvents, 250);
                });
            }
        }
        eventModal.addEventListener('click', (e) => {
            if (e.target === eventModal) evCloseModal();
        });

        evRenderThumbnailPicker();
        evLoadEvents();
        
        function showStatus(message, type) {
            statusMessage.innerHTML = message;
            statusMessage.className = `status-message show ${type}`;
            
            setTimeout(() => {
                statusMessage.classList.remove('show');
            }, 5000);
        }

        // ---- パスキー登録 ----
        (function () {
            const btn = document.getElementById('btn-passkey-register');
            const listEl = document.getElementById('passkey-list');
            const statusEl = document.getElementById('passkey-status');
            if (!btn) return;

            function showPkStatus(msg, type) {
                statusEl.innerHTML = msg;
                statusEl.className = `status-message show ${type}`;
                setTimeout(() => statusEl.classList.remove('show'), 6000);
            }
            // サーバーがHTMLエラーページを返しても落ちないJSON読み取り
            async function readJson(res) {
                const text = await res.text();
                try { return JSON.parse(text); }
                catch (e) { throw new Error('サーバーエラー (HTTP ' + res.status + ')'); }
            }
            function b64uToBuf(s) {
                s = s.replace(/-/g, '+').replace(/_/g, '/');
                while (s.length % 4) s += '=';
                const bin = atob(s);
                const buf = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
                return buf;
            }
            function bufToB64u(buf) {
                const bytes = new Uint8Array(buf);
                let bin = '';
                for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
                return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
            }
            function loadPkList() {
                fetch('/api/admin/passkey/list', { credentials: 'include' })
                    .then((r) => r.ok ? r.json() : { passkeys: [] })
                    .then((d) => {
                        const pks = d.passkeys || [];
                        if (!pks.length) { listEl.textContent = '登録済みパスキー: なし'; return; }
                        listEl.innerHTML = '登録済みパスキー: ' + pks.map((p) => {
                            const dt = new Date(p.created_at).toLocaleDateString('ja-JP');
                            return `<span style="margin-right:14px;"><i class="fa-solid fa-key"></i> ${p.label ? p.label : p.credential_id} (${dt})</span>`;
                        }).join('');
                    })
                    .catch(() => {});
            }
            btn.addEventListener('click', async () => {
                if (!window.PublicKeyCredential) {
                    showPkStatus('このブラウザはパスキー(WebAuthn)に対応していません', 'error');
                    return;
                }
                btn.disabled = true;
                btn.textContent = '待機中...';
                try {
                    const begin = await fetch('/api/admin/passkey/register/begin', {
                        method: 'POST', credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({}),
                    });
                    const opt = await readJson(begin);
                    if (!begin.ok) throw new Error(opt.error || '登録を開始できません');
                    const fid = opt._fid;
                    delete opt._fid;
                    opt.user.id = b64uToBuf(opt.user.id);
                    opt.challenge = b64uToBuf(opt.challenge);
                    if (opt.excludeCredentials) opt.excludeCredentials = opt.excludeCredentials.map((c) => ({ ...c, id: b64uToBuf(c.id) }));
                    const cred = await navigator.credentials.create({ publicKey: opt });
                    btn.textContent = '確認中...';
                    const finish = await fetch('/api/admin/passkey/register/finish', {
                        method: 'POST', credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            _fid: fid,
                            label: navigator.platform || 'device',
                            response: {
                                id: cred.id,
                                rawId: bufToB64u(cred.rawId),
                                type: cred.type,
                                clientExtensionResults: cred.getClientExtensionResults(),
                                response: {
                                    attestationObject: bufToB64u(cred.response.attestationObject),
                                    clientDataJSON: bufToB64u(cred.response.clientDataJSON),
                                },
                            },
                        }),
                    });
                    const data = await readJson(finish);
                    if (!finish.ok) throw new Error(data.error || '登録に失敗しました');
                    showPkStatus('<i class="fa-solid fa-circle-check"></i> この端末のパスキーを登録しました。次回からログインページで「パスキーでログイン」が使えます', 'success');
                    loadPkList();
                } catch (e) {
                    if (e && e.name === 'NotAllowedError') {
                        showPkStatus('認証がキャンセルされました', 'error');
                    } else {
                        showPkStatus('登録失敗: ' + (e.message || e), 'error');
                    }
                } finally {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fa-solid fa-key"></i> この端末にパスキーを登録';
                }
            });
            loadPkList();
        })();
    