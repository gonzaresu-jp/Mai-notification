require("dotenv").config();
// 日時の getHours/getDay や naive 文字列の new Date() 解釈を JST に固定する
// （イベントの曜日配置・時刻表示のタイムゾーンずれ防止）
process.env.TZ = process.env.TZ || "Asia/Tokyo";
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = require("express-rate-limit");
const helmet = require("helmet");
const discordAlert = require("./discord-alert");
const MilestoneScheduler = require("./milestone");
const ctx = require("./services/context");
const { initDatabase } = require("./services/database");
const { loadVapid } = require("./services/notification");
const { startPeriodicTasks } = require("./services/scheduler");
const { updateSchedule } = require("./weekly");

const app = express();
ctx.app = app;
app.set("trust proxy", 1);

const dbPath = path.join(__dirname, "data.db");
const db = new sqlite3.Database(dbPath);
ctx.db = db;

discordAlert.attachGlobalCrashHandlers();

updateSchedule().catch(console.error);
setInterval(() => { updateSchedule().catch(console.error); }, 5 * 60 * 1000);

// --- DB Schema ---
initDatabase();

// --- VAPID ---
loadVapid();

// --- Rate Limiters ---
const authLimiter = rateLimit({ windowMs: 60 * 1000, max: 20, keyGenerator: (req) => ipKeyGenerator(req), standardHeaders: true, legacyHeaders: false });
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 150, standardHeaders: true, legacyHeaders: false, validate: { trustProxy: false }, message: { error: "Too many API requests, please try again later." } });
// --- notifyLimiter defined in routes/notify.js ---

// --- Middleware ---
app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.use("/pushweb", express.static(path.join(__dirname, "pushweb")));
app.use("/admin", express.static(path.join(__dirname, "admin")));
app.use(helmet({
  contentSecurityPolicy: { directives: { "default-src": ["'self'"], "script-src": ["'self'", "https://static.cloudflareinsights.com"], "style-src": ["'self'", "'unsafe-inline'"], "img-src": ["'self'", "data:", "https:"], "connect-src": ["'self'", "https:"], "font-src": ["'self'"], "frame-ancestors": ["'self'"], "form-action": ["'self'"], "base-uri": ["'self'"], "object-src": ["'none'"] } },
  strictTransportSecurity: { maxAge: 63072000, includeSubDomains: true },
  xFrameOptions: { action: "deny" },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
}));
app.use("/webui", express.static(path.join(__dirname, "webui")));

// --- CSRF Protection ---
app.use("/api/", (req, res, next) => {
  if (["POST", "PUT", "DELETE", "PATCH"].includes(req.method)) {
    const origin = req.headers.origin;
    const referer = req.headers.referer;
    const allowedOrigin = process.env.PUBLIC_URL || req.protocol + "://" + req.get("host");
    if (origin && !origin.startsWith(allowedOrigin)) return res.status(403).json({ error: "CSRF token mismatch or unauthorized origin" });
    if (!origin && referer && !referer.startsWith(allowedOrigin)) return res.status(403).json({ error: "CSRF token mismatch or unauthorized referer" });
  }
  next();
});

app.use("/api/", apiLimiter);

// --- SSE endpoint (must be before /api/events/:id) ---
app.get("/api/events/stream", (req, res) => {
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive", "Access-Control-Allow-Origin": "*" });
  res.write(": connected\n\n");
  ctx.sseClients.add(res);
  req.on("close", () => { ctx.sseClients.delete(res); try { res.end(); } catch {} });
});

// --- User routes (existing module) ---
const userRoutes = require("./user-routes");
userRoutes.register(app, db, authLimiter);

// --- All other route modules ---
require("./routes/subscriptions").register(app, db);
require("./routes/android").register(app, db);
require("./routes/events").register(app, db);
require("./routes/admin").register(app, db);
require("./routes/scraper-status").register(app, db);
require("./routes/system").register(app);
require("./routes/history").register(app, db);
require("./routes/notify").register(app, db);
require("./routes/twitter-media").register(app, db);
require("./routes/rag").register(app, db);
// --- Milestone Scheduler ---
if (ctx.vapidConfig.vapidPublicKey !== "test-key") {
  ctx.milestoneScheduler = new MilestoneScheduler(dbPath, ctx.vapidConfig);
  ctx.milestoneScheduler.start();
} else {
  console.log("Milestone notifications disabled (no VAPID)");
}

// --- Periodic Tasks ---
startPeriodicTasks();

// --- ベクトルDB同期（VECTOR_DB_URL / EMBEDDING_ENDPOINT 設定時のみ稼働） ---
require("./services/vector-sync").startVectorSync();

// --- System Monitor ---
discordAlert.startSystemMonitor();

// --- Test page (served from webui/test.php) ---
app.get(["/test", "/test/"], (req, res) => {
  const webuiDir = path.join(__dirname, "webui");
  const testPath = path.join(webuiDir, "test.php");
  const exists = fs.existsSync(testPath);
  if (!exists) return res.status(404).send("test.php not found");
  let html = fs.readFileSync(testPath, "utf-8");
  html = html.replace(/<\?php\s+include\s+__DIR__\s+\.\s+'([^']+)'\s*;?\s*\?>/g, (_, inc) => {
    try { return fs.readFileSync(path.join(webuiDir, inc), "utf-8"); } catch { return ""; }
  });
  html = html.replace(/<\?[\s\S]*?\?>/g, "");
  res.type("html").send(html);
});

// --- Health check ---
app.get("/api/health", (req, res) => {
  const mem = process.memoryUsage();
  res.json({
    status: "ok",
    uptime: process.uptime(),
    pid: process.pid,
    memory: {
      rss: Math.round(mem.rss / 1024 / 1024) + "MB",
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024) + "MB",
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024) + "MB",
    },
    port: Number(process.env.PORT || 8080),
    node: process.version,
  });
});

app.get("/api/health/live", (req, res) => {
  res.status(200).type("text/plain").send("ok");
});

app.get("/api/health/ready", (req, res) => {
  res.status(200).type("text/plain").send("ready");
});

// --- Start ---
const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`WebUI Server is running on port ${PORT}`);
});
