const os = require("os");

const cpu = require("../services/system-cpu");

function register(app) {
  // 公開ステータスページ用。返すのは使用率・loadavg・稼働時間・メモリ/プロセス使用量のみ。
  // ホスト名・ディスク・OS詳細・ネットワーク等は返さない（情報漏えい対策）。
  app.get("/api/system-info", (req, res) => {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const mem = process.memoryUsage();
    const loadavg = os.loadavg();
    const cpuCount = os.cpus().length;
    res.json({
      cpu: { usagePercent: cpu.getCpuUsage(), count: cpuCount, loadavg: { "1m": Math.round(loadavg[0] * 100) / 100, "5m": Math.round(loadavg[1] * 100) / 100, "15m": Math.round(loadavg[2] * 100) / 100 } },
      memory: { total: totalMem, free: freeMem, used: usedMem, usagePercent: Math.round((usedMem / totalMem) * 100) },
      process: { rss: mem.rss, heapUsed: mem.heapUsed, heapTotal: mem.heapTotal, uptimeSec: Math.floor(process.uptime()) },
      os: { uptimeSec: Math.floor(os.uptime()) },
    });
  });
}

module.exports = { register };
