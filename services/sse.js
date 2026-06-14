const ctx = require("./context");

function sendSseEvent(payload, eventName = "message") {
  const lines = [];
  if (eventName && eventName !== "message") lines.push(`event: ${eventName}`);
  lines.push(`data: ${JSON.stringify(payload)}`);
  const msg = lines.join("\n") + "\n\n";
  for (const res of Array.from(ctx.sseClients)) {
    try { res.write(msg); } catch (e) {
      try { res.end(); } catch (_) {}
      ctx.sseClients.delete(res);
    }
  }
}

const SSE_PING_INTERVAL_MS = 25_000;
setInterval(() => {
  for (const res of Array.from(ctx.sseClients)) {
    try { res.write(": ping\n\n"); } catch (e) {
      try { res.end(); } catch (_) {}
      ctx.sseClients.delete(res);
    }
  }
}, SSE_PING_INTERVAL_MS);

module.exports = { sendSseEvent };
