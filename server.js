// server.js
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const webpush = require('web-push');
const fs = require('fs');
const twitcasting = require('./twitcasting');
const MilestoneScheduler = require('./milestone');
require('dotenv').config();
const adminAuth = require('./admin/admin');

const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

const app = express();
const dbPath = path.join(__dirname, 'data.db');
const db = new sqlite3.Database(dbPath);
let hasPlatformColumn = false;
let hasStatusColumn = false;

const ADMIN_NOTIFY_TOKEN = process.env.ADMIN_NOTIFY_TOKEN || null;
const NOTIFY_HMAC_SECRET = process.env.NOTIFY_HMAC_SECRET || null;

// 起動時 PRAGMA チューニング（db を作った直後に実行）
db.serialize(() => {
  // タイムアウト：ロック待ちを短時間でエラーにしない
  db.run("PRAGMA busy_timeout = 5000"); // ms

  // WAL にすることで「読み取りは書き込み中でも可能」かつ並行性が改善
  db.run("PRAGMA journal_mode = WAL");

  // 書き込みの同期度合い（パフォーマンスと安全性のバランス）
  db.run("PRAGMA synchronous = NORMAL");

  // 一時領域をメモリにする（大きい一時テーブルが多い場合）
  db.run("PRAGMA temp_store = MEMORY");

  // 別途必要なら page_size, cache_size なども調整可能
});

// SSE クライアント集合
const sseClients = new Set();

// SSE送信ユーティリティ（モジュールスコープ）
function sendSseEvent(payload, eventName = 'message') {
  const lines = [];
  if (eventName && eventName !== 'message') lines.push(`event: ${eventName}`);
  // data は複数行でもOKだが here we send single JSON line
  lines.push(`data: ${JSON.stringify(payload)}`);
  const msg = lines.join('\n') + '\n\n';

  for (const res of Array.from(sseClients)) {
    try {
      res.write(msg);
    } catch (e) {
      // 書き込みに失敗したら切断として扱う
      try { res.end(); } catch (_) {}
      sseClients.delete(res);
    }
  }
}

// 定期 ping（全クライアント保持に有効）
const SSE_PING_INTERVAL_MS = 25_000; // 25秒推奨（LBタイムアウトより短めに）
setInterval(() => {
  for (const res of Array.from(sseClients)) {
    try {
      res.write(': ping\n\n'); // コメント行はクライアントで無視される
    } catch (e) {
      try { res.end(); } catch (_) {}
      sseClients.delete(res);
    }
  }
}, SSE_PING_INTERVAL_MS);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/pushweb', express.static(path.join(__dirname, 'pushweb')));
app.use('/admin', express.static(path.join(__dirname, 'admin')));
app.set('trust proxy', true);


// --- VAPID設定 ---
let vapidConfig = {};
try {
  vapidConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'vapid.json'), 'utf8'));
  webpush.setVapidDetails(
    'mailto:admin@honna-yuzuki.com',
    vapidConfig.vapidPublicKey,
    vapidConfig.vapidPrivateKey
  );
  console.log('VAPIDキー読み込み成功');
} catch (e) {
  console.warn('vapid.json 読み込み失敗:', e.message);
  vapidConfig = { vapidPublicKey: 'test-key', vapidPrivateKey: 'test-key' };
  webpush.setVapidDetails('mailto:admin@honna-yuzuki.com', vapidConfig.vapidPublicKey, vapidConfig.vapidPrivateKey);
}


let milestoneScheduler;

