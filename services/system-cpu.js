const os = require("os");

let _cpuPrev = null;
let _cpuUsagePercent = 0;

function getCpuTimes() {
  const cpus = os.cpus();
  let user = 0, nice = 0, sys = 0, idle = 0, irq = 0;
  for (const cpu of cpus) {
    user += cpu.times.user; nice += cpu.times.nice; sys += cpu.times.sys;
    idle += cpu.times.idle; irq += cpu.times.irq;
  }
  return { user, nice, sys, idle, irq, total: user + nice + sys + idle + irq };
}

function getCpuUsage() { return _cpuUsagePercent; }

_cpuPrev = getCpuTimes();
setInterval(() => {
  const cur = getCpuTimes();
  const prevTotal = _cpuPrev.total;
  const curTotal = cur.total;
  const totalDiff = curTotal - prevTotal;
  const idleDiff = cur.idle - _cpuPrev.idle;
  _cpuUsagePercent = totalDiff > 0 ? Math.round((1 - idleDiff / totalDiff) * 100) : 0;
  _cpuPrev = cur;
}, 5000);

module.exports = { getCpuUsage };
