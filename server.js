// server.js
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const webpush = require('web-push');
const fs = require('fs');
const twitcasting = require('./twitcasting');
const MilestoneScheduler = require('./milestone');
const adminAuth = require('./admin/admin');

const app = express();
const dbPath = path.join(__dirname, 'data.db');
const db = new sqlite3.Database(dbPath);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/pushweb', express.static(path.join(__dirname, 'pushweb')));
app.use('/admin', express.static(path.join(__dirname, 'admin')));


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
  )`, (err) => { if (err) console.error('notifications create err:', err.message); });

  db.run(`CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id TEXT NOT NULL UNIQUE,
    endpoint TEXT NOT NULL UNIQUE,
    subscription_json TEXT,
    settings_json TEXT DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, (err) => { if (err) console.error('subscriptions create err:', err.message); });

  // 既存テーブルに platform と status カラムを追加（存在しない場合）
  db.all("PRAGMA table_info(notifications)", [], (err, columns) => {
    if (err) {
      console.error('PRAGMA table_info err:', err.message);
      return;
    }
    
    const hasPlatform = columns.some(col => col.name === 'platform');
    const hasStatus = columns.some(col => col.name === 'status');
    
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
      db.run("ALTER TABLE notifications ADD COLUMN status TEXT DEFAULT 'success'", (alterErr) => {
        if (alterErr) {
          console.error('ALTER TABLE (status) err:', alterErr.message);
        } else {
          console.log('✅ notifications テーブルに status カラムを追加しました');
        }
      });
    }
  });

  // 既存の重複データをクリーンアップ
  db.all(`SELECT client_id, COUNT(*) as count FROM subscriptions GROUP BY client_id HAVING count > 1`, [], (err, duplicates) => {
    if (err) {
      console.error('重複チェックエラー:', err.message);
      return;
    }
    
    if (duplicates.length > 0) {
      console.log(`⚠️  重複レコード発見: ${duplicates.length}件`);
      
      // 各client_idの最新レコード以外を削除
      duplicates.forEach(dup => {
        db.run(`
          DELETE FROM subscriptions 
          WHERE client_id = ? 
          AND id NOT IN (
            SELECT MAX(id) FROM subscriptions WHERE client_id = ?
          )
        `, [dup.client_id, dup.client_id], (delErr) => {
          if (delErr) {
            console.error(`重複削除エラー (${dup.client_id}):`, delErr.message);
          } else {
            console.log(`✅ 重複削除完了: ${dup.client_id}`);
          }
        });
      });
    }
  });
});

// --- 通知送信共通 ---
async function sendPushNotification(subscription, payload, dbRef, isTest = false) {
  const options = isTest ? { TTL: 60 } : {};
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload), options);
    return true;
  } catch (err) {
    if (err && (err.statusCode === 410 || err.statusCode === 404)) {
      console.log('Expired/invalid subscription removed:', subscription?.endpoint);
      try {
        dbRef.run('DELETE FROM subscriptions WHERE endpoint = ?', [subscription.endpoint]);
      } catch (e) {
        console.error('DB delete exception:', e);
      }
    } else {
      console.error('Push failed:', err?.message, subscription?.endpoint);
    }
    return false;
  }
}

// ----------------------------------------------------
// --- API ---
// ----------------------------------------------------

