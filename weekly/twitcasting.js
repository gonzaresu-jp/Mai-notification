// platformFetch/twitcasting.js
const fetch = require('node-fetch');

async function fetchLatest() {
    const username = 'koinoya_mai';
    const url = `https://twitcasting.tv/${username}/movie`;

    // 実際には TwitCasting API を利用する方が正確ですが
    // ここではスクレイピングのサンプル
    const res = await fetch(url);
    const text = await res.text();

    // 仮: ここで HTML をパースして配信タイトルや開始時刻を抽出
    // TODO: 正確な取得方法に差し替え
    const events = []; // 空配列で返す

    return events;
}

module.exports = { fetchLatest };
