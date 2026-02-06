// weekly/event-upsert.js
const fs = require('fs');
const path = require('path');

// 簡易的なJSONデータベース
const DB_FILE = path.join(__dirname, 'events.json');

function loadEvents() {
    try {
        if (fs.existsSync(DB_FILE)) {
            return JSON.parse(fs.readFileSync(DB_FILE, 'utf8') || '[]');
        }
    } catch (e) {
        console.error('Failed to load events:', e);
    }
    return [];
}

function saveEvents(events) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(events, null, 2), 'utf8');
    } catch (e) {
        console.error('Failed to save events:', e);
    }
}

/**
 * eventオブジェクトを追加 or 更新する
 * @param {Object} event
 */
async function upsertEvent(event) {
    const events = loadEvents();
    const idx = events.findIndex(e => e.external_id === event.external_id && e.platform === event.platform);
    if (idx >= 0) {
        events[idx] = { ...events[idx], ...event }; // 上書き
    } else {
        events.push(event);
    }
    saveEvents(events);
    return true;
}

module.exports = { upsertEvent };