// --- 購読保存・更新（統合版） ---
app.post('/api/save-platform-settings', (req, res) => {
  const { clientId, subscription, settings } = req.body;
  if (!clientId) return res.status(400).json({ error: 'clientId required' });

  const endpoint = subscription?.endpoint || null;
  const subscriptionJson = subscription ? JSON.stringify(subscription) : null;
  const settingsJson = settings ? JSON.stringify(settings) : null;

  // clientId に紐づくレコードを探す
  db.get('SELECT * FROM subscriptions WHERE client_id = ?', [clientId], (err, rowByClient) => {
    if (err) {
      console.error('/api/save-platform-settings SELECT err:', err.message);
      return res.status(500).json({ error: 'DB error', detail: err.message });
    }

    // Upsert処理
    const doUpsert = () => {
      if (!subscriptionJson || !endpoint) {
        return res.status(400).json({ error: 'subscription and endpoint required' });
      }
      const sql = `
        INSERT INTO subscriptions (client_id, endpoint, subscription_json, settings_json)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(endpoint) DO UPDATE SET
          client_id = excluded.client_id,
          subscription_json = excluded.subscription_json,
          settings_json = excluded.settings_json
      `;
      db.run(sql, [clientId, endpoint, subscriptionJson, settingsJson || '{}'], function(insertErr) {
        if (insertErr) {
          console.error('/api/save-platform-settings UPSERT err:', insertErr.message);
          return res.status(500).json({ error: 'DB upsert error', detail: insertErr.message });
        }
        return res.json({ success: true, message: 'Subscription saved' });
      });
    };

    // 更新処理
    if (rowByClient) {
      const updates = [];
      const params = [];

      if (subscriptionJson && endpoint) {
        updates.push('subscription_json = ?', 'endpoint = ?');
        params.push(subscriptionJson, endpoint);
      }
      if (settingsJson) {
        updates.push('settings_json = ?');
        params.push(settingsJson);
      }

      if (updates.length === 0) {
        return res.json({ success: true, message: 'Nothing to update' });
      }

      params.push(clientId);
      const sql = `UPDATE subscriptions SET ${updates.join(', ')} WHERE client_id = ?`;
      db.run(sql, params, function(updateErr) {
        if (updateErr && updateErr.message.includes('UNIQUE constraint')) {
          console.warn('UPDATE UNIQUE constraint — falling back to upsert');
          return doUpsert();
        } else if (updateErr) {
          console.error('/api/save-platform-settings UPDATE err:', updateErr.message);
          return res.status(500).json({ error: 'DB update error', detail: updateErr.message });
        }
        return res.json({ success: true, message: 'Settings updated' });
      });
    } else {
      // 新規作成
      return doUpsert();
    }
  });
});

// --- 購読削除 (DELETE メソッド) ---
app.delete('/api/save-platform-settings', (req, res) => {
  const { clientId } = req.body;
  if (!clientId) return res.status(400).json({ error: 'clientId required' });

  db.run('DELETE FROM subscriptions WHERE client_id = ?', [clientId], function(err) {
    if (err) {
      console.error('/api/save-platform-settings DELETE err:', err.message);
      return res.status(500).json({ error: 'DB delete error', detail: err.message });
    }
    return res.json({ success: true, message: 'Subscription deleted', deleted: this.changes });
  });
});

// --- プラットフォーム別設定取得 ---
app.get('/api/get-platform-settings', (req, res) => {
  const clientId = req.query.clientId;
  if (!clientId) return res.status(400).json({ error: 'clientId required' });

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
      twitterSub: true
    };

    if (!row || !row.settings_json) {
      return res.json({ settings: defaultSettings });
    }

    try {
      const parsed = JSON.parse(row.settings_json);
      const merged = { ...defaultSettings, ...parsed };
      return res.json({ settings: merged });
    } catch (e) {
      console.error('/api/get-platform-settings parse err:', e.message);
      return res.json({ settings: defaultSettings });
    }
  });
});

// --- 単一キー更新（互換性のため） ---
app.post('/api/save-platform-setting', (req, res) => {
  const { clientId, key, value } = req.body;
  if (!clientId || !key || typeof value === 'undefined') {
    return res.status(400).json({ error: 'clientId, key, value required' });
  }

  db.get('SELECT settings_json FROM subscriptions WHERE client_id = ?', [clientId], (err, row) => {
    if (err) {
      console.error('/api/save-platform-setting SELECT err:', err.message);
      return res.status(500).json({ error: 'DB error', detail: err.message });
    }
    if (!row) return res.status(404).json({ error: 'Subscription not found' });

    let current = {};
    try {
      current = row.settings_json ? JSON.parse(row.settings_json) : {};
    } catch (e) {
      current = {};
    }

    const finalValue = (typeof value === 'string') ? (value.toLowerCase() === 'true') : !!value;
    current[key] = finalValue;

    const updated = JSON.stringify(current);
    db.run('UPDATE subscriptions SET settings_json = ? WHERE client_id = ?', [updated, clientId], function(updateErr) {
      if (updateErr) {
        console.error('/api/save-platform-setting UPDATE err:', updateErr.message);
        return res.status(500).json({ error: 'DB update error', detail: updateErr.message });
      }
      return res.json({ success: true, message: 'Setting updated' });
    });
  });
});

