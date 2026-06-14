const os = require("os");

const cpu = require("../services/system-cpu");

function register(app) {
  app.get("/api/system-info", (req, res) => {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const mem = process.memoryUsage();
    const loadavg = os.loadavg();
    const cpuCount = os.cpus().length;
    res.json({
      cpu: { usagePercent: cpu.getCpuUsage(), count: cpuCount, model: os.cpus()[0]?.model || "Unknown", loadavg: { "1m": Math.round(loadavg[0] * 100) / 100, "5m": Math.round(loadavg[1] * 100) / 100, "15m": Math.round(loadavg[2] * 100) / 100 } },
      memory: { total: totalMem, free: freeMem, used: usedMem, usagePercent: Math.round((usedMem / totalMem) * 100) },
      process: { rss: mem.rss, heapUsed: mem.heapUsed, heapTotal: mem.heapTotal, uptimeSec: Math.floor(process.uptime()) },
      os: { platform: os.platform(), uptimeSec: Math.floor(os.uptime()), hostname: os.hostname() },
    });
  });
}

module.exports = { register };
