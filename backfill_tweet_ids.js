/**
 * 既存の通知履歴から tweet_id を抽出してバックフィルするスクリプト
 * URL (https://x.com/username/status/123456789) から tweet_id を抽出
 */
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.join(__dirname, "data.db");
const db = new sqlite3.Database(dbPath);

function extractTweetId(url) {
  if (!url) return null;
  // URL形式: https://x.com/{username}/status/{tweet_id}
  // または https://twitter.com/{username}/status/{tweet_id}
  const match = url.match(/\/status\/(\d+)/);
  return match ? match[1] : null;
}

db.all(
  `SELECT id, url FROM notifications WHERE tweet_id IS NULL AND url LIKE '%/status/%'`,
  [],
  (err, rows) => {
    if (err) {
      console.error("SELECT error:", err.message);
      db.close();
      return;
    }

    console.log(`対象レコード: ${rows.length}件`);

    let updated = 0;
    let skipped = 0;
    let remaining = rows.length;

    rows.forEach((row) => {
      const tweetId = extractTweetId(row.url);
      if (!tweetId) {
        console.log(`  SKIP id=${row.id}: URLからtweet_id抽出不可 (${row.url})`);
        skipped++;
        remaining--;
        if (remaining === 0) {
          console.log(`\n完了: ${updated}件更新, ${skipped}件スキップ`);
          db.close();
        }
        return;
      }

      db.run(
        "UPDATE notifications SET tweet_id = ? WHERE id = ?",
        [tweetId, row.id],
        function (updateErr) {
          if (updateErr) {
            console.error(`  ERROR id=${row.id}: ${updateErr.message}`);
          } else {
            updated++;
            console.log(`  OK id=${row.id} → tweet_id=${tweetId}`);
          }
          remaining--;
          if (remaining === 0) {
            console.log(`\n完了: ${updated}件更新, ${skipped}件スキップ`);
            db.close();
          }
        }
      );
    });

    if (rows.length === 0) {
      console.log("対象レコードなし（既に全てバックフィル済み）");
      db.close();
    }
  }
);
