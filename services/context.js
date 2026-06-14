const path = require("path");

const context = {
  app: null,
  db: null,
  dbPath: path.join(__dirname, "..", "data.db"),
  sseClients: new Set(),
  recentNotifications: new Map(),
  DUPLICATE_WINDOW_MS: 60 * 1000,
  vapidConfig: {},
  fcmMessaging: null,
  fcmInitAttempted: false,
  ADMIN_NOTIFY_TOKEN: process.env.ADMIN_NOTIFY_TOKEN || null,
  NOTIFY_HMAC_SECRET: process.env.NOTIFY_HMAC_SECRET || null,
  LOCAL_API_TOKEN: process.env.ADMIN_NOTIFY_TOKEN || process.env.LOCAL_API_TOKEN || null,
  DEFAULT_PLATFORM_SETTINGS: Object.freeze({
    twitcasting: true,
    youtube: true,
    youtubeCommunity: true,
    fanbox: true,
    twitterMain: true,
    twitterSub: true,
    milestone: true,
    schedule: true,
    gipt: true,
    twitch: true,
    bilibili: false,
    customLinks: {},
  }),
  HISTORY_JSON_PATH: path.join(__dirname, "..", "webui", "history.json"),
  HISTORY_JSON_LIMIT: 50,
  HISTORY_JSON_DEBOUNCE_MS: 5000,
  _cpuUsagePercent: 0,
  _cpuPrev: null,
  milestoneScheduler: null,
};

module.exports = context;
