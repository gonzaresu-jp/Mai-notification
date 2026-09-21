#!/usr/bin/env node
/**
 * sqlite3@6 昇格前の回帰テスト（SECURITY_HANDOFF / AGENTS.md 手順に基づく）
 *
 * 使い方:
 *   node scripts/regression-test.js [--port 18099]
 *
 * やること:
 *   - 一時DBを自動生成して server.js を子プロセス起動（DISABLE_NOTIFICATIONS=1 / NODE_ENV=development）
 *   - /api/health, /api/notify の認証(401/401/HMAC/suppressed), 内部scraper-status認証,
 *     /auth/token-exchange 無効code 400, SSE接続上限, sqlite3 の INSERT/SELECT/lastID を検証
 *   - 終了時に一時DBを削除
 *
 * 注意: 本番(8080)では実行しない。staging(8081)側の作業ツリー、またはローカルで実行すること。
 *       実pushは DISABLE_NOTIFICATIONS=1 で完全抑止される（suppressed:true を検証）。
 */
"use strict";

const { spawn } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const sqlite3 = require("sqlite3");

const args = process.argv.slice(2);
const portIdx = args.indexOf("--port");
const PORT = portIdx >= 0 ? Number(args[portIdx + 1]) || 18099 : 18099;
const BASE = `http://127.0.0.1:${PORT}`;

const TOKEN = "regression-test-token-" + crypto.randomBytes(8).toString("hex");
const HMAC_SECRET = "regression-test-hmac-" + crypto.randomBytes(8).toString("hex");
const DB_NAME = `regression-test-${Date.now()}.db`;

let passed = 0;
let failed = 0;

function ok(name, cond, detail) {
  if (cond) {
    passed++;
    console.log(`  PASS ${name}`);
  } else {
    failed++;
    console.error(`  FAIL ${name}${detail ? " — " + detail : ""}`);
  }
}

function hmacOf(bodyString) {
  return crypto.createHmac("sha256", HMAC_SECRET).update(bodyString).digest("hex");
}

function request(method, urlPath, { headers = {}, body = null, timeoutMs = 10000 } = {}) {
  return new Promise((resolve, reject) => {
    const data = body == null ? null : Buffer.from(typeof body === "string" ? body : JSON.stringify(body));
    const req = http.request(
      `${BASE}${urlPath}`,
      {
        method,
        headers: {
          ...(data ? { "Content-Type": "application/json", "Content-Length": data.length } : {}),
          ...headers,
        },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = JSON.parse(raw); } catch (_) {}
          resolve({ status: res.statusCode, headers: res.headers, raw, json });
        });
      }
    );
    req.on("timeout", () => { req.destroy(new Error("client timeout")); });
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

function openSse() {
  return new Promise((resolve, reject) => {
    const req = http.get(`${BASE}/api/events/stream`, { headers: { Accept: "text/event-stream" } }, (res) => {
      resolve({ req, res, status: res.statusCode, headers: res.headers });
    });
    req.on("error", reject);
  });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (e, r) => (e ? reject(e) : resolve(r))));
}
function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, function (e) { e ? reject(e) : resolve(this); }));
}

async function waitForHealth(child) {
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error("server exited early: code=" + child.exitCode);
    try {
      const r = await request("GET", "/api/health", { timeoutMs: 1500 });
      if (r.status === 200) return r;
    } catch (_) {}
    await sleep(200);
  }
  throw new Error("server did not become healthy");
}