// DB初期化
db.serialize(() => {
  // テーブル作成（エラーはログのみ）
  db.run(`CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    body TEXT,
    url TEXT,
    icon TEXT,
    platform TEXT,
    status TEXT DEFAULT 'success',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    data TEXT
  )`, (err) => {
    if (err) console.error('notifications create err:', err.message);
    else console.log('notifications table ensured');
  });

  db.run(`CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id TEXT NOT NULL UNIQUE,
    endpoint TEXT NOT NULL UNIQUE,
    subscription_json TEXT,
    settings_json TEXT DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) console.error('subscriptions create err:', err.message);
    else console.log('subscriptions table ensured');
  });

  // notifications テーブルに platform / status カラムが無ければ追加
  db.all("PRAGMA table_info(notifications)", [], (err, columns) => {
    if (err) {
      console.error('PRAGMA table_info err:', err.message);
      return;
    }
    if (!Array.isArray(columns)) {
      console.warn('PRAGMA table_info returned non-array:', typeof columns);
      return;
    }

    const colNames = columns.map(c => (c && c.name) ? c.name : '');
    const hasPlatform = colNames.includes('platform');
    const hasStatus = colNames.includes('status');

    if (!hasPlatform) {
      db.run("ALTER TABLE notifications ADD COLUMN platform TEXT", (alterErr) => {
        if (alterErr) {
          console.error('ALTER TABLE (platform) err:', alterErr.message);
        } else {
          console.log('✅ notifications テーブルに platform カラムを追加しました');
        }
      });
    }

    if (!hasStatus) {
      // add column（既存行はNULLのままになるため、追加後に既存行へデフォルトをセット）
      db.run("ALTER TABLE notifications ADD COLUMN status TEXT", (alterErr) => {
        if (alterErr) {
          console.error('ALTER TABLE (status) err:', alterErr.message);
        } else {
          console.log('✅ notifications テーブルに status カラムを追加しました');

          // 既存行の status を 'success' に設定（失敗してもログ）
          db.run("UPDATE notifications SET status = 'success' WHERE status IS NULL", (updErr) => {
            if (updErr) {
              console.error('UPDATE notifications set default status err:', updErr.message);
            } else {
              console.log('✅ 既存 notifications 行の status を success に設定しました');
            }
          });
        }
      });
    }
  });

  // 1. subscriptions.client_id (設定取得の高速化 /api/get-platform-settings)
    db.run(`CREATE INDEX IF NOT EXISTS idx_subscriptions_client_id ON subscriptions (client_id)`, (err) => {
        if (err) console.error('subscriptions client_id index err:', err.message);
        else console.log('✅ subscriptions client_id index ensured');
    });

    // 2. notifications.created_at (履歴取得の高速化 /api/history)
    // DESC (降順) にすることで、最新のレコードを素早く検索できます。
    db.run(`CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications (created_at DESC)`, (err) => {
        if (err) console.error('notifications created_at index err:', err.message);
        else console.log('✅ notifications created_at index ensured');
    });

  // 既存の重複データをクリーンアップ（トランザクションで安全に実行）
  db.all(
    `SELECT client_id, COUNT(*) as count FROM subscriptions GROUP BY client_id HAVING count > 1`,
    [],
    (err, duplicates) => {
      if (err) {
        console.error('重複チェックエラー:', err.message);
        return;
      }

      if (!Array.isArray(duplicates) || duplicates.length === 0) {
        console.log('重複レコードなし');
        return;
      }

      console.log(`⚠️  重複レコード発見: ${duplicates.length}件`);

      // トランザクション開始
      db.run('BEGIN TRANSACTION', (beginErr) => {
        if (beginErr) {
          console.error('BEGIN TRANSACTION err:', beginErr.message);
          // フォールバックで個別削除を試みる
        }

        let pending = duplicates.length;
        const finish = () => {
          // commit/rollback はエラーの有無で柔軟に扱う（簡易実装）
          db.run('COMMIT', (commitErr) => {
            if (commitErr) {
              console.error('COMMIT err:', commitErr.message);
            } else {
              console.log('✅ 重複削除トランザクションコミット完了');
            }
          });
        };

        duplicates.forEach(dup => {
          const clientId = dup.client_id;
          // 最新のID以外を削除
          db.run(`
            DELETE FROM subscriptions 
            WHERE client_id = ? 
              AND id NOT IN (
                SELECT MAX(id) FROM subscriptions WHERE client_id = ?
              )
          `, [clientId, clientId], function(delErr) {
            if (delErr) {
              console.error(`重複削除エラー (${clientId}):`, delErr.message);
              // エラー時はトランザクションをロールバック
              db.run('ROLLBACK', (rbErr) => {
                if (rbErr) console.error('ROLLBACK err:', rbErr.message);
                else console.log('トランザクションをロールバックしました');
              });
            } else {
              console.log(`✅ 重複削除完了: ${clientId} (deleted ${this.changes} rows)`);
            }

            pending--;
            if (pending === 0) finish();
          });
        });
      });
    }
  );
});

// プロセス終了時に DB をクローズ（データ破損回避）
process.on('SIGINT', () => {
  console.log('SIGINT received: closing DB and exiting');
  db.close((err) => {
    if (err) console.error('DB close err:', err.message);
    else console.log('DB closed');
    process.exit(err ? 1 : 0);
  });
});

//console.log('ADMIN_NOTIFY_TOKEN:', process.env.ADMIN_NOTIFY_TOKEN);

// --- 通知送信共通 (修正版) ---
async function sendPushNotification(subscription, payload, dbRef, isTest = false) {
  if (!subscription || !subscription.endpoint) {
    console.error('sendPushNotification: invalid subscription object', { subscription });
    return false;
  }

  const options = isTest ? { TTL: 60 } : {};

  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload), options);
    return true;
  } catch (err) {
    const status = err && err.statusCode;
    // 詳細ログ（エラーの本体を可能な範囲で出す）
    console.error('Push send error', {
      endpoint: subscription.endpoint,
      status,
      message: err && err.message,
      stack: err && err.stack,
      body: err && err.body
    });

    // 永続的に無効なサブスクリプションは DB から削除する
    if (status === 410 || status === 404) {
      console.log('Expired/invalid subscription — removing from DB:', subscription.endpoint);

      if (dbRef && typeof dbRef.run === 'function') {
        dbRef.run('DELETE FROM subscriptions WHERE endpoint = ?', [subscription.endpoint], function(delErr) {
          if (delErr) {
            console.error('DB delete err while removing expired subscription:', delErr.message);
          } else {
            console.log('DB delete success for endpoint:', subscription.endpoint);
          }
        });
      } else {
        console.warn('DB reference not provided or invalid; skipping deletion of endpoint:', subscription.endpoint);
      }
    }

    return false;
  }
}

// ----------------------------------------------------
// --- API ---
// ----------------------------------------------------

// --- 購読保存・更新（統合版） ---
app.post('/api/save-platform-settings', (req, res) => {
  console.log('\n========== /api/save-platform-settings START ==========');
  console.log('Request Body keys:', Object.keys(req.body));

  const { clientId, subscription, settings } = req.body || {};

  if (!clientId) {
    console.error('clientId missing');
    return res.status(400).json({ error: 'clientId required' });
  }

  // subscription の簡易バリデーション
  if (!subscription || typeof subscription !== 'object' || !subscription.endpoint) {
    console.error('invalid subscription payload');
    return res.status(400).json({ error: 'subscription and endpoint required' });
  }

  let subscriptionJson;
  try {
    subscriptionJson = JSON.stringify(subscription);
  } catch (e) {
    console.error('subscription JSON stringify failed:', e.message);
    return res.status(400).json({ error: 'invalid subscription object' });
  }

  const settingsJson = settings ? JSON.stringify(settings) : null;
  const endpoint = subscription.endpoint;

  console.log('clientId:', clientId);
  console.log('endpoint (prefix):', endpoint.substring(0, 80));
  console.log('subscriptionJson length:', subscriptionJson.length);
  if (settingsJson) console.log('settingsJson:', settingsJson);

  // 決定方針：
  // 1) 可能なら一発で UPSERT を使う（ON CONFLICT(endpoint) DO UPDATE）
  // 2) SQLite が UPSERT をサポートしない or UNIQUE 冲突で失敗したらフォールバックで UPDATE→INSERT を行う

  const upsertSql = `
    INSERT INTO subscriptions (client_id, endpoint, subscription_json, settings_json)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET
      client_id = excluded.client_id,
      subscription_json = excluded.subscription_json,
      settings_json = excluded.settings_json
  `;

  const upsertParams = [clientId, endpoint, subscriptionJson, settingsJson || '{}'];

  // helper: fallback path (UPDATE by clientId, if no rows then INSERT)
  function fallbackUpsert(callback) {
    // Try update by clientId first (preserve existing endpoint if needed)
    const updates = [];
    const params = [];

    updates.push('subscription_json = ?');
    params.push(subscriptionJson);

    if (settingsJson) {
      updates.push('settings_json = ?');
      params.push(settingsJson);
    }

    // Also update endpoint if provided (endpoint should always be present)
    updates.push('endpoint = ?');
    params.push(endpoint);

    params.push(clientId);

    const updateSql = `UPDATE subscriptions SET ${updates.join(', ')} WHERE client_id = ?`;

    db.run(updateSql, params, function(updateErr) {
      if (updateErr) {
        // If UNIQUE constraint on endpoint triggered, try deleting existing conflicting record then insert
        if (updateErr.message && updateErr.message.includes('UNIQUE')) {
          console.warn('UPDATE caused UNIQUE conflict, attempting to resolve by deleting conflicting endpoint then insert');
          db.run('DELETE FROM subscriptions WHERE endpoint = ? AND client_id != ?', [endpoint, clientId], function(delErr) {
            if (delErr) {
              console.error('Failed to delete conflicting endpoint:', delErr.message);
              return callback(delErr);
            }
            // After removing conflict, try insert
            db.run('INSERT INTO subscriptions (client_id, endpoint, subscription_json, settings_json) VALUES (?, ?, ?, ?)',
              upsertParams, function(insertErr) {
                if (insertErr) return callback(insertErr);
                return callback(null, { lastID: this.lastID, changes: this.changes });
              });
          });
        } else {
          return callback(updateErr);
        }
      } else if (this && this.changes && this.changes > 0) {
        // updated existing row
        return callback(null, { updated: true, changes: this.changes });
      } else {
        // no existing row for clientId -> insert
        db.run('INSERT INTO subscriptions (client_id, endpoint, subscription_json, settings_json) VALUES (?, ?, ?, ?)',
          upsertParams, function(insertErr) {
            if (insertErr) return callback(insertErr);
            return callback(null, { lastID: this.lastID, changes: this.changes });
          });
      }
    });
  }

  // 実行パス：まず UPSERT SQL を試す（高速パス）
  db.run(upsertSql, upsertParams, function(upsertErr) {
    if (!upsertErr) {
      console.log('UPSERT succeeded (fast path). lastID:', this.lastID, 'changes:', this.changes);
      console.log('========== /api/save-platform-settings END ==========\n');
      return res.json({ success: true, message: 'Subscription saved' });
    }

    // UPSERT failed -> フォールバック（古い SQLite 等の互換性対策）
    console.warn('UPSERT failed, falling back. reason:', upsertErr.message);

    fallbackUpsert((fallbackErr, info) => {
      if (fallbackErr) {
        console.error('Fallback upsert error:', fallbackErr.message);
        return res.status(500).json({ error: 'DB upsert error', detail: fallbackErr.message });
      }
      console.log('Fallback upsert success:', info);
      console.log('========== /api/save-platform-settings END ==========\n');
      return res.json({ success: true, message: 'Subscription saved' });
    });
  });
});

// --- 購読削除 (DELETE メソッド) ---
app.delete('/api/save-platform-settings', (req, res) => {
  // 一部クライアントは DELETE で body を送らない場合があるため、クエリにも対応
  const clientId = (req.body && req.body.clientId) || req.query.clientId;
  if (!clientId) return res.status(400).json({ error: 'clientId required' });

  db.run('DELETE FROM subscriptions WHERE client_id = ?', [clientId], function(err) {
    if (err) {
      console.error('/api/save-platform-settings DELETE err:', err.message);
      return res.status(500).json({ error: 'DB delete error', detail: err.message });
    }
    console.log('/api/save-platform-settings DELETE success:', { clientId, deleted: this.changes });
    return res.json({ success: true, message: 'Subscription deleted', deleted: this.changes });
  });
});


// --- プラットフォーム別設定取得 (改善版) ---
app.get('/api/get-platform-settings', (req, res) => {
  let clientId = req.query.clientId;
  if (!clientId) return res.status(400).json({ error: 'clientId required' });

  clientId = String(clientId).trim();
  if (clientId.length === 0 || clientId.length > 256) {
    // 長すぎる clientId は不正とみなす（DoS防止）
    return res.status(400).json({ error: 'invalid clientId' });
  }

  db.get('SELECT settings_json FROM subscriptions WHERE client_id = ?', [clientId], (err, row) => {
    if (err) {
      console.error('/api/get-platform-settings SELECT err:', err.message);
      return res.status(500).json({ error: 'DB error', detail: err.message });
    }

    // デフォルト設定（すべてON）
    const defaultSettings = {
      twitcasting: true,
      youtube: true,
      youtubeCommunity: true,
      fanbox: true,
      twitterMain: true,
      twitterSub: true,
      gipt: false
    };

    // row が無い場合は既定値を返す（存在確認したいなら 404 を返す方針も検討）
    if (!row || !row.settings_json) {
      return res.json({ settings: defaultSettings, exists: !!row });
    }

    // 安全に JSON を解析し、サイズ上限をチェック
    const raw = row.settings_json;
    if (typeof raw !== 'string' || raw.length > 10 * 1024) { // 10KB 上限
      console.warn('/api/get-platform-settings: settings_json invalid or too large. clientId:', clientId);
      return res.json({ settings: defaultSettings });
    }

    try {
      const parsed = JSON.parse(raw);
      // parsed がオブジェクトでない場合は既定値を返す
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('parsed settings not object');
      }
      const merged = { ...defaultSettings, ...parsed };
      return res.json({ settings: merged, exists: true });
    } catch (e) {
      console.error('/api/get-platform-settings parse err:', e.message, 'clientId:', clientId, 'payloadPreview:', raw.substring(0,200));
      return res.json({ settings: defaultSettings, exists: true });
    }
  });
});

// --- 購読者名取得 ---
app.get('/api/get-name', (req, res) => {
  const clientId = (req.query.clientId || '').trim();
  if (!clientId) return res.status(400).json({ error: 'clientId required' });

  db.get('SELECT name FROM subscriptions WHERE client_id = ?', [clientId], (err, row) => {
    if (err) {
      console.error('/api/get-name SELECT err:', err.message);
      return res.status(500).json({ error: 'DB error', detail: err.message });
    }
    if (!row) return res.status(404).json({ error: 'Not found' });
    // row.name may be null
    return res.json({ name: row.name || null });
  });
});

// --- 購読者名保存 ---
app.post('/api/save-name', (req, res) => {
  let { clientId, name } = req.body || {};
  if (!clientId) return res.status(400).json({ error: 'clientId required' });
  clientId = String(clientId).trim();

  if (typeof name !== 'string') return res.status(400).json({ error: 'name required' });
  name = name.trim().slice(0, 255); // 長さ制限（任意）

  // 存在する subscription を更新。無ければ 404（安全策）
  db.get('SELECT 1 FROM subscriptions WHERE client_id = ?', [clientId], (err, row) => {
    if (err) {
      console.error('/api/save-name SELECT err:', err.message);
      return res.status(500).json({ error: 'DB error', detail: err.message });
    }
    if (!row) {
      // optional: insert new subscription with name（ここでは存在しないと404にする）
      return res.status(404).json({ error: 'Subscription not found' });
    }

    db.run('UPDATE subscriptions SET name = ? WHERE client_id = ?', [name || null, clientId], function(updateErr) {
      if (updateErr) {
        console.error('/api/save-name UPDATE err:', updateErr.message);
        return res.status(500).json({ error: 'DB update error', detail: updateErr.message });
      }
      return res.json({ success: true, clientId, name: name || null, changes: this.changes });
    });
  });
});



// --- 単一キー更新（互換性のため） --- (堅牢版)
app.post('/api/save-platform-setting', (req, res) => {
  let { clientId, key, value } = req.body || {};

  // 基本バリデーション
  if (!clientId || !key || typeof value === 'undefined') {
    return res.status(400).json({ error: 'clientId, key, value required' });
  }

  clientId = String(clientId).trim();
  key = String(key).trim();

  // clientId / key の長さ上限と形式チェック（DoS・注入防止）
  if (clientId.length === 0 || clientId.length > 256) {
    return res.status(400).json({ error: 'invalid clientId' });
  }
  if (!/^[A-Za-z0-9_]+$/.test(key) || key.length > 64) {
    return res.status(400).json({ error: 'invalid key (allowed: A-Za-z0-9_)' });
  }

  // 正規化: "true"/"false" を boolean に変換
  const finalValue = (typeof value === 'string') ? (value.toLowerCase() === 'true') : !!value;

  // トランザクションで原子的に読み取り→更新
  db.run('BEGIN IMMEDIATE TRANSACTION', (beginErr) => {
    if (beginErr) {
      console.error('/api/save-platform-setting BEGIN err:', beginErr.message);
      return res.status(500).json({ error: 'DB transaction error', detail: beginErr.message });
    }

    db.get('SELECT settings_json FROM subscriptions WHERE client_id = ?', [clientId], (selectErr, row) => {
      if (selectErr) {
        console.error('/api/save-platform-setting SELECT err:', selectErr.message);
        // ロールバック
        return db.run('ROLLBACK', () => res.status(500).json({ error: 'DB error', detail: selectErr.message }));
      }

      if (!row) {
        // 該当購読が無い -> ロールバックして 404 を返す
        return db.run('ROLLBACK', () => res.status(404).json({ error: 'Subscription not found' }));
      }

      let current = {};
      try {
        current = row.settings_json ? JSON.parse(row.settings_json) : {};
        if (!current || typeof current !== 'object') current = {};
      } catch (e) {
        console.warn('/api/save-platform-setting: invalid existing settings_json, resetting to {}. clientId:', clientId);
        current = {};
      }

      current[key] = finalValue;

      const updated = JSON.stringify(current);

      // サイズチェック（安全装置）
      if (updated.length > 10 * 1024) { // 10KB
        console.error('/api/save-platform-setting: updated settings_json too large', { clientId, size: updated.length });
        return db.run('ROLLBACK', () => res.status(400).json({ error: 'settings_json too large' }));
      }

      db.run('UPDATE subscriptions SET settings_json = ? WHERE client_id = ?', [updated, clientId], function(updateErr) {
        if (updateErr) {
          console.error('/api/save-platform-setting UPDATE err:', updateErr.message);
          return db.run('ROLLBACK', () => res.status(500).json({ error: 'DB update error', detail: updateErr.message }));
        }

        // commit
        db.run('COMMIT', (commitErr) => {
          if (commitErr) {
            console.error('/api/save-platform-setting COMMIT err:', commitErr.message);
            return db.run('ROLLBACK', () => res.status(500).json({ error: 'DB commit error', detail: commitErr.message }));
          }

          // 成功レスポンスに更新後の設定を返す（実務的に便利）
          return res.json({ success: true, message: 'Setting updated', settings: current });
        });
      });
    });
  });
});


// --- 履歴取得 (改善版) ---
app.get('/api/history', (req, res) => {
  // clientId は将来のフィルタ用に受け取っておく（現状未使用）
  const clientId = req.query.clientId;
  let limit = parseInt(req.query.limit, 10) || 10;
  let offset = parseInt(req.query.offset, 10) || 0;

  // 安全対策
  if (isNaN(limit) || limit < 1) limit = 10;
  if (isNaN(offset) || offset < 0) offset = 0;
  const MAX_LIMIT = 100;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;
const tStart = Date.now();
  // 件数取得
  db.get('SELECT COUNT(*) AS cnt FROM notifications', [], (countErr, countRow) => {
const tAfterCount = Date.now()
    if (countErr) {
      console.error('/api/history COUNT err:', countErr.message);
      return res.status(500).json({ error: 'DB error', detail: countErr.message });
    }

    const total = (countRow && typeof countRow.cnt === 'number') ? countRow.cnt : (countRow && countRow.cnt ? parseInt(countRow.cnt, 10) : 0);

    // 0 件なら空リストを早期返却
    if (!total) {
      return res.json({ logs: [], total: 0, hasMore: false });
    }
const tBeforePragma = Date.now();
    // カラム存在チェック（堅牢に）
    db.all("PRAGMA table_info(notifications)", [], (pragmaErr, columns) => {
const tAfterPragma = Date.now();
console.log('/api/history timing after PRAGMA:', tAfterPragma - tBeforePragma, 'ms');
      if (pragmaErr) {
        console.error('/api/history PRAGMA err:', pragmaErr.message);
        return res.status(500).json({ error: 'DB error', detail: pragmaErr.message });
      }

      const colArray = Array.isArray(columns) ? columns : [];
      const hasPlatform = colArray.some(col => col && col.name === 'platform');
      const hasStatus = colArray.some(col => col && col.name === 'status');

      let selectFields = "id, title, body, url, icon, strftime('%s', created_at) AS timestamp";
      if (hasPlatform) selectFields += ', platform';
      if (hasStatus) selectFields += ', status';

      const sql = `SELECT ${selectFields} FROM notifications ORDER BY created_at DESC LIMIT ? OFFSET ?`;
const tBeforeSelect = Date.now();
      db.all(sql, [limit, offset], (err, rows) => {
const tAfterSelect = Date.now();
console.log('/api/history timing after SELECT:', tAfterSelect - tBeforeSelect, 'ms');
console.log('/api/history total server time:', Date.now() - tStart, 'ms');
        if (err) {
          console.error('/api/history SELECT err:', err.message);
          return res.status(500).json({ error: 'DB error', detail: err.message });
        }

        // rows が未定義の場合に備える
        const safeRows = Array.isArray(rows) ? rows : [];

        const hasMore = offset + safeRows.length < total;
        const logs = safeRows.map(r => ({
          id: r.id,
          title: r.title,
          body: r.body,
          url: r.url,
          icon: r.icon,
          platform: (hasPlatform ? (r.platform || '不明') : '不明'),
          status: (hasStatus ? (r.status || 'success') : 'success'),
          // timestamp が null/undefined の場合は 0 を返す
          timestamp: r.timestamp ? parseInt(r.timestamp, 10) : 0
        }));

        return res.json({ logs, total, hasMore });
      });
    });
  });
});

// SSE エンドポイント: クライアントは EventSource('/api/history/stream')
app.get('/api/history/stream', (req, res) => {
  // 任意認証や clientId パラメータを受け取りたい場合はここで処理可能
  // const clientId = req.query.clientId;

  // SSE ヘッダ
  res.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    // CORS が必要なら適宜追加
    // 'Access-Control-Allow-Origin': '*'
  });
  res.flushHeaders && res.flushHeaders();

  // 初回イベント（握手）
  res.write(`:ok\n\n`); // コメント行で接続保持を促す
  sseClients.add(res);
  console.log('[SSE] client connected (total=%d)', sseClients.size);

  // 切断時のクリーンアップ
  req.on('close', () => {
    sseClients.delete(res);
    try { res.end(); } catch (e) {}
    console.log('[SSE] client disconnected (total=%d)', sseClients.size);
  });

  // --- オプション: ping（コネクション維持） ---
  // keepAliveInterval はグローバルで1つだけにするか、ここで個別にセットする
  // ここでは個別に setInterval を使わない（単純化）。必要なら実装可能。
});

// --- テスト通知 (改善版) ---
app.post('/api/send-test', (req, res) => {
  const clientId = (req.body && req.body.clientId) || null;
  if (!clientId) return res.status(400).json({ error: 'clientId required' });

  db.get('SELECT subscription_json FROM subscriptions WHERE client_id = ?', [clientId], async (err, row) => {
    if (err) {
      console.error('/api/send-test SELECT err:', err.message);
      return res.status(500).json({ error: 'DB error', detail: err.message });
    }
    if (!row || !row.subscription_json) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    let subscription;
    try {
      subscription = JSON.parse(row.subscription_json);
    } catch (e) {
      console.error('/api/send-test parse subscription_json err:', e.message, 'clientId:', clientId);
      return res.status(500).json({ error: 'Invalid subscription data', detail: 'parse error' });
    }

    // payload の検証（必要に応じてフィールドを調整）
    const payload = {
      title: 'テスト通知',
      body: 'この通知をタップしてURLに飛べるか確認！',
      url: './test/',
      icon: `${req.protocol}://${req.get('host')}/icon.ico`
    };

    // 短めの保護（サイズ制限）
    const payloadStr = JSON.stringify(payload);
    if (payloadStr.length > 8 * 1024) {
      console.error('/api/send-test: payload too large', { clientId, size: payloadStr.length });
      return res.status(400).json({ error: 'payload too large' });
    }

    try {
      const sent = await sendPushNotification(subscription, payload, db, true);
      // テスト通知は履歴に保存しない方針のまま
      return res.json({ success: sent });
    } catch (e) {
      console.error('/api/send-test error (unexpected):', e && e.message);
      return res.status(500).json({ error: 'Send error', detail: e && e.message });
    }
  });
});

