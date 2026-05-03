const { KeepLiveWS } = require('bilibili-live-ws');

let live = null;
let isLive = false;

function startBilibiliWatcher(config) {
  if (live) return;

  const roomId = Number(config.roomId);

  if (!roomId) {
    throw new Error('roomId invalid');
  }

  console.log('[bilibili] target roomId =', roomId); // ★ 可視化

  live = new KeepLiveWS(roomId);

  console.log('offline'); // 初期状態

  live.on('live', () => {
    if (!isLive) {
      isLive = true;
      console.log('livestart');
    }
  });

  live.on('preparing', () => {
    isLive = false;
  });

  live.on('error', console.error);
}

module.exports = { startBilibiliWatcher };


// ★ 直接実行用
if (require.main === module) {
  require('dotenv').config();

  startBilibiliWatcher({
    roomId: process.env.BILIBILI_ROOM_ID
  });
}