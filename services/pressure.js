// 気圧の予測（管理画面専用の表示用データ）
// Open-Meteo（無料・キー不要）で指定地点の予測気圧を取得し、直近24時間の低下幅から
// 片頭痛リスクの目安「低い / 注意 / 高い」を返す。
// ⚠️ 通知（push / 配信予定日レコメンド等）には絶対に接続しないこと（2026-10-07 指示）。
// 地点は .env の PRESSURE_LOCATION_NAME / PRESSURE_LATITUDE / PRESSURE_LONGITUDE で指定する。
// 未設定時は getPressureRisk() が null を返し、管理画面はカードを非表示にする（fail-safe）。
// 取得失敗時も呼び出し側で null が返る。

const TTL_MS = 30 * 60 * 1000;
const TIMEOUT_MS = 8000;

let cache = { at: 0, data: null };

function getLocation() {
  const name = process.env.PRESSURE_LOCATION_NAME;
  const latitude = parseFloat(process.env.PRESSURE_LATITUDE);
  const longitude = parseFloat(process.env.PRESSURE_LONGITUDE);
  if (!name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { name, latitude, longitude };
}

async function getPressureRisk() {
  const location = getLocation();
  if (!location) return null;
  if (cache.data && Date.now() - cache.at < TTL_MS) return cache.data;

  const url = "https://api.open-meteo.com/v1/forecast"
    + `?latitude=${location.latitude}&longitude=${location.longitude}`
    + "&hourly=surface_pressure&timezone=Asia%2FTokyo&forecast_days=3";

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`open-meteo HTTP ${r.status}`);
    const j = await r.json();
    const times = (j && j.hourly && j.hourly.time) || [];
    const press = (j && j.hourly && j.hourly.surface_pressure) || [];
    if (!times.length || press.length !== times.length) throw new Error("open-meteo: hourly data empty");

    const stamps = times.map((t) => Date.parse(t + "+09:00"));
    const now = Date.now();
    let i = stamps.findIndex((s) => s >= now);
    if (i < 0) i = stamps.length - 1;

    const baseline = Number(press[i]);
    if (!Number.isFinite(baseline)) throw new Error("open-meteo: bad pressure value");

    let min = baseline, minAt = null;
    const end = Math.min(i + 24, press.length - 1);
    for (let k = i; k <= end; k++) {
      const v = Number(press[k]);
      if (Number.isFinite(v) && v < min) { min = v; minAt = times[k]; }
    }

    const drop = Math.round((baseline - min) * 10) / 10;
    const level = drop >= 10 ? "high" : drop >= 5 ? "warn" : "low";
    const data = {
      level,
      label: level === "high" ? "高い" : level === "warn" ? "注意" : "低い",
      drop_hpa: drop,
      current_hpa: Math.round(baseline * 10) / 10,
      min_hpa: Math.round(min * 10) / 10,
      min_at: minAt,
      location: location.name,
      checked_at: new Date().toISOString(),
    };
    cache = { at: Date.now(), data };
    return data;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { getPressureRisk };
