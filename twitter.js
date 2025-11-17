// twitter.js の check 関数を修正（0件取得時に再チェック）

// --- main check 関数（再チェック対応版） ---
async function check(username, isRetry = false) {
  const seenState = loadSeen();
  await copyCookieDb();
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: HEADLESS,
      product: 'firefox',
      args: ['--no-sandbox','--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    const cookies = await getCookies();
    if (cookies.length) {
      try { await page.setCookie(...cookies); } catch (e) { /* ignore cookie set errors */ }
    }

    if (!seenState[username]) seenState[username] = { ids: [], firstRun: true };

    const { newTweets, normalTweets, error } = await checkOneUser(page, username, seenState[username]);

    // --- 追加ログ: 取得できた最新のツイートを要約してログに残す ---
    try {
      if (Array.isArray(normalTweets) && normalTweets.length > 0) {
        const samples = normalTweets.slice(0, 2).map(summarizeTweetForLog);
        console.log(`[${username}] fetched ${normalTweets.length} tweets. latest: ${samples.join(' | ')}`);
      } else {
        console.log(`[${username}] fetched 0 tweets.`);
        
        // ✅ 0件取得かつ初回チェックの場合、5秒後に再チェック
        if (!isRetry) {
          console.log(`[${username}] ⚠️  0件取得のため5秒後に再チェックします...`);
          await browser.close();
          await new Promise(r => setTimeout(r, 5000));
          return await check(username, true); // 再帰呼び出し（再チェック）
        } else {
          console.log(`[${username}] ⚠️  再チェックでも0件でした。次の定期チェックまで待機します。`);
        }
      }
    } catch (e) {
      console.warn(`[${username}] failed to log fetched tweets:`, e && e.message ? e.message : e);
    }

    if (seenState[username].firstRun) {
      seenState[username].ids = normalTweets.map(t => t.id);
      seenState[username].firstRun = false;
      saveSeen(seenState);
      console.log(`[${username}] 初回実行: ${normalTweets.length}件を既読として記録`);
    } else if (newTweets.length > 0) {
      const idsToAdd = normalTweets.map(t => t.id);
      seenState[username].ids = Array.from(new Set([...idsToAdd, ...seenState[username].ids])).slice(0, 200);
      saveSeen(seenState);

      let settingKey = null;
      let sendText = true;

      const lowerUsername = username.toLowerCase();
      if (lowerUsername === 'koinoya_mai') {
          settingKey = 'twitterMain';
          sendText = true;
      } else if (lowerUsername === 'koinoyamai17') {
          settingKey = 'twitterSub';
          sendText = false;
      } else {
          settingKey = 'twitterMain';
          sendText = false;
      }

      console.log(`[${username}] 新着ツイート ${newTweets.length}件 (settingKey: ${settingKey})`);

      for (const t of newTweets.slice().reverse()) {
        console.log(`[${username}] 新しいツイート: ${summarizeTweetForLog(t)}`);
        await sendNotify(username, t, settingKey, sendText);
      }
    } else {
      if (Array.isArray(normalTweets) && normalTweets.length > 0) {
        console.log(`[${username}] 新着なし。直近取得: ${summarizeTweetForLog(normalTweets[0])}`);
      } else {
        console.log(`[${username}] 新着なし。取得ツイートなし`);
      }
    }

    return { username, newTweets, error };

  } catch (e) {
    console.error(`[${username}] check error:`, e.message);
    return { username, newTweets: [], error: e.message };
  } finally {
    if (browser) await browser.close();
  }
}