async function main() {
  const projectDir = path.resolve(__dirname, "..");
  const dbPath = path.join(projectDir, DB_NAME);
  for (const suffix of ["", "-wal", "-shm"]) {
    try { fs.unlinkSync(dbPath + suffix); } catch (_) {}
  }

  const child = spawn(process.execPath, [path.join(projectDir, "server.js")], {
    cwd: projectDir,
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: "development",
      DISABLE_NOTIFICATIONS: "1",
      DB_FILE_NAME: DB_NAME,
      NOTIFY_API_TOKEN: TOKEN,
      NOTIFY_HMAC_SECRET: HMAC_SECRET,
      SSE_MAX_PER_CLIENT: "5",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const serverLog = [];
  child.stdout.on("data", (d) => serverLog.push(d.toString()));
  child.stderr.on("data", (d) => serverLog.push(d.toString()));

  let sseHandles = [];
  try {
    // --- 1. 起動と /api/health ---
    console.log("[1] /api/health");
    const health = await waitForHealth(child);
    ok("health 200 + status:ok", health.status === 200 && health.json && health.json.status === "ok");

    // --- 2. /api/notify 認証経路 ---
    console.log("[2] /api/notify auth");
    const body = JSON.stringify({ type: "live", settingKey: "twitcasting", data: { title: "回帰テスト", body: " suppressed 期待" } });
    const noToken = await request("POST", "/api/notify", { body });
    ok("tokenなし -> 401", noToken.status === 401, `got ${noToken.status}`);
    const noHmac = await request("POST", "/api/notify", { body, headers: { "x-notify-token": TOKEN } });
    ok("HMACなし -> 401", noHmac.status === 401, `got ${noHmac.status}`);
    const badHmac = await request("POST", "/api/notify", {
      body, headers: { "x-notify-token": TOKEN, "x-notify-hmac": "0".repeat(64) },
    });
    ok("誤HMAC -> 401", badHmac.status === 401, `got ${badHmac.status}`);
    const good = await request("POST", "/api/notify", {
      body, headers: { "x-notify-token": TOKEN, "x-notify-hmac": hmacOf(body) },
    });
    ok("完全認証 -> 200 & suppressed:true (DISABLE_NOTIFICATIONS)", good.status === 200 && good.json && good.json.suppressed === true, `got ${good.status} ${good.raw.slice(0, 120)}`);

    // --- 3. 内部 scraper-status 認証（NOTIFY_API_TOKEN 統一） ---
    console.log("[3] /api/internal/scraper-status");
    const sNoToken = await request("POST", "/api/internal/scraper-status", { body: JSON.stringify({ id: "reg-test", name: "reg", status: "success" }) });
    ok("tokenなし -> 401", sNoToken.status === 401, `got ${sNoToken.status}`);
    const sBad = await request("POST", "/api/internal/scraper-status", { body: JSON.stringify({ id: "reg-test" }), headers: { "x-notify-token": "wrong" } });
    ok("誤token -> 401", sBad.status === 401, `got ${sBad.status}`);
    const sOk = await request("POST", "/api/internal/scraper-status", { body: JSON.stringify({ id: "reg-test", name: "reg", status: "success", message: "ok" }), headers: { "x-notify-token": TOKEN } });
    ok("正token -> 200", sOk.status === 200, `got ${sOk.status} ${sOk.raw.slice(0, 120)}`);
    const sList = await request("GET", "/api/scraper-status");
    ok("scraper-status に反映", sList.status === 200 && JSON.stringify(sList.json && sList.json.items || []).includes("reg-test"));

    // --- 4. OAuth: token-exchange 無効code ---
    console.log("[4] /auth/token-exchange");
    const badCode = await request("POST", "/auth/token-exchange", { body: JSON.stringify({ code: "definitely-invalid-code" }) });
    ok("無効code -> 400", badCode.status === 400, `got ${badCode.status}`);
    const noCode = await request("POST", "/auth/token-exchange", { body: JSON.stringify({}) });
    ok("codeなし -> 400", noCode.status === 400, `got ${noCode.status}`);

    // --- 5. SSE 保護（同一クライアント上限・event-stream 応答） ---
    console.log("[5] SSE");
    const first = await openSse();
    ok("SSE 200 + text/event-stream", first.status === 200 && String(first.headers["content-type"] || "").startsWith("text/event-stream"));
    sseHandles.push(first);
    for (let i = 0; i < 4; i++) sseHandles.push(await openSse());
    await sleep(300);
    const sixth = await openSse();
    ok("同一クライアント 6接続目 -> 429", sixth.status === 429, `got ${sixth.status}`);
    sixth.res.destroy();
    // 1接続閉じれば再び受け入れられる
    sseHandles[0].res.destroy();
    sseHandles = sseHandles.slice(1);
    await sleep(500);
    const reopen = await openSse();
    ok("切断後の再接続 -> 200", reopen.status === 200, `got ${reopen.status}`);
    sseHandles.push(reopen);

    // --- 6. sqlite3 ドライバ直叩き（昇格時の主要回帰ポイント） ---
    console.log("[6] sqlite3 INSERT/SELECT/lastID");
    const db = new sqlite3.Database(dbPath);
    const ins1 = await dbRun(db, "INSERT INTO notifications (title, body, url, platform, status) VALUES (?, ?, ?, ?, ?)", ["t1", "b1", "https://example.com", "test", "success"]);
    ok("notifications lastID", Number.isInteger(ins1.lastID) && ins1.lastID > 0, `lastID=${ins1.lastID}`);
    await dbRun(db, "INSERT INTO notifications (title, body, platform, status) VALUES (?, ?, ?, ?)", ["t2", "b2", "test", "success"]);
    const rows = await dbAll(db, "SELECT id, title FROM notifications ORDER BY id");
    ok("notifications SELECT", rows.length === 2 && rows[0].title === "t1" && rows[1].title === "t2");
    const ins2 = await dbRun(db, "INSERT INTO subscriptions (client_id, subscription_json, settings_json) VALUES (?, ?, ?)", ["reg-client-1", JSON.stringify({ endpoint: "https://example/push" }), "{}"]);
    ok("subscriptions lastID", Number.isInteger(ins2.lastID) && ins2.lastID > 0, `lastID=${ins2.lastID}`);
    const subs = await dbAll(db, "SELECT client_id, subscription_json FROM subscriptions WHERE client_id = ?", ["reg-client-1"]);
    ok("subscriptions SELECT + JSON roundtrip", subs.length === 1 && JSON.parse(subs[0].subscription_json).endpoint === "https://example/push");
    await dbRun(db, "INSERT INTO scraper_status (id, name, status, message, last_run, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status = excluded.status", ["reg-scraper", "reg", "success", "ok", new Date().toISOString(), new Date().toISOString()]);
    const scraper = await dbAll(db, "SELECT * FROM scraper_status WHERE id = ?", ["reg-scraper"]);
    ok("scraper_status UPSERT + SELECT", scraper.length === 1 && scraper[0].status === "success");
    db.close();

    console.log(`\n結果: ${passed} passed, ${failed} failed`);
  } catch (e) {
    failed++;
    console.error("\n[regression-test] 例外:", e && e.message ? e.message : e);
  } finally {
    for (const h of sseHandles) { try { h.res.destroy(); } catch (_) {} }
    child.kill("SIGTERM");
    await sleep(300);
    if (child.exitCode === null) child.kill("SIGKILL");
    for (const suffix of ["", "-wal", "-shm"]) {
      try { fs.unlinkSync(dbPath + suffix); } catch (_) {}
    }
    if (failed > 0) {
      console.error("\n--- server log (tail) ---");
      console.error(serverLog.join("").split("\n").slice(-40).join("\n"));
    }
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
