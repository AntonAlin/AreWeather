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

/* ---------- data ramps ----------
   Each of these encodes magnitude or polarity, so each is a proper scale rather
   than a spectrum. The rule the earlier rainbows broke: a reader cannot rank
   hues, only lightness — green is not "between" blue and yellow to anyone, so a
   rainbow forces a legend lookup for every single cell.

   Every step below was generated as an OKLCH ladder and checked for monotone
   lightness, a visible gap between steps, a single hue per arm, and contrast
   against the card. Editing one by eye will quietly break that. */

/* Temperature is the one variable here with a natural midpoint, so it is the one
   diverging scale: cold blue and warm red either side of a neutral at exactly
   0 °C. That is not decoration — the freezing line decides rain against snow,
   ice against grip, and it now falls where the colour goes quiet rather than
   somewhere in the middle of a green. */
/* The anchors are fixed rather than fitted to each day's data, so a colour means
   the same thing on every peak and every page. They are spaced for the range a
   Swedish mountain actually occupies: full chroma is reached by about ±16 °C,
   not ±30, or an ordinary winter day would spend the whole palette on two
   indistinguishable slates. */
export const TEMP_STOPS = [
  [-25, '#8ae0ff'], [-16, '#7ac0fb'], [-9, '#6aa1d0'], [-4, '#5b83a6'], [-1.5, '#4b677e'],
  [0, '#64707d'],
  [1.5, '#7d5950'], [4, '#9f6c5f'], [9, '#c27e6e'], [16, '#e5927e'], [25, '#ffa58e'],
];
/* Wind is pure magnitude: one hue, dim to bright. Danger is carried by the
   numbers and the status colours beside them, never by a hue change here. */
export const WIND_STOPS = [
  [0, '#5a4a90'], [5, '#6e60a5'], [9, '#8476bb'], [14, '#998dd1'],
  [19, '#b0a4e8'], [25, '#c7bcfe'], [35, '#dfd4ff'],
];
export const PRECIP_STOPS = [
  [0.05, '#056180'], [0.5, '#237a9d'], [1.5, '#3a94ba'],
  [3, '#4faed8'], [6, '#65caf8'], [10, '#7be6ff'],
];
/* Two more single-hue ramps, for the aspect rose: snow loading and sunlight. */
export const SNOW_STOPS = [
  [0, '#11697a'], [20, '#228397'], [40, '#329eb4'],
  [60, '#42bad3'], [80, '#52d6f3'], [100, '#63f4ff'],
];
export const SUN_STOPS = [
  [0, '#785724'], [0.2, '#926b31'], [0.4, '#ad803e'],
  [0.6, '#c9964c'], [0.8, '#e5ad5a'], [1, '#ffc469'],
];
export const tempColor = (v) => rampColor(TEMP_STOPS, v);
export const windColor = (v) => rampColor(WIND_STOPS, v);
export const snowLoadColor = (v) => rampColor(SNOW_STOPS, v);
export const sunColor = (v) => rampColor(SUN_STOPS, v);
export function precipColor(v) {
  if (!Number.isFinite(v) || v < 0.05) return 'rgba(255,255,255,.035)';
  return rampColor(PRECIP_STOPS, v);
}
/**
 * Ink that survives whatever the ramp put underneath it.
 *
 * A fixed white label is legible on the dark end of a sequential ramp and
 * invisible on the bright end, which is exactly where the interesting values
 * are. Relative luminance decides, so this stays correct if a ramp is retuned.
 */
export function inkOn(colour) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(colour).trim());
  if (!m) return 'rgba(255,255,255,.92)';
  const n = parseInt(m[1], 16);
  const lin = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.42 ? 'rgba(6,8,11,.92)' : 'rgba(255,255,255,.94)';
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
