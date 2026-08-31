/* Small shared helpers: DOM, storage, time, formatting, colour ramps. */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const round = (v, d = 0) => {
  const p = 10 ** d;
  return Math.round(v * p) / p;
};
export const mean = (arr) => {
  const v = arr.filter(Number.isFinite);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN;
};
export const quantile = (arr, q) => {
  const v = arr.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return NaN;
  const pos = (v.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? v[lo] : lerp(v[lo], v[hi], pos - lo);
};

/* ---------- time ----------
   Open-Meteo returns local wall-clock strings ("2026-08-31T09:00") for the
   requested timezone. We never let the browser guess an offset: parse the
   components and treat them as the mountain's local time, full stop. */
export function parseLocal(s) {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(s);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0));
}
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const fmtHour = (d) => String(d.getHours()).padStart(2, '0');
export const fmtDay = (d) => `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
export const fmtShortDay = (d) => `${DAYS[d.getDay()]} ${d.getDate()}`;
export const fmtClock = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
export const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d; };

export function ago(ts) {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

/* ---------- formatting ---------- */
export const fmtTemp = (v, d = 0) => (Number.isFinite(v) ? `${v > 0 && d === 0 ? '' : ''}${round(v, d)}°` : '–');
export const fmtNum = (v, d = 0) => (Number.isFinite(v) ? round(v, d).toFixed(d) : '–');
export function fmtWind(ms, unit) {
  if (!Number.isFinite(ms)) return '–';
  return unit === 'kmh' ? `${Math.round(ms * 3.6)}` : `${round(ms, ms < 10 ? 1 : 0)}`;
}
export const windUnitLabel = (unit) => (unit === 'kmh' ? 'km/h' : 'm/s');
const ARROWS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
export const compass = (deg) => (Number.isFinite(deg) ? ARROWS[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16] : '–');

/* ---------- storage (never throws; private mode is not an error) ---------- */
export const store = {
  get(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
  },
  del(key) { try { localStorage.removeItem(key); } catch { /* ignore */ } },
};

/* ---------- colour ---------- */
const hex = (n) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, '0');
export const rgb = (r, g, b) => `#${hex(r)}${hex(g)}${hex(b)}`;

function rampColor(stops, v) {
  if (!Number.isFinite(v)) return 'rgba(255,255,255,.05)';
  if (v <= stops[0][0]) return stops[0][1];
  if (v >= stops[stops.length - 1][0]) return stops[stops.length - 1][1];
  for (let i = 1; i < stops.length; i++) {
    if (v <= stops[i][0]) {
      const [x0, c0] = stops[i - 1];
      const [x1, c1] = stops[i];
      const t = (v - x0) / (x1 - x0);
      const a = c0.match(/\w\w/g).map((h) => parseInt(h, 16));
      const b = c1.match(/\w\w/g).map((h) => parseInt(h, 16));
      return rgb(lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t));
    }
  }
  return stops[stops.length - 1][1];
}

/* Temperature ramp: deep violet (arctic) → blue → teal at 0 → green → amber → red.
   The zero-crossing is deliberately a hard visual break; it is the number that
   decides whether the mountain is skiable or runnable. */
export const TEMP_STOPS = [
  [-30, '#3b0764'], [-20, '#4c1d95'], [-12, '#1e40af'], [-6, '#0369a1'],
  [-1, '#0e7490'], [0, '#155e75'], [1, '#15803d'], [8, '#4d7c0f'],
  [15, '#a16207'], [22, '#c2410c'], [30, '#9f1239'],
];
export const WIND_STOPS = [
  [0, '#0b1220'], [3, '#134e4a'], [7, '#0e7490'], [12, '#1d4ed8'],
  [17, '#6d28d9'], [22, '#a21caf'], [30, '#be123c'], [40, '#7f1d1d'],
];
export const PRECIP_STOPS = [
  [0.05, '#0f172a'], [0.5, '#164e63'], [1.5, '#0369a1'],
  [3, '#1d4ed8'], [6, '#6d28d9'], [10, '#a21caf'],
];
export const tempColor = (v) => rampColor(TEMP_STOPS, v);
export const windColor = (v) => rampColor(WIND_STOPS, v);
export function precipColor(v) {
  if (!Number.isFinite(v) || v < 0.05) return 'rgba(255,255,255,.035)';
  return rampColor(PRECIP_STOPS, v);
}
export function rampCss(stops) {
  const lo = stops[0][0];
  const hi = stops[stops.length - 1][0];
  return `linear-gradient(90deg, ${stops.map(([x, c]) => `${c} ${((x - lo) / (hi - lo) * 100).toFixed(1)}%`).join(', ')})`;
}

/* Score colour: red → amber → lime, used for activity verdicts. */
const SCORE_STOPS = [[0, '#f43f5e'], [32, '#fb923c'], [52, '#fbbf24'], [72, '#a3e635'], [100, '#4ade80']];
export const scoreColor = (s) => rampColor(SCORE_STOPS, s);

/* ---------- svg ---------- */
export const SVGNS = 'http://www.w3.org/2000/svg';
export function svgEl(tag, attrs = {}, parent) {
  const node = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null) continue;
    node.setAttribute(k, String(v));
  }
  if (parent) parent.appendChild(node);
  return node;
}
export function el(tag, attrs = {}, parent) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, String(v));
  }
  if (parent) parent.appendChild(node);
  return node;
}

/** Current wall-clock hour in the mountains' timezone, as "YYYY-MM-DDTHH".
 *  Using the viewer's own clock would put "now" in the wrong column for anyone
 *  reading this from another timezone. */
export function nowIsoHour(timeZone) {
  try {
    const p = new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false,
    }).formatToParts(new Date()).reduce((a, x) => (a[x.type] = x.value, a), {});
    const hh = p.hour === '24' ? '00' : p.hour;
    return `${p.year}-${p.month}-${p.day}T${hh}`;
  } catch {
    const d = new Date();
    return `${isoDate(d)}T${String(d.getHours()).padStart(2, '0')}`;
  }
}

/** WMO weather interpretation codes, in plain language. */
const WMO = {
  0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Freezing fog',
  51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
  56: 'Freezing drizzle', 57: 'Freezing drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
  66: 'Freezing rain', 67: 'Freezing rain',
  71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
  80: 'Rain showers', 81: 'Rain showers', 82: 'Violent rain showers',
  85: 'Snow showers', 86: 'Heavy snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Thunderstorm with hail',
};
export const wmoLabel = (code) => WMO[code] ?? null;