// --- 履歴取得 ---
app.get('/api/history', (req, res) => {
  const clientId = req.query.clientId;
  const limit = Math.max(1, parseInt(req.query.limit, 10) || 10);
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);

  db.get('SELECT COUNT(*) AS cnt FROM notifications', [], (countErr, countRow) => {
    if (countErr) {
      console.error('/api/history COUNT err:', countErr.message);
      return res.status(500).json({ error: 'DB error', detail: countErr.message });
    }

    const total = countRow ? countRow.cnt : 0;
    
    // platform と status カラムの存在チェック
    db.all("PRAGMA table_info(notifications)", [], (pragmaErr, columns) => {
      if (pragmaErr) {
        console.error('/api/history PRAGMA err:', pragmaErr.message);
        return res.status(500).json({ error: 'DB error', detail: pragmaErr.message });
      }

      const hasPlatform = columns.some(col => col.name === 'platform');
      const hasStatus = columns.some(col => col.name === 'status');

      let selectFields = 'id, title, body, url, icon, strftime(\'%s\', created_at) AS timestamp';
      if (hasPlatform) selectFields += ', platform';
      if (hasStatus) selectFields += ', status';

      const sql = `SELECT ${selectFields} FROM notifications ORDER BY created_at DESC LIMIT ? OFFSET ?`;

      db.all(sql, [limit, offset], (err, rows) => {
        if (err) {
          console.error('/api/history SELECT err:', err.message);
          return res.status(500).json({ error: 'DB error', detail: err.message });
        }

        const hasMore = offset + rows.length < total;
        const logs = rows.map(r => ({
          id: r.id,
          title: r.title,
          body: r.body,
          url: r.url,
          icon: r.icon,
          platform: r.platform || '不明',
          status: r.status || 'success',
          timestamp: parseInt(r.timestamp, 10)
        }));

        return res.json({ logs, total, hasMore });
      });
    });
  });
});

// --- テスト通知 ---
app.post('/api/send-test', (req, res) => {
  const clientId = req.body.clientId;
  if (!clientId) return res.status(400).json({ error: 'clientId required' });

  db.get('SELECT subscription_json FROM subscriptions WHERE client_id = ?', [clientId], async (err, row) => {
    if (err) {
      console.error('/api/send-test SELECT err:', err.message);
      return res.status(500).json({ error: 'DB error', detail: err.message });
    }
    if (!row) return res.status(404).json({ error: 'Subscription not found' });

    try {
      const subscription = JSON.parse(row.subscription_json);
      const payload = {
        title: 'テスト通知',
        body: '通知の設定が正しく機能しています！',
        url: 'https://elza.poitou-mora.ts.net/pushweb/test/',
        icon: `${req.protocol}://${req.get('host')}/pushweb/icon.ico`
      };

      const sent = await sendPushNotification(subscription, payload, db, true);

      // テスト通知は履歴に保存しない（コメントアウト）
      // db.run(
      //   'INSERT INTO notifications (title, body, url, icon, platform, status) VALUES (?, ?, ?, ?, ?, ?)',
      //   [payload.title, payload.body, payload.url, payload.icon, 'test', sent ? 'success' : 'fail']
      // );

      return res.json({ success: sent });
    } catch (e) {
      console.error('/api/send-test error:', e.message);
      return res.status(500).json({ error: 'Send error', detail: e.message });
    }
  });
});

// 重複通知防止用キャッシュ（メモリ上）
const recentNotifications = new Map(); // key: hash, value: timestamp
const DUPLICATE_WINDOW_MS = 60 * 1000; // 60秒以内の重複を防ぐ

// 通知のハッシュを生成
function getNotificationHash(data, settingKey) {
  return `${settingKey || 'unknown'}:${data.url || ''}:${data.title || ''}`;
}

