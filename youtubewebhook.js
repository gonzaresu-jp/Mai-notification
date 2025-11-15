const express = require('express');
const bodyParser = require('body-parser');
const xml2js = require('xml2js');

const app = express();
app.use(bodyParser.text({ type: '*/*' }));

// 通知受け取りエンドポイント
app.post('/youtube-webhook', async (req, res) => {
  const xml = req.body;

  xml2js.parseString(xml, (err, result) => {
    if (err) {
      console.error("XML parse error:", err);
      return res.sendStatus(400);
    }

    const entries = result.feed.entry || [];
    entries.forEach(entry => {
      const videoId = entry['yt:videoId'][0];
      const title = entry.title[0];
      console.log("YouTube通知:", title, videoId);
    });
  });

  res.sendStatus(200);
});

// Hubからの購読確認
app.get('/youtube-webhook', (req, res) => {
  // サブスクライブ時にHubがGETで確認してくる
  const hubChallenge = req.query['hub.challenge'];
  res.send(hubChallenge);
});

app.listen(3001, '0.0.0.0', () => console.log("Webhook受信待ち on port 3000"));
