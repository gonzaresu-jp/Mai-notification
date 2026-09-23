const os = require("os");

const cpu = require("../services/system-cpu");
const adminAuth = require("../lib/admin");

function register(app) {
  // CPU/メモリ等の機密情報を返すため管理者専用。公開ステータスページは 403 時は表示を省略する。
  app.get("/api/system-info", adminAuth.requireAuth, (req, res) => {
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