// --- 通知受信（外部サービスから） ---
app.post('/api/notify', (req, res) => {
  const { data, type, settingKey } = req.body;
  if (!data || !type) return res.status(400).json({ error: 'Missing data or type' });

  console.log('[/api/notify] 通知リクエスト受信:', { title: data.title, settingKey });

  // 重複チェック
  const notificationHash = getNotificationHash(data, settingKey);
  const now = Date.now();
  const lastSent = recentNotifications.get(notificationHash);

  if (lastSent && (now - lastSent) < DUPLICATE_WINDOW_MS) {
    const timeSinceLastSent = Math.round((now - lastSent) / 1000);
    console.log(`[/api/notify] ⚠️  重複通知を検出: ${notificationHash} (${timeSinceLastSent}秒前に送信済み)`);
    return res.json({ success: true, message: 'Duplicate notification ignored', duplicate: true });
  }

  // 重複キャッシュに追加
  recentNotifications.set(notificationHash, now);
  console.log(`[/api/notify] ✅ 新規通知として処理: ${notificationHash}`);

  // 古いキャッシュをクリーンアップ（メモリリーク防止）
  if (recentNotifications.size > 1000) {
    const cutoff = now - DUPLICATE_WINDOW_MS;
    for (const [hash, timestamp] of recentNotifications.entries()) {
      if (timestamp < cutoff) {
        recentNotifications.delete(hash);
      }
    }
  }

  db.run(
    'INSERT INTO notifications (title, body, url, icon, platform, status) VALUES (?, ?, ?, ?, ?, ?)',
    [data.title, data.body, data.url, data.icon, settingKey || type, 'success'],
    function(insertErr) {
      if (insertErr) {
        console.error('[/api/notify] 履歴保存エラー:', insertErr.message);
      } else {
        console.log('[/api/notify] 履歴保存成功 (ID:', this.lastID, ')');
      }
    }
  );

  db.all('SELECT client_id, subscription_json, settings_json FROM subscriptions', [], async (err, rows) => {
    if (err) {
      console.error('/api/notify SELECT err:', err.message);
      return res.status(500).json({ error: 'DB error', detail: err.message });
    }

    console.log(`[/api/notify] 購読者数: ${rows.length}人`);

    let sentCount = 0;
    for (const row of rows) {
      try {
        const subscription = JSON.parse(row.subscription_json);
        const settings = row.settings_json ? JSON.parse(row.settings_json) : {};

        console.log(`[/api/notify] クライアント: ${row.client_id}, 設定:`, settings);

        let shouldSend = true;
        if (settingKey && settings[settingKey] === false) {
          shouldSend = false;
          console.log(`[/api/notify] ❌ ${row.client_id}: ${settingKey} がOFFのためスキップ`);
        }

        if (shouldSend) {
          console.log(`[/api/notify] ✅ ${row.client_id}: 通知送信中...`);
          const sent = await sendPushNotification(subscription, data, db, false);
          if (sent) {
            sentCount++;
            console.log(`[/api/notify] ✅ ${row.client_id}: 送信成功`);
          } else {
            console.log(`[/api/notify] ❌ ${row.client_id}: 送信失敗`);
          }
        }
      } catch (e) {
        console.error(`[/api/notify] row error (client: ${row.client_id}):`, e.message);
      }
    }

    console.log(`[/api/notify] 完了: ${sentCount}/${rows.length}人に送信`);
    return res.json({ success: true, message: `Notification sent to ${sentCount} clients` });
  });
});

// --- 管理用: 購読リスト ---
app.get('/api/subscriptions', (req, res) => {
  db.all('SELECT id, client_id, endpoint, created_at FROM subscriptions ORDER BY created_at DESC', [], (err, rows) => {
    if (err) {
      console.error('/api/subscriptions SELECT err:', err.message);
      return res.status(500).json({ error: 'DB error', detail: err.message });
    }
    return res.json(rows);
  });
});

// --- VAPID 公開鍵 ---
app.get('/api/vapidPublicKey', (req, res) => {
  return res.send(vapidConfig.vapidPublicKey);
});

// --- TwitCasting 認証 ---
app.get('/api/twicas/auth', (req, res) => {
  const authUrl = twitcasting.getAuthUrl();
  console.log('TwitCasting Auth redirect:', authUrl);
  return res.redirect(authUrl);
});

