// ytcommunity.js - 単体完結版（抽出ロジック内蔵 + postUrl対応）
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

let notifyConfig = null;

function init(config) {
  notifyConfig = config || {};
}

// HTML から post 情報を抽出する関数
async function parseCommunity(htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const posts = [];

  const jsonRegex = /var ytInitialData = (\{.*?\});/s;
  const match = html.match(jsonRegex);
  if (!match) return posts;

  try {
    const data = JSON.parse(match[1]);
    const contents = data?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content
      ?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents;

    if (!contents) return posts;

    contents.forEach(item => {
      const postRenderer = item?.backstagePostThreadRenderer || item?.backstagePostRenderer;
      if (!postRenderer) return;

      const postId = postRenderer.post?.postId || postRenderer.postId;
      if (!postId) return;

      const author = postRenderer.authorText?.simpleText || 'Unknown';
      const content = postRenderer.contentText?.runs?.map(r => r.text).join('') || '';
      const publishedTime = postRenderer.publishedTimeText?.runs?.map(r => r.text).join('') || '';
      const postUrl = `https://www.youtube.com/post/${postId}`;

      posts.push({ postId, postUrl, author, content, publishedTime });
    });
  } catch (e) {
    console.error('parseCommunity JSON parse error:', e.message);
  }

  return posts;
}

// handle から直接 URL
async function startPolling(handle) {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const url = `https://www.youtube.com/${handle}/posts`;

  await page.goto(url, { waitUntil: 'networkidle2' });

  // スクロールしてすべての投稿をロード
  let previousHeight = 0;
  while (true) {
    const height = await page.evaluate('document.body.scrollHeight');
    if (height === previousHeight) break;
    previousHeight = height;
    await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
    await page.waitForTimeout(1000);
  }

  const postUrls = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a[href^="/post/"]'))
      .map(a => a.href)
      .filter((v, i, self) => self.indexOf(v) === i); // 重複排除
  });

  await browser.close();
  return postUrls;
}



module.exports = {
  init,
  startPolling,
  parseCommunity
};