// 重複通知防止用キャッシュ（メモリ上）
// DUPLICATE_WINDOW_MS を環境変数で上書き可能にする
const DUPLICATE_WINDOW_MS = parseInt(process.env.DUPLICATE_WINDOW_MS, 10) || (60 * 1000);
const recentNotifications = new Map(); // key: hash, value: timestamp

// 通知のハッシュを生成（title/url/body を利用。必要ならさらに正規化）
function getNotificationHash(data = {}, settingKey) {
  const title = (data.title || '').toString().slice(0, 200);
  const url = (data.url || '').toString().slice(0, 200);
  const body = (typeof data.body === 'string') ? data.body.slice(0, 200) : '';
  return `${settingKey || 'unknown'}:${url}:${title}:${body}`;
}

// レートリミット: 同一IP/トークンあたり 1分に10回（調整可）
// keyGenerator のフォールバックを強化
const notifyLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  keyGenerator: rateLimit.ipKeyGenerator || ((req) => {
    return req.ip || req.headers['x-forwarded-for']?.split(',')?.[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  }),
  standardHeaders: true,
  legacyHeaders: false
});


// 認証ミドルウェア: ヘッダ X-Notify-Token または Authorization: Bearer <token>
function requireNotifyToken(req, res, next) {
  if (!ADMIN_NOTIFY_TOKEN) {
    console.error('Server misconfiguration: ADMIN_NOTIFY_TOKEN not set');
    return res.status(500).json({ error: 'Server misconfiguration: ADMIN_NOTIFY_TOKEN not set' });
  }

  const authHeader = req.get('Authorization') || '';
  const bearerMatch = authHeader.match(/^\s*Bearer\s+(.+)$/i);
  const token = req.get('X-Notify-Token') || (bearerMatch ? bearerMatch[1] : null);

  // ログはマスクして出力（先頭/末尾のみ）
  const mask = s => {
    if (!s) return null;
    if (s.length <= 8) return '****';
    return `${s.slice(0,4)}...${s.slice(-4)}`;
  };
  console.log('[AUTH] Received token headers:', {
    'X-Notify-Token': mask(req.get('X-Notify-Token')),
    'Authorization': mask(authHeader)
  });
  console.log('[AUTH] Extracted token mask:', mask(token));

  if (!token || token !== ADMIN_NOTIFY_TOKEN) {
    console.warn('[AUTH] Token mismatch or missing');
    return res.status(401).json({ error: 'Unauthorized: invalid notify token' });
  }
  next();
}