app.get(twitcasting.CALLBACK_PATH, async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('Code missing');

  const token = await twitcasting.exchangeCodeForToken(code);
  if (token) {
    await twitcasting.subscribeToWebhook();
    return res.send('<h1>TwitCasting 認証成功</h1><p>完了しました。</p>');
  } else {
    return res.status(500).send('Auth failed');
  }
});


// マイルストーン通知スケジューラー起動
if (vapidConfig.vapidPublicKey !== 'test-key') {
  milestoneScheduler = new MilestoneScheduler(dbPath, vapidConfig);
  milestoneScheduler.start();
} else {
  console.log('⚠️  VAPID未設定のためマイルストーン通知は無効');
}

// 管理者ログイン
app.post('/api/admin/login', adminAuth.login);

// 管理者ログアウト
app.post('/api/admin/logout', adminAuth.logout);

// トークン検証
app.get('/api/admin/verify', adminAuth.requireAuth, (req, res) => {
  res.json({ success: true, user: req.adminUser });
});

// 管理者通知送信（認証必須）
app.post('/api/admin/notify', adminAuth.requireAuth, async (req, res) => {
  const { data, type, settingKey } = req.body;
  if (!data || !type) return res.status(400).json({ error: 'Missing data or type' });

  console.log(`[Admin Notification] ${req.adminUser} から通知送信:`, data.title);

  // 重複チェック
  const notificationHash = getNotificationHash(data, settingKey);
  const now = Date.now();
  const lastSent = recentNotifications.get(notificationHash);

  if (lastSent && (now - lastSent) < DUPLICATE_WINDOW_MS) {
    const timeSinceLastSent = Math.round((now - lastSent) / 1000);
    console.log(`[Admin Notification] ⚠️  重複通知を検出: ${notificationHash} (${timeSinceLastSent}秒前に送信済み)`);
    return res.json({ success: true, message: 'Duplicate notification ignored', duplicate: true });
  }

  // 重複キャッシュに追加
  recentNotifications.set(notificationHash, now);
  console.log(`[Admin Notification] ✅ 新規通知として処理: ${notificationHash}`);

  // 履歴に保存
  db.run(
    'INSERT INTO notifications (title, body, url, icon, platform, status) VALUES (?, ?, ?, ?, ?, ?)',
    [data.title, data.body, data.url, data.icon, 'admin', 'success'],
    function(insertErr) {
      if (insertErr) {
        console.error('[Admin Notification] 履歴保存エラー:', insertErr.message);
      } else {
        console.log('[Admin Notification] 履歴保存成功 (ID:', this.lastID, ')');
      }
    }
  );

  // 全購読者に送信
  db.all('SELECT client_id, subscription_json, settings_json FROM subscriptions', [], async (err, rows) => {
    if (err) {
      console.error('[Admin Notification] SELECT err:', err.message);
      return res.status(500).json({ error: 'DB error', detail: err.message });
    }

    console.log(`[Admin Notification] 購読者数: ${rows.length}人`);

    let sentCount = 0;
    for (const row of rows) {
      try {
        const subscription = JSON.parse(row.subscription_json);
        const sent = await sendPushNotification(subscription, data, db, false);
        if (sent) {
          sentCount++;
          console.log(`[Admin Notification] ✅ ${row.client_id}: 送信成功`);
        } else {
          console.log(`[Admin Notification] ❌ ${row.client_id}: 送信失敗`);
        }
      } catch (e) {
        console.error(`[Admin Notification] row error (client: ${row.client_id}):`, e.message);
      }
    }

    console.log(`[Admin Notification] 完了: ${sentCount}/${rows.length}人に送信`);
    return res.json({ success: true, message: `Notification sent to ${sentCount} clients` });
  });
});

// パスワードハッシュ生成ツール（開発用 - 本番では削除推奨）
app.get('/api/admin/generate-hash', (req, res) => {
  const password = req.query.password;
  if (!password) {
    return res.status(400).json({ error: 'password query parameter required' });
  }
  const hash = adminAuth.generatePasswordHash(password);
  res.json({ password, hash });
});


// --- 起動 ---
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});