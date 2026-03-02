// ============================================
// フロントエンド用: 週間予定表表示スクリプト
// ============================================

/**
 * 週間予定を取得して表示する
 * @param {string} containerId - 予定を表示するコンテナのID
 * @param {Date} targetDate - 表示する週の基準日（省略時は今日）
 */
// API リクエスト時にタイムゾーンを考慮
async function loadWeeklySchedule(containerId = 'weekly-schedule', targetDate = new Date()) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Container #${containerId} not found`);
        return;
    }

    container.innerHTML = '<div style="text-align: center; padding: 40px; color: #999;">読み込み中...</div>';

    try {
        // ローカル日付を YYYY-MM-DD 形式で送信
        const dateStr = formatLocalDate(targetDate);
        const response = await fetch(`/api/events/weekly?date=${dateStr}`);
        
        if (!response.ok) {
            throw new Error('Failed to fetch weekly events');
        }

        const data = await response.json();
        renderWeeklyView(container, data.week);
    } catch (error) {
        console.error('Error loading weekly schedule:', error);
        container.innerHTML = '<div style="text-align: center; padding: 40px; color: #e53935;">エラーが発生しました</div>';
    }
}

/**
 * 週間ビューをレンダリング
 */
function renderWeeklyView(container, weekData) {
    const today = formatLocalDate(new Date());

    // 1. コンテナにクラスを付与し、さらに横幅100%を強制する
    container.classList.add('weekly-list'); 
    container.style.display = 'flex'; // ← これを追加！強制的に横並びにする
    container.style.width = '100%';    // ← これを追加！

    let html = ''; 

    weekData.forEach(day => {
        const isToday = day.date === today;
        const dayClass = isToday ? 'week-row is-today' : 'week-row';

        html += `<div class="${dayClass}">`;
        
        html += `
            <div class="week-header">
                <span>${day.dayOfWeek}</span>
                <span class="week-date">${formatDate(day.date)}</span>
            </div>
        `;

        html += '<div class="week-events">';
        if (day.events.length === 0) {
            html += '<div class="event none">予定なし</div>';
        } else {
            day.events.forEach(event => {
                html += renderEventCard(event);
            });
        }
        html += '</div></div>'; 
    });

    container.innerHTML = html;

    // 高さの更新（カルーセル用）
    if (typeof update === 'function') {
        setTimeout(update, 50); // 少し待ってから実行
    }
}

/**
 * イベントカードをレンダリング
 */
function renderEventCard(event) {
    const eventType = event.event_type === 'video' ? 'video' : 'live';
    const url = event.url || '#';
    const thumbnail = event.thumbnail_url || '';
    
    // 時刻とステータス表示の準備
    let timeDisplay = '';
    let statusBadge = '';
    
    // イベントタイプのバッジ
    if (event.event_type === 'live') {
        statusBadge = '<span class="event-status-badge live">【配信】</span>';
    } else if (event.event_type === 'video') {
        statusBadge = '<span class="event-status-badge video">【動画】</span>';
    } else {
        statusBadge = '<span class="event-status-badge other">【その他】</span>';
    }
    
    // 時刻表示の生成
    if (event.start_time) {
        const startTime = new Date(event.start_time);
        const now = new Date();
        const timeStr = startTime.toLocaleTimeString('ja-JP', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: false 
        });
        
        // 未来の予定で confirmed が null または false の場合は「未定」を追加
        if (startTime > now && (event.confirmed === null || event.confirmed === false)) {
            timeDisplay = `${timeStr} <span class="unconfirmed-badge">未定</span>`;
        } else {
            timeDisplay = timeStr;
        }
    } else {
        // start_time が null の場合
        timeDisplay = '<span class="unconfirmed-badge">日時未定</span>';
    }
    
    let html = `<a href="${url}" class="event ${eventType}" target="_blank" rel="noopener">`;
    
    // サムネイル
    if (thumbnail) {
        html += `
            <div class="event-thumb">
                <img src="${thumbnail}" alt="${escapeHtml(event.title)}" loading="lazy">
            </div>
        `;
    }
    
    // 情報
    html += `
        <div class="event-info">
            <div class="event-time">${statusBadge} ${timeDisplay}</div>
            <div class="event-title">${escapeHtml(event.title)}</div>
        </div>
    `;
    
    html += '</a>';
    return html;
}

/**
 * 日付フォーマット (MM/DD)
 */