// 任意: HMAC 検証ミドルウェア（NOTIFY_HMAC_SECRET が設定されていれば検証）
function verifyNotifyHmac(req, res, next) {
  if (!NOTIFY_HMAC_SECRET) {
    // 環境変数が無ければ検証をスキップ（既存の挙動）
    return next();
  }

  const signatureHeader = req.get('X-Signature') || ''; // 期待形式: sha256=<hex>
  if (!signatureHeader.startsWith('sha256=')) {
    console.warn('[HMAC] Missing or invalid X-Signature header');
    return res.status(401).json({ error: 'Unauthorized: missing signature' });
  }
  const recvSigHex = signatureHeader.slice(7);

  // 受け取り値の基本検証（hex で偶数長であること）
  if (!/^[0-9a-fA-F]+$/.test(recvSigHex) || (recvSigHex.length % 2) !== 0) {
    console.warn('[HMAC] Received signature not valid hex or wrong length');
    return res.status(401).json({ error: 'Unauthorized: invalid signature format' });
  }

  let bodyString;
  try {
    bodyString = JSON.stringify(req.body || {});
  } catch (e) {
    console.error('[HMAC] Failed to stringify body for HMAC:', e.message);
    return res.status(400).json({ error: 'Bad request body' });
  }

  const hmac = crypto.createHmac('sha256', NOTIFY_HMAC_SECRET);
  hmac.update(bodyString);
  const expectedHex = hmac.digest('hex');

  // 長さが違うと timingSafeEqual が throw するため先に長さチェック
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  const recvBuf = Buffer.from(recvSigHex, 'hex');

  if (expectedBuf.length !== recvBuf.length) {
    console.warn('[HMAC] Signature length mismatch');
    return res.status(401).json({ error: 'Unauthorized: invalid signature' });
  }

  try {
    if (!crypto.timingSafeEqual(expectedBuf, recvBuf)) {
      console.warn('[HMAC] Signature mismatch');
      return res.status(401).json({ error: 'Unauthorized: invalid signature' });
    }
  } catch (e) {
    console.error('[HMAC] timingSafeEqual error:', e.message);
    return res.status(401).json({ error: 'Unauthorized: invalid signature' });
  }

  // 検証成功
  next();
}


