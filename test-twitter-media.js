// test-twitter-media.js (本番完全同期テスト版)
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const { getSharedBrowser } = require('./browser');
const twitterMediaSaver = require('./twitter-media-saver');

// 【本番設定】保存先とプロファイル
const MEDIA_ROOT = '/mnt/hs-ssd/twitter-mai';
const PROFILE_PATH = '/var/lib/mai-push/puppeteer-profile';

// 環境変数を本番パスに設定
process.env.TWITTER_MEDIA_DIR = MEDIA_ROOT;

async function test() {
  console.log('=== Twitter メディア保存 本番設定テスト ===\n');
  console.log(`保存先: ${MEDIA_ROOT}`);
  console.log(`プロファイル: ${PROFILE_PATH}\n`);
  
  const db = new sqlite3.Database(path.join(__dirname, 'data.db'));
  twitterMediaSaver.initMediaDb(db);

  console.log('🌐 ブラウザを起動中... (※他で起動中の場合はエラーになります)');
  let browser;
  try {
    browser = await getSharedBrowser({
      product: 'firefox',
      headless: true,
      userDataDir: PROFILE_PATH
    });
  } catch (e) {
    console.error('❌ ブラウザ起動失敗:', e.message);
    console.log('他のプロセス（main.jsなど）を停止してから再度実行してください。');
    db.close();
    return;
  }

  const page = await browser.newPage();
  const username = 'koinoya_mai';
  console.log(`\n📱 @${username} の最新ツイートをスキャン中...`);

  try {
    // 3回リトライ
    let success = false;
    for (let i = 0; i < 3; i++) {
      try {
        await page.goto(`https://x.com/${username}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        success = true;
        break;
      } catch (e) {
        console.warn(`   ⚠️ 試行 ${i+1} 失敗: ${e.message}`);
        await new Promise(r => setTimeout(r, 3000));
      }
    }
    if (!success) throw new Error('ページ読み込みに失敗しました。');

    await new Promise(r => setTimeout(r, 10000));

    // 最新5件を取得
    const tweets = await page.evaluate(() => {
      const articles = Array.from(document.querySelectorAll('article')).slice(0, 5);
      return articles.map(article => {
        const link = article.querySelector('a[href*="/status/"]');
        const id = link ? link.getAttribute('href').split('/').filter(Boolean).pop() : null;
        const timeEl = article.querySelector('time');
        const datetime = timeEl ? timeEl.getAttribute('datetime') : null;
        const images = Array.from(article.querySelectorAll('img'))
          .map(img => img.src)
          .filter(src => src.includes('pbs.twimg.com/media/'));
        const hasVideo = !!article.querySelector('[data-testid="videoPlayer"]') || !!article.querySelector('video');
        const textEl = article.querySelector('div[lang]') || article;
        const text = textEl ? textEl.innerText : '';
        return { id, media_urls: images, hasVideo, isRepost: false, datetime, text };
      }).filter(t => t.id);
    });

    console.log(`✅ ${tweets.length} 件を検出しました。`);

    for (const t of tweets) {
      // 日時が取れなかった場合のID逆算ロジック
      if (!t.datetime && t.id) {
        const timestampMs = (BigInt(t.id) >> 22n) + 1288834974657n;
        t.datetime = new Date(Number(timestampMs)).toISOString();
      }
      
      console.log(`\n[Tweet ${t.id}] 日時: ${t.datetime}`);
      // 本番テストなので実際に保存
      await twitterMediaSaver.saveMediaForTweet(t, username);
    }

  } catch (err) {
    console.error('❌ エラー:', err.message);
  } finally {
    if (page) await page.close();
    db.close();
    console.log('\n=== テスト完了 ===');
  }
}

test();