function formatDate(dateStr) {
    const date = new Date(dateStr);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}/${day}`;
}

/**
 * HTMLエスケープ
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * 週をナビゲート
 */
let currentWeekOffset = 0;

function navigateWeek(direction) {
    currentWeekOffset += direction;
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + (currentWeekOffset * 7));
    loadWeeklySchedule('weekly-schedule', targetDate);
}

/**
 * 今週に戻る
 */
function resetToCurrentWeek() {
    currentWeekOffset = 0;
    loadWeeklySchedule('weekly-schedule');
}

/**
 * 自動リロード設定（オプション）
 * @param {number} intervalMinutes - リロード間隔（分）
 */
function enableAutoReload(intervalMinutes = 5) {
    setInterval(() => {
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + (currentWeekOffset * 7));
        loadWeeklySchedule('weekly-schedule', targetDate);
    }, intervalMinutes * 60 * 1000);
}
function formatLocalDate(d){
  // UTC で日付を取得するのではなく、ローカル日付をそのまま使う
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

// ============================================
// 使用例
// ============================================

/*
HTML側で以下のように配置:

<div id="weekly-schedule"></div>

<script>
    // ページ読み込み時に週間予定を表示
    document.addEventListener('DOMContentLoaded', () => {
        loadWeeklySchedule('weekly-schedule');
        
        // 5分ごとに自動更新（オプション）
        enableAutoReload(5);
    });
</script>

ナビゲーションボタンを追加する場合:

<div style="margin-bottom: 20px;">
    <button onclick="navigateWeek(-1)">← 前週</button>
    <button onclick="resetToCurrentWeek()">今週</button>
    <button onclick="navigateWeek(1)">次週 →</button>
</div>
<div id="weekly-schedule"></div>
*/

// ============================================
// イベント詳細モーダル（オプション機能）
// ============================================

/**
 * イベント詳細を表示するモーダル
 */
function showEventDetail(eventId) {
    fetch(`/api/events/${eventId}`)
        .then(res => res.json())
        .then(event => {
            const modal = document.createElement('div');
            modal.className = 'event-modal';
            modal.innerHTML = `
                <div class="event-modal-overlay" onclick="this.parentElement.remove()"></div>
                <div class="event-modal-content">
                    <button class="event-modal-close" onclick="this.closest('.event-modal').remove()">×</button>
                    ${event.thumbnail_url ? `<img src="${event.thumbnail_url}" alt="${escapeHtml(event.title)}" style="width: 100%; border-radius: 8px; margin-bottom: 20px;">` : ''}
                    <h2>${escapeHtml(event.title)}</h2>
                    <p><strong>日時:</strong> ${new Date(event.start_time).toLocaleString('ja-JP')}</p>
                    ${event.description ? `<p>${escapeHtml(event.description)}</p>` : ''}
                    ${event.url ? `<a href="${event.url}" target="_blank" class="event-detail-link">🔗 配信ページを開く</a>` : ''}
                </div>
            `;
            document.body.appendChild(modal);
        })
        .catch(err => {
            console.error('Error loading event detail:', err);
            alert('イベント情報の取得に失敗しました');
        });
}

// モーダル用のCSS（必要に応じて追加）
const modalStyles = `
<style>
.event-modal {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
}

.event-modal-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.7);
}

.event-modal-content {
    position: relative;
    background: white;
    padding: 30px;
    border-radius: 12px;
    max-width: 600px;
    width: 90%;
    max-height: 80vh;
    overflow-y: auto;
    z-index: 1;
}

.event-modal-close {
    position: absolute;
    top: 15px;
    right: 15px;
    background: none;
    border: none;
    font-size: 30px;
    cursor: pointer;
    color: #999;
}

.event-detail-link {
    display: inline-block;
    margin-top: 20px;
    padding: 12px 24px;
    background: #B11E7C;
    color: white;
    text-decoration: none;
    border-radius: 6px;
    font-weight: 600;
}
</style>
`;

// ============================================
// RSS フィード リンク生成
// ============================================

/**
 * RSSフィードのリンクを追加
 */
function addRssFeedLink() {
    const link = document.createElement('link');
    link.rel = 'alternate';
    link.type = 'application/rss+xml';
    link.title = 'まいちゃん予定表 RSS';
    link.href = '/api/events/rss';
    document.head.appendChild(link);
}

// ページ読み込み時に自動実行
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addRssFeedLink);
} else {
    addRssFeedLink();
}