// --- 通知受信（外部サービスから） --- (改善版、並列送信かつ同時上限あり)
app.post('/api/notify', notifyLimiter, requireNotifyToken, verifyNotifyHmac, (req, res) => {
  const { data, type, settingKey } = req.body;
  if (!data || !type) return res.status(400).json({ error: 'Missing data or type' });

  console.log('[/api/notify] 通知リクエスト受信:', { title: data.title, settingKey });

  const notificationHash = getNotificationHash(data, settingKey);
  const now = Date.now();
  const lastSent = recentNotifications.get(notificationHash);

  if (lastSent && (now - lastSent) < DUPLICATE_WINDOW_MS) {
    const timeSinceLastSent = Math.round((now - lastSent) / 1000);
    console.log(`[/api/notify] ⚠️  重複通知を検出: ${notificationHash} (${timeSinceLastSent}秒前に送信済み)`);
    return res.json({ success: true, message: 'Duplicate notification ignored', duplicate: true });
  }

  recentNotifications.set(notificationHash, now);
  console.log(`[/api/notify] ✅ 新規通知として処理: ${notificationHash}`);

  // 古いキャッシュをクリーンアップ（メモリリーク防止）
  if (recentNotifications.size > 1000) {
    const cutoff = now - DUPLICATE_WINDOW_MS;
    for (const [hash, timestamp] of recentNotifications.entries()) {
      if (timestamp < cutoff) recentNotifications.delete(hash);
    }
  }

  // 履歴保存は非同期で行う（失敗しても通知送信には影響させない）
  db.run(
    'INSERT INTO notifications (title, body, url, icon, platform, status) VALUES (?, ?, ?, ?, ?, ?)',
    [data.title, data.body, data.url, data.icon, settingKey || type, 'success'],
    function(insertErr) {
      if (insertErr) {
        console.error('[/api/notify] 履歴保存エラー:', insertErr.message);
      } else {
        console.log('[/api/notify] 履歴保存成功 (ID:', this.lastID, ')');
              // ← ここに SSE 通知を追加
      try {
        sendSseEvent({
          type: 'history-updated',
          lastUpdated: Math.floor(Date.now() / 1000),
          added: [this.lastID] // 追加された行のID
          // 必要なら changed/removed フィールドを追加
        });
      } catch (e) {
        console.warn('sendSseEvent error:', e && e.message);
      }
      }
    }
  );

  // 取得して送信（同時実行上限あり）
  db.all('SELECT client_id, subscription_json, settings_json FROM subscriptions', [], async (err, rows) => {
    if (err) {
      console.error('/api/notify SELECT err:', err.message);
      return res.status(500).json({ error: 'DB error', detail: err.message });
    }

    const total = Array.isArray(rows) ? rows.length : 0;
    console.log(`[/api/notify] 購読者数: ${total}人`);

    if (!total) return res.json({ success: true, message: 'No subscribers', sentCount: 0, totalCount: 0 });

    // 同時実行数（環境変数 or デフォルト）
    const CONCURRENCY = Math.max(1, parseInt(process.env.NOTIFY_CONCURRENCY, 10) || 20);

    // シンプルな mapLimit 実装（外部ライブラリ不要）
    async function mapWithLimit(items, limit, iterator) {
      const results = new Array(items.length);
      let idx = 0;
      const workers = new Array(Math.min(limit, items.length)).fill(null).map(async () => {
        while (true) {
          const i = idx++;
          if (i >= items.length) break;
          try {
            results[i] = await iterator(items[i], i);
          } catch (e) {
            results[i] = { error: e && e.message ? e.message : String(e) };
          }
        }
      });
      await Promise.all(workers);
      return results;
    }

    // 送信処理（1行分）
    async function sendForRow(row) {
      const clientId = row.client_id;
      if (!row.subscription_json) {
        console.warn(`[/api/notify] ${clientId}: subscription_json missing, skip`);
        return { clientId, sent: false, reason: 'no_subscription' };
      }

      let subscription;
      try {
        subscription = JSON.parse(row.subscription_json);
      } catch (e) {
        console.error(`[/api/notify] ${clientId}: subscription_json parse error:`, e.message);
        return { clientId, sent: false, reason: 'parse_error' };
      }

      let settings = {};
      try {
        settings = row.settings_json ? JSON.parse(row.settings_json) : {};
      } catch (e) {
        console.warn(`[/api/notify] ${clientId}: settings_json parse error, defaulting to {}`, e.message);
        settings = {};
      }

      // 設定でオフならスキップ
      if (settingKey && settings[settingKey] === false) {
        console.log(`[/api/notify] ❌ ${clientId}: ${settingKey} がOFFのためスキップ`);
        return { clientId, sent: false, reason: 'disabled' };
      }

      // 実送信
      try {
        console.log(`[/api/notify] ✅ ${clientId}: 送信キューへ`);
        const sent = await sendPushNotification(subscription, data, db, false);
        return { clientId, sent };
      } catch (e) {
        console.error(`[/api/notify] ${clientId}: unexpected send error`, e && e.message);
        return { clientId, sent: false, error: e && e.message };
      }
    }

    // 並列制御付きで送信
    const results = await mapWithLimit(rows, CONCURRENCY, sendForRow);

    // 集計
    const sentCount = results.filter(r => r && r.sent).length;
    console.log(`[/api/notify] 完了: ${sentCount}/${total}人に送信`);

    return res.json({
      success: true,
      message: `Notification sent to ${sentCount} clients`,
      sentCount,
      totalCount: total,
      detailsSummary: {
        attempted: total,
        succeeded: sentCount,
        failed: total - sentCount
      }
    });
  });
});


