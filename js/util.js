/* Small shared helpers: DOM, storage, time, formatting, colour ramps. */

import { locale, lang, t } from './i18n.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const lerp = (a, b, f) => a + (b - a) * f;
export const round = (v, d = 0) => {
  const p = 10 ** d;
  return Math.round(v * p) / p;
};

/* Swedish writes 3,2 km and 0,6 °C/100 m. Getting the decimal separator wrong
   is the fastest way to look like a machine translation, so every number the
   interface prints goes through Intl rather than toFixed. */
const numberFormatters = new Map();
export function dec(v, digits = 1) {
  if (!Number.isFinite(v)) return '–';
  const key = `${locale()}|${digits}`;
  if (!numberFormatters.has(key)) {
    numberFormatters.set(key, new Intl.NumberFormat(locale(), {
      minimumFractionDigits: 0, maximumFractionDigits: digits,
    }));
  }
  return numberFormatters.get(key).format(v);
}
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
/* Day and month names come from Intl so that Swedish reads "tis 1 sep" rather
   than a translated English abbreviation. Formatters are cached per locale. */
const formatters = new Map();
function fmt(options) {
  const key = `${locale()}|${JSON.stringify(options)}`;
  if (!formatters.has(key)) formatters.set(key, new Intl.DateTimeFormat(locale(), options));
  return formatters.get(key);
}
const capitalise = (s2) => (s2 ? s2[0].toUpperCase() + s2.slice(1) : s2);
/** Swedish drops the trailing period Intl adds to abbreviated weekday names. */
const tidy = (s2) => s2.replace(/\.$/, '').replace(/\.,/, ',');

export const fmtHour = (d) => String(d.getHours()).padStart(2, '0');
export const fmtDay = (d) => capitalise(tidy(fmt({ weekday: 'short', day: 'numeric', month: 'short' }).format(d)));
export const fmtShortDay = (d) => capitalise(tidy(fmt({ weekday: 'short', day: 'numeric' }).format(d)));
export const fmtWeekday = (d) => capitalise(tidy(fmt({ weekday: 'short' }).format(d)));
/** "1 September" — no weekday, for talking about a date rather than a day. */
export const fmtDayMonth = (d) => tidy(fmt({ day: 'numeric', month: 'long' }).format(d));
export const fmtClock = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
export const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d; };

export function ago(ts) {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 90) return t('time.justNow');
  if (s < 3600) return t('time.minutes', { n: Math.round(s / 60) });
  if (s < 86400) return t('time.hours', { n: Math.round(s / 3600) });
  return t('time.days', { n: Math.round(s / 86400) });
}

/* ---------- formatting ---------- */
export const fmtTemp = (v, d = 0) => (Number.isFinite(v) ? `${v > 0 && d === 0 ? '' : ''}${round(v, d)}°` : '–');
export const fmtNum = (v, d = 0) => (Number.isFinite(v) ? round(v, d).toFixed(d) : '–');
export function fmtWind(ms, unit) {
  if (!Number.isFinite(ms)) return '–';
  return unit === 'kmh' ? `${Math.round(ms * 3.6)}` : dec(ms, ms < 10 ? 1 : 0);
}
export const windUnitLabel = (unit) => (unit === 'kmh' ? 'km/h' : 'm/s');
/* Swedish uses O for öst and V for väst — a compass rose reading "E" is an
   immediate tell that nobody Swedish looked at the page. */
const ARROWS = {
  en: ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'],
  sv: ['N', 'NNO', 'NO', 'ONO', 'O', 'OSO', 'SO', 'SSO', 'S', 'SSV', 'SV', 'VSV', 'V', 'VNV', 'NV', 'NNV'],
};
export const compass = (deg) => (Number.isFinite(deg)
  ? (ARROWS[lang()] ?? ARROWS.en)[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16]
  : '–');

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
      const f = (v - x0) / (x1 - x0);
      const a = c0.match(/\w\w/g).map((h) => parseInt(h, 16));
      const b = c1.match(/\w\w/g).map((h) => parseInt(h, 16));
      return rgb(lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f));
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