// --- 管理用: 購読リスト (認証必須、ページング) ---
app.get('/api/subscriptions', adminAuth.requireAuth, (req, res) => {
  let limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50)); // max 100
  let offset = Math.max(0, parseInt(req.query.offset, 10) || 0);

  db.all('SELECT id, client_id, endpoint, created_at FROM subscriptions ORDER BY created_at DESC LIMIT ? OFFSET ?', [limit, offset], (err, rows) => {
    if (err) {
      console.error('/api/subscriptions SELECT err:', err.message);
      return res.status(500).json({ error: 'DB error', detail: err.message });
    }
    return res.json({ items: rows || [], limit, offset });
  });
});

// --- VAPID 公開鍵 ---
app.get('/api/vapidPublicKey', (req, res) => {
  return res.send(vapidConfig.vapidPublicKey || '');
});

// --- TwitCasting 認証 ---
app.get('/api/twicas/auth', (req, res) => {
  try {
    const authUrl = twitcasting.getAuthUrl();
    console.log('TwitCasting Auth redirect:', authUrl);
    return res.redirect(authUrl);
  } catch (e) {
    console.error('/api/twicas/auth error:', e && e.message);
    return res.status(500).send('Auth initialization failed');
  }
});

app.get(twitcasting.CALLBACK_PATH, async (req, res) => {
  try {
    const code = req.query.code;
    if (!code) return res.status(400).send('Code missing');

    const token = await twitcasting.exchangeCodeForToken(code);
    if (token) {
      await twitcasting.subscribeToWebhook();
      return res.send('<h1>TwitCasting 認証成功</h1><p>完了しました。</p>');
    } else {
      console.error('TwitCasting exchangeCodeForToken returned falsy token');
      return res.status(500).send('Auth failed');
    }
  } catch (e) {
    console.error('TwitCasting callback error:', e && e.message);
    return res.status(500).send('Auth error');
  }
});

// マイルストーン通知スケジューラー起動
if (vapidConfig.vapidPublicKey !== 'test-key') {
  milestoneScheduler = new MilestoneScheduler(dbPath, vapidConfig);
  milestoneScheduler.start();
} else {
  console.log('⚠️  VAPID未設定のためマイルストーン通知は無効');
}

// 管理者ログイン / ログアウト / verify
app.post('/api/admin/login', adminAuth.login);
app.post('/api/admin/logout', adminAuth.logout);
app.get('/api/admin/verify', adminAuth.requireAuth, (req, res) => {
  res.json({ success: true, user: req.adminUser });
});

// 管理者通知送信（認証必須、ターゲット送信対応、並列度制御）
app.post('/api/admin/notify', adminAuth.requireAuth, async (req, res) => {
  const { data, type, settingKey, clientId: clientIdsString } = req.body;
  if (!data || !type) return res.status(400).json({ error: 'Missing data or type' });

  // clientIds -> array
  const clientIds = clientIdsString
    ? String(clientIdsString).split(',').map(id => id.trim()).filter(id => id.length > 0)
    : [];
  const isTargetedSend = clientIds.length > 0;

  // Safety: limit number of clientIds allowable in one request
  const MAX_TARGET = 500;
  if (clientIds.length > MAX_TARGET) {
    return res.status(400).json({ error: `Too many clientIds (max ${MAX_TARGET})` });
  }

  console.log(`[Admin Notification] ${req.adminUser} => ${isTargetedSend ? `target ${clientIds.length}` : 'broadcast'}:`, data.title);

  // 重複チェック
  const notificationHash = getNotificationHash(data, settingKey);
  const now = Date.now();
  const lastSent = recentNotifications.get(notificationHash);
  if (lastSent && (now - lastSent) < DUPLICATE_WINDOW_MS) {
    return res.json({ success: true, message: 'Duplicate notification ignored', duplicate: true });
  }
  recentNotifications.set(notificationHash, now);

  // 全員送信時のみ履歴保存（非同期）
  if (!isTargetedSend) {
    db.run(
      'INSERT INTO notifications (title, body, url, icon, platform, status) VALUES (?, ?, ?, ?, ?, ?)',
      [data.title, data.body, data.url, data.icon, 'admin', 'success'],
      function(insertErr) {
        if (insertErr) {
          console.error('[Admin Notification] 履歴保存エラー:', insertErr.message);
        } else {
          console.log('[Admin Notification] 履歴保存成功 (ID:', this.lastID, ')');
                // ← ここに SSE 通知を追加
      try {
        sendSseEvent({
          type: 'history-updated',
          lastUpdated: Math.floor(Date.now() / 1000),
          added: [this.lastID] // 追加された行のID
          // 必要なら changed/removed フィールドを追加
        });
      } catch (e) {
        console.warn('sendSseEvent error:', e && e.message);
      }
        }
      }
    );
  }

  // build SELECT
  let selectSql = 'SELECT client_id, subscription_json, settings_json FROM subscriptions';
  let selectParams = [];
  if (isTargetedSend) {
    const placeholders = clientIds.map(() => '?').join(', ');
    selectSql += ` WHERE client_id IN (${placeholders})`;
    selectParams = clientIds;
  }

  db.all(selectSql, selectParams, async (err, rows) => {
    if (err) {
      console.error('[Admin Notification] SELECT err:', err.message);
      return res.status(500).json({ error: 'DB error', detail: err.message });
    }

    const total = Array.isArray(rows) ? rows.length : 0;
    console.log(`[Admin Notification] 対象: ${total}人`);

    if (!total) return res.json({ success: true, message: 'No subscribers', sentCount: 0, totalCount: 0 });

    // 並列度（環境変数で調整可能）
    const CONCURRENCY = Math.max(1, parseInt(process.env.NOTIFY_CONCURRENCY, 10) || 20);

    // 内製の mapWithLimit（先に notify mapWithLimit を共通化しても良い）
    async function mapWithLimit(items, limit, iterator) {
      const results = new Array(items.length);
      let idx = 0;
      const workers = new Array(Math.min(limit, items.length)).fill(null).map(async () => {
        while (true) {
          const i = idx++;
          if (i >= items.length) break;
          try {
            results[i] = await iterator(items[i], i);
          } catch (e) {
            results[i] = { error: e && e.message ? e.message : String(e) };
          }
        }
      });
      await Promise.all(workers);
      return results;
    }

    // 送信処理（管理通知は設定チェック不要で直接送るか、必要なら設定を考慮）
    async function sendForRow(row) {
      const clientId = row.client_id;
      if (!row.subscription_json) {
        console.warn(`[Admin Notification] ${clientId}: missing subscription_json`);
        return { clientId, sent: false, reason: 'no_subscription' };
      }

      let subscription;
      try {
        subscription = JSON.parse(row.subscription_json);
      } catch (e) {
        console.error(`[Admin Notification] ${clientId}: subscription parse err`, e.message);
        return { clientId, sent: false, reason: 'parse_error' };
      }

      try {
        const sent = await sendPushNotification(subscription, data, db, false);
        return { clientId, sent };
      } catch (e) {
        console.error(`[Admin Notification] ${clientId}: send error`, e && e.message);
        return { clientId, sent: false, error: e && e.message };
      }
    }

    const results = await mapWithLimit(rows, CONCURRENCY, sendForRow);
    const sentCount = results.filter(r => r && r.sent).length;

    console.log(`[Admin Notification] 完了: ${sentCount}/${total}人`);

    return res.json({
      success: true,
      message: `Notification sent to ${sentCount} clients`,
      sentCount,
      totalCount: total
    });
  });
});

/*
// パスワードハッシュ生成ツール（開発用 - 本番では削除推奨）
app.get('/api/admin/generate-hash', (req, res) => {
  const password = req.query.password;
  if (!password) {
    return res.status(400).json({ error: 'password query parameter required' });
  }
  const hash = adminAuth.generatePasswordHash(password);
  res.json({ password, hash });
});
*/
// --- 起動 ---
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});