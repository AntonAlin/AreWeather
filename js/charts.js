/* Hand-rolled SVG visualisation. No chart library: every mark here needs to
   know about elevation, phase or wind, and generic charting tools fight that. */

import { svgEl, tempColor, windColor, precipColor, snowLoadColor, sunColor, inkOn, clamp, lerp, fmtHour, fmtShortDay, fmtWind, compass, dec, parseLocal } from './util.js';
import { t } from './i18n.js';

const AXIS = '#66717f';
const EMPTY_SECTOR = 'rgba(255,255,255,.05)';
/* One shade off the surface, solid: a dashed grid reads as a threshold, and
   this site has real thresholds to draw. */
const GRID = 'rgba(255,255,255,.07)';


/* ---------- hover ----------
   An SVG chart in a browser is an interactive object, and a mark you cannot
   interrogate is a picture of a chart. One tooltip node serves every chart on
   the page; `hoverable` attaches it to any mark and also leaves an accessible
   name behind, so the value is reachable without a pointer. */
let tipNode = null;
function tipEl() {
  if (tipNode?.isConnected) return tipNode;
  tipNode = document.getElementById('tooltip');
  if (!tipNode) {
    tipNode = document.createElement('div');
    tipNode.id = 'tooltip';
    tipNode.className = 'tooltip';
    tipNode.setAttribute('aria-hidden', 'true');
    document.body.appendChild(tipNode);
  }
  return tipNode;
}

/** Strip markup for the accessible name, keeping the separators readable. */
const plain = (html) => html
  .replace(/<\/span>\s*<span>/g, ': ')   // key and value inside one row
  .replace(/<\/(?:div|b)>/g, ' · ')      // row and title boundaries
  .replace(/<[^>]*>/g, '')
  .replace(/\s*·\s*$/, '')
  .replace(/\s+/g, ' ')
  .trim();

export function hoverable(mark, html, { label } = {}) {
  if (!html) return mark;
  const node = () => tipEl();
  const place = (ev) => {
    const el2 = node();
    el2.innerHTML = html;
    el2.classList.add('on');
    const pad = 14;
    const r = el2.getBoundingClientRect();
    let x = ev.clientX + pad;
    let y = ev.clientY + pad;
    if (x + r.width > innerWidth - 8) x = ev.clientX - r.width - pad;
    if (y + r.height > innerHeight - 8) y = ev.clientY - r.height - pad;
    el2.style.left = `${Math.max(8, x)}px`;
    el2.style.top = `${Math.max(8, y)}px`;
  };
  mark.addEventListener('pointerenter', place);
  mark.addEventListener('pointermove', place);
  mark.addEventListener('pointerleave', () => node().classList.remove('on'));
  mark.setAttribute('aria-label', label ?? plain(html));
  return mark;
}

/** The markup every tooltip on the site shares. */
export const tipTitle = (s2) => `<b>${s2}</b>`;
export const tipRow = (k, v) => `<div class="row"><span>${k}</span><span>${v}</span></div>`;

/* ---------- shared ---------- */
function frame(container, width, height, label) {
  container.textContent = '';
  const svg = svgEl('svg', {
    width, height, viewBox: `0 0 ${width} ${height}`,
    style: 'max-width:100%;overflow:visible', role: 'img', 'aria-label': label,
  }, container);
  if (label) svgEl('title', {}, svg).appendChild(document.createTextNode(label));
  return svg;
}
const text = (parent, x, y, str, opts = {}) => svgEl('text', {
  x, y, fill: opts.fill ?? AXIS, 'font-size': opts.size ?? 10,
  'font-family': opts.mono === false ? 'inherit' : 'JetBrains Mono, monospace',
  'font-variant-numeric': opts.tabular === false ? 'normal' : 'tabular-nums',
  'text-anchor': opts.anchor ?? 'start', 'font-weight': opts.weight ?? 400,
  'letter-spacing': opts.tracking ?? 0, opacity: opts.opacity ?? 1,
}, parent).appendChild(document.createTextNode(str)).parentNode;

/** Small HTML key rendered under a chart. */
function key(container, items) {
  const row = document.createElement('div');
  row.className = 'chart-key';
  for (const [color, label, kind] of items) {
    const span = document.createElement('span');
    const swatch = document.createElement('i');
    if (kind === 'block') { swatch.className = 'block'; swatch.style.background = color; }
    else swatch.style.borderTopColor = color;
    span.append(swatch, document.createTextNode(label));
    row.appendChild(span);
  }
  container.appendChild(row);
}

export function precipCellColor(band) {
  const mm = band.precip;
  if (!Number.isFinite(mm) || mm < 0.05) return 'rgba(255,255,255,.035)';
  if (band.phase === 'snow') {
    const f = clamp(Math.sqrt(mm / 4), 0, 1);
    const c = (a, b) => Math.round(lerp(a, b, f));
    return `rgb(${c(30, 224)},${c(58, 242)},${c(95, 254)})`;
  }
  return precipColor(mm);
}

/* ---------- 1. elevation × time matrix ---------- */
export function renderMatrix(container, model, opts) {
  const { metric = 'temp', hours = 48, unit = 'ms', selected = 0, nowIndex = 0, onPick, onHover } = opts;
  const rows = [...model.bandHeights].reverse();
  const cols = model.hours.slice(0, hours);
  const cw = cols.length > 56 ? 22 : 26;
  const ch = 24;
  const gutter = 54;
  const top = 40;
  const width = gutter + cols.length * cw + 8;
  const height = top + rows.length * ch + 22;
  const svg = frame(container, width, height, t('matrix.aria', {
    metric: t(`metric.${metric}`), rows: rows.length,
    lo: rows[rows.length - 1], hi: rows[0], hours: cols.length,
  }));

  const xOf = (i) => gutter + i * cw;
  const yOf = (z) => top + rows.indexOf(z) * ch;
  const yOfElev = (z) => {
    // continuous elevation → y, for the snow-line overlay
    const hi = rows[0], lo = rows[rows.length - 1];
    const f = clamp((hi - z) / (hi - lo), -0.2, 1.2);
    return top + f * (rows.length - 1) * ch + ch / 2;
  };

  const value = (band) => (metric === 'temp' ? band.temp : metric === 'feels' ? band.feels : metric === 'wind' ? band.wind : band.precip);
  const fill = (band) => {
    if (metric === 'temp') return tempColor(band.temp);
    if (metric === 'feels') return tempColor(band.feels);
    if (metric === 'wind') return windColor(band.wind);
    return precipCellColor(band);
  };

  /* day separators + labels */
  let lastDay = null;
  cols.forEach((h, i) => {
    const day = h.iso.slice(0, 10);
    if (day !== lastDay) {
      if (i > 0) svgEl('line', { x1: xOf(i), y1: top - 22, x2: xOf(i), y2: height - 20, stroke: 'rgba(255,255,255,.22)', 'stroke-width': 1 }, svg);
      text(svg, xOf(i) + 5, top - 24, fmtShortDay(h.time).toUpperCase(), { size: 9, fill: '#9aa6b6', weight: 600, tracking: 1.4, mono: false });
      lastDay = day;
    }
    if (h.hour % 3 === 0) text(svg, xOf(i) + cw / 2, top - 8, fmtHour(h.time), { size: 9, anchor: 'middle', opacity: h.daylight ? 1 : 0.45 });
  });

  /* elevation labels */
  rows.forEach((z) => {
    text(svg, gutter - 8, yOf(z) + ch / 2 + 3.5, `${z}`, { size: 10, anchor: 'end', fill: z === model.mtn.summit ? '#eef2f7' : AXIS, weight: z === model.mtn.summit ? 600 : 400 });
  });
  text(svg, gutter - 8, top - 8, 'm', { size: 9, anchor: 'end', opacity: .6 });

  /* cells */
  const cells = svgEl('g', {}, svg);
  cols.forEach((h, i) => {
    rows.forEach((z) => {
      const band = h.bands.find((b) => b.z === z);
      if (!band) return;
      const paint = fill(band);
      svgEl('rect', {
        x: xOf(i) + 1, y: yOf(z) + 1, width: cw - 2, height: ch - 2, rx: 4,
        fill: paint, opacity: h.daylight ? 1 : 0.86,
      }, cells);
      if (metric !== 'precip' && Number.isFinite(value(band)) && (cw >= 26 || h.hour % 2 === 0)) {
        const v = metric === 'wind' ? fmtWind(band.wind, unit) : dec(value(band), 0);
        /* The ends of these ramps are bright, so the ink has to follow the fill
           rather than assume a dark one. */
        text(cells, xOf(i) + cw / 2, yOf(z) + ch / 2 + 3.2, String(v), {
          size: 9, anchor: 'middle', fill: inkOn(paint), weight: 500,
        });
      }
      if (metric === 'precip' && band.precip >= 0.15 && cw >= 22) {
        text(cells, xOf(i) + cw / 2, yOf(z) + ch / 2 + 3.2, band.precip >= 1 ? String(Math.round(band.precip)) : '·', {
          size: 9, anchor: 'middle', fill: band.phase === 'snow' ? 'rgba(8,20,35,.8)' : 'rgba(255,255,255,.85)', weight: 600,
        });
      }
    });
  });

  /* snow line + freezing level overlays */
  const drawLine = (pick, stroke, dash, labelText) => {
    const pts = [];
    cols.forEach((h, i) => {
      const z = pick(h);
      if (Number.isFinite(z) && z !== null) pts.push([xOf(i) + cw / 2, yOfElev(z)]);
      else pts.push(null);
    });
    let run = [];
    const flush = () => {
      if (run.length > 1) {
        svgEl('polyline', {
          points: run.map((p) => p.join(',')).join(' '), fill: 'none', stroke,
          'stroke-width': 2, 'stroke-dasharray': dash, 'stroke-linecap': 'round', opacity: .95,
        }, svg);
      }
      run = [];
    };
    const floorY = top + rows.length * ch;
    for (const p of pts) { if (p && p[1] >= top && p[1] <= floorY) run.push(p); else flush(); }
    flush();
    const first = pts.find((p) => p && p[1] > top + 8 && p[1] < top + rows.length * ch - 8);
    if (first && labelText) {
      text(svg, first[0] + 6, first[1] - 6, labelText, { size: 8.5, fill: stroke, weight: 600, tracking: .8 });
    }
  };
  drawLine((h) => h.snowLine, '#ffffff', '5 4', t('matrix.snowLine'));
  drawLine((h) => h.freezingLevel, '#fbbf24', '2 4', t('matrix.freezing'));

  /* now + selection */
  if (nowIndex >= 0 && nowIndex < cols.length) {
    svgEl('rect', { x: xOf(nowIndex), y: top - 26, width: cw, height: rows.length * ch + 26, fill: 'none', stroke: 'rgba(79,209,255,.85)', 'stroke-width': 1.5, rx: 5 }, svg);
    text(svg, xOf(nowIndex) + cw / 2, height - 8, t('matrix.now'), { size: 8, anchor: 'middle', fill: '#4fd1ff', weight: 700, tracking: 1 });
  }
  const sel = svgEl('rect', {
    x: xOf(clamp(selected, 0, cols.length - 1)), y: top - 4, width: cw, height: rows.length * ch + 8,
    fill: 'rgba(255,255,255,.10)', stroke: 'rgba(255,255,255,.55)', 'stroke-width': 1, rx: 5, 'pointer-events': 'none',
  }, svg);

  /* interaction */
  const hit = svgEl('rect', { x: gutter, y: top, width: cols.length * cw, height: rows.length * ch, fill: 'transparent', style: 'cursor:crosshair' }, svg);
  const locate = (ev) => {
    const r = hit.getBoundingClientRect();
    const i = clamp(Math.floor(((ev.clientX - r.left) / r.width) * cols.length), 0, cols.length - 1);
    const j = clamp(Math.floor(((ev.clientY - r.top) / r.height) * rows.length), 0, rows.length - 1);
    return { i, z: rows[j] };
  };
  hit.addEventListener('pointermove', (ev) => {
    const { i, z } = locate(ev);
    onHover?.(cols[i], cols[i].bands.find((b) => b.z === z), ev);
  });
  hit.addEventListener('pointerleave', () => onHover?.(null));
  hit.addEventListener('click', (ev) => {
    const { i, z } = locate(ev);
    sel.setAttribute('x', xOf(i));
    onPick?.(i, z);
  });
  return svg;
}

/* ---------- 2. vertical profile ---------- */
export function renderProfile(container, model, hourIndex, { unit = 'ms', width = 520 }) {
  const h = model.hours[hourIndex];
  if (!h) return;
  const height = 340;
  const pad = { l: 42, r: 78, t: 22, b: 30 };
  const svg = frame(container, width, height, t('profile.aria', {
    mtn: model.mtn.name, hour: `${String(h.time.getHours()).padStart(2, '0')}:00`,
  }));

  const zLo = model.mtn.base - 60;
  const zHi = model.mtn.summit + 260;
  const temps = h.bands.map((b) => b.temp).filter(Number.isFinite);
  const tLo = Math.floor(Math.min(...temps, 0) - 2);
  const tHi = Math.ceil(Math.max(...temps, 0) + 2);
  const x = (temp) => pad.l + ((temp - tLo) / (tHi - tLo)) * (width - pad.l - pad.r);
  const y = (z) => height - pad.b - ((z - zLo) / (zHi - zLo)) * (height - pad.t - pad.b);

  /* mountain silhouette — decoration, kept faint so it never reads as data */
  const plotW = width - pad.l - pad.r;
  const peakX = pad.l + plotW * 0.55;
  const ground = y(zLo);
  const span = model.mtn.summit - model.mtn.base;
  svgEl('path', {
    d: `M ${pad.l} ${ground}`
      + ` L ${pad.l + plotW * 0.10} ${y(model.mtn.base + span * 0.10)}`
      + ` L ${pad.l + plotW * 0.28} ${y(model.mtn.base + span * 0.42)}`
      + ` L ${pad.l + plotW * 0.40} ${y(model.mtn.base + span * 0.34)}`
      + ` L ${peakX - plotW * 0.06} ${y(model.mtn.summit - span * 0.12)}`
      + ` L ${peakX} ${y(model.mtn.summit)}`
      + ` L ${peakX + plotW * 0.09} ${y(model.mtn.base + span * 0.60)}`
      + ` L ${peakX + plotW * 0.20} ${y(model.mtn.base + span * 0.28)}`
      + ` L ${width - pad.r} ${ground} Z`,
    fill: 'rgba(255,255,255,.04)', stroke: 'rgba(255,255,255,.09)', 'stroke-width': 1,
  }, svg);

  /* elevation gridlines */
  for (let z = Math.ceil(zLo / 200) * 200; z <= zHi; z += 200) {
    svgEl('line', { x1: pad.l, y1: y(z), x2: width - pad.r, y2: y(z), stroke: GRID, 'stroke-width': 1 }, svg);
    text(svg, pad.l - 7, y(z) + 3.5, String(z), { size: 9, anchor: 'end' });
  }
  /* 0 °C isotherm */
  if (tLo < 0 && tHi > 0) {
    svgEl('line', { x1: x(0), y1: pad.t, x2: x(0), y2: height - pad.b, stroke: 'rgba(251,191,36,.55)', 'stroke-width': 1.5, 'stroke-dasharray': '4 4' }, svg);
    text(svg, x(0) + 4, pad.t + 9, '0°C', { size: 9, fill: '#fbbf24', weight: 600 });
  }
  /* temperature axis */
  const tick = (tHi - tLo) > 18 ? 5 : 2;
  for (let temp = Math.ceil(tLo / tick) * tick; temp <= tHi; temp += tick) {
    text(svg, x(temp), height - pad.b + 14, `${dec(temp, 0)}°`, { size: 9, anchor: 'middle' });
  }

  /* cloud layer */
  if (Number.isFinite(h.cloudBase) && (h.cloud ?? 0) > 25) {
    const top = clamp(h.cloudBase, zLo, zHi);
    svgEl('rect', {
      x: pad.l, y: y(zHi), width: width - pad.l - pad.r, height: Math.max(0, y(top) - y(zHi)),
      fill: 'rgba(255,255,255,.07)',
    }, svg);
    svgEl('line', { x1: pad.l, y1: y(top), x2: width - pad.r, y2: y(top), stroke: 'rgba(255,255,255,.4)', 'stroke-dasharray': '6 4', 'stroke-width': 1 }, svg);
    text(svg, pad.l + 4, y(top) - 5, t('profile.cloudBase', { z: Math.round(h.cloudBase) }), { size: 8.5, fill: 'rgba(255,255,255,.65)', weight: 600, tracking: .8 });
  }
  /* snow line */
  if (Number.isFinite(h.snowLine)) {
    svgEl('line', { x1: pad.l, y1: y(h.snowLine), x2: width - pad.r, y2: y(h.snowLine), stroke: '#4fd1ff', 'stroke-width': 1.5, 'stroke-dasharray': '5 4' }, svg);
    text(svg, pad.l + 4, y(h.snowLine) - 5, t('profile.snowLine', { z: Math.round(h.snowLine) }), { size: 8.5, fill: '#4fd1ff', weight: 600, tracking: .8 });
  }

  /* temperature curve + wind arrows */
  const pts = h.bands.filter((b) => Number.isFinite(b.temp)).map((b) => [x(b.temp), y(b.z)]);
  if (pts.length > 1) {
    svgEl('polyline', { points: pts.map((p) => p.join(',')).join(' '), fill: 'none', stroke: 'url(#tgrad)', 'stroke-width': 2.5, 'stroke-linejoin': 'round' }, svg);
    const defs = svgEl('defs', {}, svg);
    const g = svgEl('linearGradient', { id: 'tgrad', x1: '0', y1: '1', x2: '0', y2: '0' }, defs);
    svgEl('stop', { offset: '0%', 'stop-color': '#a78bfa' }, g);
    svgEl('stop', { offset: '100%', 'stop-color': '#4fd1ff' }, g);
  }
  h.bands.forEach((b) => {
    if (!Number.isFinite(b.temp)) return;
    svgEl('circle', { cx: x(b.temp), cy: y(b.z), r: b.z === model.mtn.summit ? 4 : 2.6, fill: tempColor(b.temp), stroke: 'rgba(255,255,255,.65)', 'stroke-width': 1 }, svg);
    if (!Number.isFinite(b.wind)) return;
    const ax = width - pad.r + 26;
    const ay = y(b.z);
    const r = ((b.dir ?? 0) + 180) * Math.PI / 180;
    const len = clamp(6 + b.wind * 0.7, 6, 17);
    svgEl('line', {
      x1: ax - Math.sin(r) * len, y1: ay + Math.cos(r) * len, x2: ax + Math.sin(r) * len, y2: ay - Math.cos(r) * len,
      stroke: windColor(b.wind), 'stroke-width': 2, 'stroke-linecap': 'round',
    }, svg);
    svgEl('circle', { cx: ax + Math.sin(r) * len, cy: ay - Math.cos(r) * len, r: 2.4, fill: windColor(b.wind) }, svg);
    text(svg, ax + 24, ay + 3.5, fmtWind(b.wind, unit), { size: 9, fill: '#9aa6b6' });
  });
  text(svg, width - pad.r + 26, pad.t - 6, t('profile.wind'), { size: 8, anchor: 'middle', fill: AXIS, weight: 700, tracking: 1 });
}

/* ---------- 3. hourly detail ---------- */
export function renderHourly(container, model, { bandZ, hours = 48, unit = 'ms', width = 900, nowIndex = 0, selected = 0, onPick }) {
  const cols = model.hours.slice(0, hours);
  const height = 250;
  const pad = { l: 40, r: 44, t: 18, b: 42 };
  const svg = frame(container, width, height, t('hourly.aria', { z: bandZ, hours: cols.length }));
  const plotW = width - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;
  const x = (i) => pad.l + (i + 0.5) * (plotW / cols.length);

  const band = (h) => h.bands.find((b) => b.z === bandZ) ?? h.summit;
  const temps = cols.map((h) => band(h).temp).filter(Number.isFinite);
  const lows = cols.map((h) => (h.ens ? h.ens.t10 + (band(h).temp - h.summit.temp) : NaN)).filter(Number.isFinite);
  const highs = cols.map((h) => (h.ens ? h.ens.t90 + (band(h).temp - h.summit.temp) : NaN)).filter(Number.isFinite);
  const tLo = Math.floor(Math.min(...temps, ...lows, 0) - 1.5);
  const tHi = Math.ceil(Math.max(...temps, ...highs, 0) + 1.5);
  const y = (temp) => pad.t + (1 - (temp - tLo) / (tHi - tLo)) * plotH;

  /* night shading */
  let runStart = null;
  cols.forEach((h, i) => {
    if (!h.daylight && runStart === null) runStart = i;
    if ((h.daylight || i === cols.length - 1) && runStart !== null) {
      svgEl('rect', { x: x(runStart) - plotW / cols.length / 2, y: pad.t, width: (i - runStart) * (plotW / cols.length), height: plotH, fill: 'rgba(0,0,0,.28)' }, svg);
      runStart = null;
    }
  });

  /* gridlines */
  const step = (tHi - tLo) > 20 ? 5 : 2;
  for (let temp = Math.ceil(tLo / step) * step; temp <= tHi; temp += step) {
    svgEl('line', {
      x1: pad.l, y1: y(temp), x2: width - pad.r, y2: y(temp),
      stroke: temp === 0 ? 'rgba(251,191,36,.4)' : GRID, 'stroke-width': 1,
      'stroke-dasharray': temp === 0 ? '4 4' : 'none',
    }, svg);
    text(svg, pad.l - 6, y(temp) + 3.5, `${dec(temp, 0)}°`, { size: 9, anchor: 'end' });
  }

  /* ensemble band */
  const hasEns = cols.some((h) => h.ens && Number.isFinite(h.ens.t10));
  if (hasEns) {
    const up = [], dn = [];
    cols.forEach((h, i) => {
      if (!h.ens || !Number.isFinite(h.ens.t10)) return;
      const off = band(h).temp - h.summit.temp;
      up.push([x(i), y(h.ens.t90 + off)]);
      dn.unshift([x(i), y(h.ens.t10 + off)]);
    });
    if (up.length > 1) {
      svgEl('path', { d: `M ${[...up, ...dn].map((p) => p.join(' ')).join(' L ')} Z`, fill: 'rgba(79,209,255,.16)', stroke: 'none' }, svg);
    }
  }

  /* precipitation bars (bottom third, own scale) */
  const maxP = Math.max(0.6, ...cols.map((h) => band(h).precip).filter(Number.isFinite));
  const bw = Math.max(2, plotW / cols.length - 3);
  cols.forEach((h, i) => {
    const b = band(h);
    if (!Number.isFinite(b.precip) || b.precip < 0.02) return;
    const hgt = (b.precip / maxP) * (plotH * 0.36);
    svgEl('rect', {
      x: x(i) - bw / 2, y: pad.t + plotH - hgt, width: bw, height: hgt, rx: 2,
      fill: b.phase === 'snow' ? 'rgba(224,242,254,.85)' : b.phase === 'mix' ? 'rgba(167,139,250,.8)' : 'rgba(56,132,255,.8)',
    }, svg);
  });
  text(svg, width - pad.r + 6, pad.t + plotH - 2, `${dec(maxP, 1)}mm`, { size: 8.5, fill: AXIS });

  /* temperature line */
  const line = cols.map((h, i) => (Number.isFinite(band(h).temp) ? [x(i), y(band(h).temp)] : null)).filter(Boolean);
  svgEl('polyline', { points: line.map((p) => p.join(',')).join(' '), fill: 'none', stroke: '#4fd1ff', 'stroke-width': 2.2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);

  /* wind line, scaled into the top half */
  const maxW = Math.max(8, ...cols.map((h) => band(h).gust).filter(Number.isFinite));
  const wy = (v) => pad.t + plotH * 0.42 * (1 - v / maxW) + plotH * 0.02;
  const wline = cols.map((h, i) => (Number.isFinite(band(h).wind) ? [x(i), wy(band(h).wind)] : null)).filter(Boolean);
  svgEl('polyline', { points: wline.map((p) => p.join(',')).join(' '), fill: 'none', stroke: 'rgba(167,139,250,.85)', 'stroke-width': 1.6, 'stroke-dasharray': '1 0' }, svg);
  const gline = cols.map((h, i) => (Number.isFinite(band(h).gust) ? [x(i), wy(band(h).gust)] : null)).filter(Boolean);
  svgEl('polyline', { points: gline.map((p) => p.join(',')).join(' '), fill: 'none', stroke: 'rgba(167,139,250,.42)', 'stroke-width': 1.2, 'stroke-dasharray': '3 3' }, svg);
  text(svg, width - pad.r + 6, wy(maxW) + 4, `${fmtWind(maxW, unit)}`, { size: 8.5, fill: 'rgba(167,139,250,.9)' });
  text(svg, width - pad.r + 6, wy(maxW) + 15, unit === 'kmh' ? 'km/h' : 'm/s', { size: 7.5, fill: 'rgba(167,139,250,.6)' });

  /* hour axis */
  let lastDay = null;
  cols.forEach((h, i) => {
    const day = h.iso.slice(0, 10);
    if (day !== lastDay) {
      svgEl('line', { x1: x(i) - plotW / cols.length / 2, y1: pad.t, x2: x(i) - plotW / cols.length / 2, y2: height - pad.b + 6, stroke: 'rgba(255,255,255,.22)' }, svg);
      text(svg, x(i) + 2, height - pad.b + 26, fmtShortDay(h.time).toUpperCase(), { size: 9, fill: '#9aa6b6', weight: 600, tracking: 1, mono: false });
      lastDay = day;
    }
    const every = cols.length > 50 ? 6 : 3;
    if (h.hour % every === 0) text(svg, x(i), height - pad.b + 13, fmtHour(h.time), { size: 9, anchor: 'middle', opacity: h.daylight ? 1 : .5 });
  });

  if (nowIndex >= 0 && nowIndex < cols.length) {
    svgEl('line', { x1: x(nowIndex), y1: pad.t, x2: x(nowIndex), y2: pad.t + plotH, stroke: 'rgba(79,209,255,.9)', 'stroke-width': 1.5 }, svg);
  }
  const marker = svgEl('line', { x1: x(clamp(selected, 0, cols.length - 1)), y1: pad.t, x2: x(clamp(selected, 0, cols.length - 1)), y2: pad.t + plotH, stroke: 'rgba(255,255,255,.5)', 'stroke-width': 1, 'stroke-dasharray': '3 3' }, svg);

  key(container, [
    ['#4fd1ff', t('key.temperature')],
    ['rgba(79,209,255,.45)', t('key.spread'), 'block'],
    ['rgba(167,139,250,.85)', t('key.wind')],
    ['rgba(167,139,250,.42)', t('key.gusts')],
    ['rgba(224,242,254,.85)', t('key.snow'), 'block'],
    ['rgba(56,132,255,.8)', t('key.rain'), 'block'],
  ]);

  const hit = svgEl('rect', { x: pad.l, y: pad.t, width: plotW, height: plotH, fill: 'transparent', style: 'cursor:crosshair' }, svg);
  hit.addEventListener('click', (ev) => {
    const r = hit.getBoundingClientRect();
    const i = clamp(Math.floor(((ev.clientX - r.left) / r.width) * cols.length), 0, cols.length - 1);
    marker.setAttribute('x1', x(i)); marker.setAttribute('x2', x(i));
    onPick?.(i);
  });
}

/* ---------- 4. aspect rose ----------
   Eight sectors of the mountain, coloured by whichever question is being
   asked: where is it calm, where is the wind loading snow, where is the sun. */
export function renderAspectRose(container, aspects, { lens = 'wind', unit = 'ms', wind, sun, size = 260 }) {
  const svg = frame(container, size, size, t(`aspect.aria.${lens}`));
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size * 0.42;
  const rInner = size * 0.19;

  /* Each lens is one magnitude in one hue: violet for wind, ice for the snow it
     stacks up, amber for sunlight. A sector too small to matter stays empty
     rather than taking the palest step, so "nothing here" and "a little here"
     do not look the same. */
  const colourFor = (a) => {
    if (lens === 'loading') return a.loading ? snowLoadColor(a.loading) : EMPTY_SECTOR;
    if (lens === 'sun') {
      const s = clamp(a.sun / 0.6, 0, 1);
      return s < 0.03 ? EMPTY_SECTOR : sunColor(s);
    }
    return windColor(a.wind);
  };

  const arc = (from, to, r0, r1) => {
    const a0 = ((from - 90) * Math.PI) / 180;
    const a1 = ((to - 90) * Math.PI) / 180;
    const p = (r, a) => `${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`;
    return `M ${p(r0, a0)} L ${p(r1, a0)} A ${r1} ${r1} 0 0 1 ${p(r1, a1)} L ${p(r0, a1)} A ${r0} ${r0} 0 0 0 ${p(r0, a0)} Z`;
  };

  aspects.forEach((a) => {
    const half = 22.5;
    const paint = colourFor(a);
    const sector = svgEl('path', {
      d: arc(a.bearing - half, a.bearing + half, rInner, rOuter),
      fill: paint,
      stroke: 'rgba(6,8,11,.85)',
      'stroke-width': 2,
    }, svg);
    hoverable(sector, tipTitle(`${compass(a.bearing)} · ${dec(a.bearing, 0)}°`)
      + tipRow(t('aspect.tip.wind'), `${fmtWind(a.wind, unit)} ${unit === 'kmh' ? 'km/h' : 'm/s'}`)
      + tipRow(t('aspect.tip.loading'), `${dec(a.loading, 0)}/100`)
      + tipRow(t('aspect.tip.sun'), `${Math.round(clamp(a.sun / 0.6, 0, 1) * 100)}%`));
    const mid = ((a.bearing - 90) * Math.PI) / 180;
    const rLabel = (rInner + rOuter) / 2;
    const value = lens === 'loading' ? String(a.loading)
      : lens === 'sun' ? `${Math.round(clamp(a.sun / 0.6, 0, 1) * 100)}`
        : fmtWind(a.wind, unit);
    text(svg, cx + rLabel * Math.cos(mid), cy + rLabel * Math.sin(mid) + 3.5, value, {
      size: 10, anchor: 'middle', fill: inkOn(paint), weight: 600,
    });
    text(svg, cx + (rOuter + 13) * Math.cos(mid), cy + (rOuter + 13) * Math.sin(mid) + 3.5, compass(a.bearing), {
      size: 9, anchor: 'middle', fill: '#66717f', weight: 600, tracking: .5,
    });
  });

  /* Where the wind is coming from, drawn as an arrow into the middle. */
  if (Number.isFinite(wind?.dir)) {
    const from = ((wind.dir - 90) * Math.PI) / 180;
    const tail = rInner - 4;
    svgEl('line', {
      x1: cx + tail * Math.cos(from), y1: cy + tail * Math.sin(from),
      x2: cx - (rInner - 12) * Math.cos(from), y2: cy - (rInner - 12) * Math.sin(from),
      stroke: '#4fd1ff', 'stroke-width': 2.5, 'stroke-linecap': 'round',
    }, svg);
    svgEl('circle', { cx: cx + tail * Math.cos(from), cy: cy + tail * Math.sin(from), r: 3.5, fill: '#4fd1ff' }, svg);
    text(svg, cx, cy - 4, fmtWind(wind.speed, unit), { size: 13, anchor: 'middle', fill: '#eef2f7', weight: 600 });
    text(svg, cx, cy + 8, `${unit === 'kmh' ? 'km/h' : 'm/s'} ${compass(wind.dir)}`, { size: 8, anchor: 'middle', fill: '#66717f' });
  }

  /* And where the sun is, if it is up. */
  if (sun && sun.elevation > 0) {
    const a = ((sun.azimuth - 90) * Math.PI) / 180;
    const r = rOuter + 26;
    svgEl('circle', { cx: cx + r * Math.cos(a), cy: cy + r * Math.sin(a), r: 5, fill: '#fbbf24' }, svg);
    text(svg, cx + r * Math.cos(a), cy + r * Math.sin(a) + 15, `${Math.round(sun.elevation)}°`, {
      size: 8, anchor: 'middle', fill: '#fbbf24',
    });
  }
}

/* ---------- 5. the year, week by week ---------- */
export function renderClimateYear(container, weeks, { width = 760, todayDoy, label }) {
  const height = 190;
  const pad = { l: 34, r: 34, t: 16, b: 30 };
  const svg = frame(container, width, height, label);
  const plotW = width - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;
  const valid = weeks.filter(Boolean);
  if (!valid.length) return;

  const lo = Math.floor(Math.min(...valid.map((w) => w.tminP10)) - 2);
  const hi = Math.ceil(Math.max(...valid.map((w) => w.tmaxP90)) + 2);
  const x = (w) => pad.l + ((w - 1) / 51) * plotW;
  const y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * plotH;

  for (let v = Math.ceil(lo / 10) * 10; v <= hi; v += 10) {
    svgEl('line', { x1: pad.l, y1: y(v), x2: width - pad.r, y2: y(v), stroke: v === 0 ? 'rgba(251,191,36,.35)' : GRID, 'stroke-dasharray': v === 0 ? '4 4' : 'none' }, svg);
    text(svg, pad.l - 6, y(v) + 3.5, `${dec(v, 0)}°`, { size: 9, anchor: 'end' });
  }

  /* p10–p90 envelope, then the median day/night band on top of it. */
  const band = (upper, lower, fill) => {
    const up = valid.map((w) => `${x(w.week)} ${y(upper(w))}`);
    const dn = [...valid].reverse().map((w) => `${x(w.week)} ${y(lower(w))}`);
    svgEl('path', { d: `M ${[...up, ...dn].join(' L ')} Z`, fill, stroke: 'none' }, svg);
  };
  band((w) => w.tmaxP90, (w) => w.tminP10, 'rgba(79,209,255,.12)');
  band((w) => w.tmax, (w) => w.tmin, 'rgba(79,209,255,.30)');

  const line = (pick, stroke, dash) => svgEl('polyline', {
    points: valid.map((w) => `${x(w.week)},${y(pick(w))}`).join(' '),
    fill: 'none', stroke, 'stroke-width': 1.8, 'stroke-dasharray': dash ?? 'none', 'stroke-linejoin': 'round',
  }, svg);
  line((w) => w.tmax, '#4fd1ff');
  line((w) => w.tmin, '#a78bfa');

  /* Snow weeks along the bottom, so the season is visible at a glance. */
  const maxSnow = Math.max(1, ...valid.map((w) => w.snow));
  valid.forEach((w) => {
    if (w.snow < 0.5) return;
    const h = (w.snow / maxSnow) * (plotH * 0.28);
    svgEl('rect', {
      x: x(w.week) - plotW / 104, y: pad.t + plotH - h, width: Math.max(2, plotW / 52 - 1), height: h,
      fill: 'rgba(224,242,254,.5)', rx: 1,
    }, svg);
  });

  /* Month ticks. */
  const monthStarts = [1, 5, 9, 14, 18, 23, 27, 31, 36, 40, 44, 49];
  monthStarts.forEach((w, i) => {
    text(svg, x(w), height - pad.b + 14, t(`month.${i}`), { size: 8.5, anchor: 'middle', fill: '#66717f', mono: false });
  });

  /* A full-height column per week, invisible but hoverable: the bars alone are
     too small a target and the temperature band has no marks to aim at. */
  valid.forEach((w) => {
    const hit = svgEl('rect', {
      x: x(w.week) - plotW / 104, y: pad.t, width: Math.max(3, plotW / 52),
      height: plotH, fill: 'transparent',
    }, svg);
    hoverable(hit, tipTitle(t('climate.tip.week', { n: w.week }))
      + tipRow(t('climate.tip.day'), `${dec(w.tmax, 0)}°`)
      + tipRow(t('climate.tip.night'), `${dec(w.tmin, 0)}°`)
      + tipRow(t('climate.tip.wind'), `${dec(w.wind, 0)} m/s`)
      + tipRow(t('climate.tip.snow'), `${dec(w.snow, 0)} cm`));
  });

  if (Number.isFinite(todayDoy)) {
    const week = clamp(Math.ceil(todayDoy / 7), 1, 52);
    svgEl('line', { x1: x(week), y1: pad.t, x2: x(week), y2: pad.t + plotH, stroke: 'rgba(255,255,255,.75)', 'stroke-width': 1.5 }, svg);
    text(svg, x(week), pad.t - 4, t('climate.now'), { size: 8, anchor: 'middle', fill: '#fff', weight: 700, tracking: 1 });
  }
}


/* ---------- the warming page ---------- */

/**
 * One winter metric from 1950 to 2050: the spread across models as a band, the
 * model median as a line, and the observed record over the top of it.
 *
 * The band is the point of the chart. Seven models disagree by a wide margin
 * about any single winter, and drawing only the median would hide exactly the
 * uncertainty a reader needs in order to judge how much to believe the line.
 */
export function renderWarmingTrend(container, { rows, observed, metric, unit, threshold, thresholdLabel, label, width = 860 }) {
  const height = 300;
  const pad = { l: 44, r: 16, t: 18, b: 34 };
  const svg = frame(container, width, height, label);
  const plotW = width - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;
  const valid = rows.filter((r) => Number.isFinite(r[metric]));
  if (!valid.length) return;

  const obs = (observed ?? []).filter((r) => Number.isFinite(r[metric]));
  const all = [
    ...valid.flatMap((r) => [r[`${metric}Lo`], r[`${metric}Hi`], r[metric]]),
    ...obs.map((r) => r[metric]),
    threshold,
  ].filter(Number.isFinite);
  const lo = Math.min(0, Math.floor(Math.min(...all)));
  const hi = Math.ceil(Math.max(...all) * 1.05);
  const x0 = valid[0].winter;
  const x1 = valid[valid.length - 1].winter;
  const x = (w) => pad.l + ((w - x0) / (x1 - x0)) * plotW;
  const y = (v) => pad.t + (1 - (v - lo) / (hi - lo || 1)) * plotH;

  /* horizontal grid */
  const step = niceStep(hi - lo);
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
    svgEl('line', { x1: pad.l, y1: y(v), x2: width - pad.r, y2: y(v), stroke: GRID }, svg);
    text(svg, pad.l - 6, y(v) + 3.5, `${dec(v, 0)}`, { size: 9, anchor: 'end' });
  }
  if (unit) text(svg, pad.l - 6, pad.t - 6, unit, { size: 8.5, anchor: 'end', tracking: 0.5 });

  /* where the projection takes over from the models' historical runs */
  const split = 2015;
  if (split > x0 && split < x1) {
    svgEl('line', { x1: x(split), y1: pad.t, x2: x(split), y2: pad.t + plotH, stroke: 'rgba(255,255,255,.22)', 'stroke-dasharray': '3 4' }, svg);
    text(svg, x(split) + 4, pad.t + 10, t('warm.chart.projected'), { size: 8, fill: '#8b95a5', tracking: 0.5 });
  }

  /* model spread */
  const up = valid.map((r) => `${x(r.winter)} ${y(r[`${metric}Hi`])}`);
  const dn = [...valid].reverse().map((r) => `${x(r.winter)} ${y(r[`${metric}Lo`])}`);
  svgEl('path', { d: `M ${[...up, ...dn].join(' L ')} Z`, fill: 'rgba(167,139,250,.16)', stroke: 'none' }, svg);

  /* the threshold that makes the metric mean something */
  if (Number.isFinite(threshold) && threshold > lo && threshold < hi) {
    svgEl('line', { x1: pad.l, y1: y(threshold), x2: width - pad.r, y2: y(threshold), stroke: 'rgba(251,191,36,.6)', 'stroke-width': 1.2, 'stroke-dasharray': '5 4' }, svg);
    if (thresholdLabel) text(svg, width - pad.r, y(threshold) - 5, thresholdLabel, { size: 8.5, anchor: 'end', fill: '#fbbf24', mono: false });
  }

  const line = (pts, stroke, w2, dash) => svgEl('polyline', {
    points: pts.join(' '), fill: 'none', stroke, 'stroke-width': w2,
    'stroke-dasharray': dash ?? 'none', 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
  }, svg);

  /* the raw year-to-year median, faint, so the noise is visible at all */
  line(valid.map((r) => `${x(r.winter)},${y(r[metric])}`), 'rgba(167,139,250,.45)', 1);

  /* smoothed median and smoothed observation */
  const smoothed = runningMean(valid.map((r) => [r.winter, r[metric]]), 15);
  line(smoothed.map(([w, v]) => `${x(w)},${y(v)}`), '#a78bfa', 2.4);
  if (obs.length >= 15) {
    const so = runningMean(obs.map((r) => [r.winter, r[metric]]), 15);
    line(so.map(([w, v]) => `${x(w)},${y(v)}`), '#4fd1ff', 2.4);
  }

  /* decade ticks */
  for (let w = Math.ceil(x0 / 20) * 20; w <= x1; w += 20) {
    text(svg, x(w), height - pad.b + 16, String(w), { size: 9, anchor: 'middle' });
  }

  key(container, [
    ['#4fd1ff', t('warm.key.observed')],
    ['#a78bfa', t('warm.key.models')],
    ['rgba(167,139,250,.35)', t('warm.key.spread'), 'block'],
  ]);
}

/** A round-ish axis step for a given range. */
function niceStep(range) {
  const raw = range / 5;
  const mag = 10 ** Math.floor(Math.log10(Math.max(raw, 1e-6)));
  return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((v) => v >= raw) ?? mag * 10;
}

/** Centred running mean over [x, y] pairs. */
function runningMean(pts, window) {
  const half = Math.floor(window / 2);
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const slice = pts.slice(Math.max(0, i - half), i + half + 1).map((p) => p[1]).filter(Number.isFinite);
    if (slice.length >= half) out.push([pts[i][0], slice.reduce((a, b) => a + b, 0) / slice.length]);
  }
  return out;
}

/**
 * The elevation staircase: the same metric at every band, for three periods.
 *
 * Everything about Åre's exposure is in the shape of this chart. The village and
 * the summit are 1040 m apart, which is most of a climate zone, and they do not
 * lose their winter on the same schedule — a single number for "Åre" would hide
 * the only part of the answer that can be acted on.
 */
export function renderStaircase(container, bands, { threshold, thresholdLabel, unit, label, width = 860 }) {
  const rows = [...bands].reverse();                      // summit at the top
  const rowH = 46;
  const pad = { l: 62, r: 20, t: 26, b: 30 };
  const height = pad.t + pad.b + rows.length * rowH;
  const svg = frame(container, width, height, label);
  const plotW = width - pad.l - pad.r;

  const vals = rows.flatMap((b) => b.periods.map((p) => p.value)).filter(Number.isFinite);
  if (!vals.length) return;
  const hi = Math.max(Math.ceil(Math.max(...vals, threshold ?? 0) / 20) * 20, 20);
  const x = (v) => pad.l + (v / hi) * plotW;

  const COLORS = { past: 'rgba(224,242,254,.45)', present: '#4fd1ff', future: '#f472b6' };

  const step = niceStep(hi);
  for (let v = 0; v <= hi; v += step) {
    svgEl('line', { x1: x(v), y1: pad.t - 6, x2: x(v), y2: height - pad.b + 2, stroke: GRID }, svg);
    text(svg, x(v), height - pad.b + 16, `${dec(v, 0)}`, { size: 9, anchor: 'middle' });
  }
  if (unit) text(svg, width - pad.r, pad.t - 12, unit, { size: 8.5, anchor: 'end', tracking: 0.5 });

  if (Number.isFinite(threshold) && threshold <= hi) {
    svgEl('line', { x1: x(threshold), y1: pad.t - 10, x2: x(threshold), y2: height - pad.b + 2, stroke: 'rgba(251,191,36,.7)', 'stroke-width': 1.4, 'stroke-dasharray': '5 4' }, svg);
    if (thresholdLabel) text(svg, x(threshold), pad.t - 14, thresholdLabel, { size: 8.5, anchor: 'middle', fill: '#fbbf24', mono: false });
  }

  rows.forEach((band, i) => {
    const top = pad.t + i * rowH;
    text(svg, pad.l - 10, top + rowH / 2 + 3.5, `${band.z} m`, { size: 10, anchor: 'end', fill: '#c3ccd8' });
    const barH = 8;
    band.periods.forEach((p, k) => {
      const yy = top + 6 + k * (barH + 3);
      svgEl('rect', { x: pad.l, y: yy, width: plotW, height: barH, fill: 'rgba(255,255,255,.04)', rx: 3 }, svg);
      if (!Number.isFinite(p.value)) return;
      const end = x(p.value);
      svgEl('rect', { x: pad.l, y: yy, width: Math.max(2, end - pad.l), height: barH, fill: COLORS[p.id], rx: 3 }, svg);
      /* The bar itself is 8px tall, which is not a hit target. The hoverable is
         a transparent band across the whole row-slot instead. */
      const hit = svgEl('rect', { x: pad.l, y: yy - 2, width: plotW, height: barH + 4, fill: 'transparent' }, svg);
      hoverable(hit, tipTitle(`${band.z} m · ${t(`warm.period.${p.id}`)}`)
        + tipRow(unit ?? '', dec(p.value, 0))
        + (Number.isFinite(threshold) ? tipRow(t('warm.tip.threshold'), dec(threshold, 0)) : ''));
      /* The label sits after the bar while there is room for it, and moves
         inside the bar's own end once the bar runs close to the axis. */
      const outside = end + 30 < width - pad.r;
      text(svg, outside ? end + 6 : end - 5, yy + barH - 0.5, dec(p.value, 0),
        { size: 8.5, anchor: outside ? 'start' : 'end', fill: outside ? '#8b95a5' : inkOn(COLORS[p.id]), weight: outside ? 400 : 600 });
    });
  });

  key(container, [
    [COLORS.past, t('warm.period.past'), 'block'],
    [COLORS.present, t('warm.period.present'), 'block'],
    [COLORS.future, t('warm.period.future'), 'block'],
  ]);
}


/* ---------- the outlook page ---------- */

/**
 * Every ensemble member as its own line, with the quantile bands behind them.
 *
 * The spaghetti is the point. A shaded band alone reads as a smooth cone of
 * uncertainty; the lines show what the band is actually made of — often two
 * clusters rather than a spread, which is a different forecast entirely and one
 * a p10-p90 ribbon hides completely.
 */
export function renderFan(container, { fan, lines, unit, label, zero = false, width = 860 }) {
  const height = 260;
  const pad = { l: 42, r: 16, t: 18, b: 34 };
  const svg = frame(container, width, height, label);
  const plotW = width - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;
  const valid = fan.filter((d) => Number.isFinite(d.q[0.5]));
  if (valid.length < 2) return;

  const all = [
    ...fan.flatMap((d) => Object.values(d.q)),
    ...lines.flatMap((l) => l.values),
  ].filter(Number.isFinite);
  const lo = Math.min(zero ? 0 : Infinity, Math.min(...all));
  const hi = Math.max(...all);
  const padY = Math.max(1, (hi - lo) * 0.12);
  const y0 = lo - padY;
  const y1 = hi + padY;
  const x = (i) => pad.l + (fan.length === 1 ? plotW / 2 : (i / (fan.length - 1)) * plotW);
  const y = (v) => pad.t + (1 - (v - y0) / (y1 - y0 || 1)) * plotH;

  const step = niceStep(y1 - y0);
  for (let v = Math.ceil(y0 / step) * step; v <= y1; v += step) {
    const isZero = Math.abs(v) < 1e-9;
    svgEl('line', {
      x1: pad.l, y1: y(v), x2: width - pad.r, y2: y(v),
      stroke: isZero ? 'rgba(251,191,36,.35)' : GRID, 'stroke-dasharray': isZero ? '4 4' : 'none',
    }, svg);
    text(svg, pad.l - 6, y(v) + 3.5, `${dec(v, 0)}`, { size: 9, anchor: 'end' });
  }
  if (unit) text(svg, pad.l - 6, pad.t - 6, unit, { size: 8.5, anchor: 'end', tracking: 0.5 });

  const ribbon = (a, b, fill) => {
    const up = fan.map((d, i) => `${x(i)} ${y(d.q[a])}`);
    const dn = [...fan].reverse().map((d, i) => `${x(fan.length - 1 - i)} ${y(d.q[b])}`);
    svgEl('path', { d: `M ${[...up, ...dn].join(' L ')} Z`, fill, stroke: 'none' }, svg);
  };
  ribbon(0.9, 0.1, 'rgba(79,209,255,.13)');
  ribbon(0.75, 0.25, 'rgba(79,209,255,.22)');

  /* one faint line per member */
  for (const l of lines) {
    const pts = l.values.map((v, i) => (Number.isFinite(v) ? `${x(i)},${y(v)}` : null)).filter(Boolean);
    if (pts.length < 2) continue;
    svgEl('polyline', {
      points: pts.join(' '), fill: 'none', stroke: 'rgba(224,242,254,.42)',
      'stroke-width': 1, 'stroke-linejoin': 'round',
    }, svg);
  }

  svgEl('polyline', {
    points: fan.map((d, i) => `${x(i)},${y(d.q[0.5])}`).join(' '),
    fill: 'none', stroke: '#4fd1ff', 'stroke-width': 2.4, 'stroke-linejoin': 'round',
  }, svg);

  const colW = fan.length > 1 ? plotW / (fan.length - 1) : plotW;
  fan.forEach((d, i) => {
    const when = parseLocal(`${d.date}T12:00`);
    if (when) text(svg, x(i), height - pad.b + 16, fmtShortDay(when), { size: 8.5, anchor: 'middle', mono: false });
    /* A hit column per day, so the distribution can be read at the point rather
       than estimated off the ribbon edges. */
    const hit = svgEl('rect', {
      x: x(i) - colW / 2, y: pad.t, width: colW, height: plotH, fill: 'transparent',
    }, svg);
    const u = unit ? ` ${unit}` : '';
    hoverable(hit, tipTitle(when ? fmtShortDay(when) : d.date)
      + tipRow(t('out.tip.p90'), `${dec(d.q[0.9], 1)}${u}`)
      + tipRow(t('out.tip.median'), `${dec(d.q[0.5], 1)}${u}`)
      + tipRow(t('out.tip.p10'), `${dec(d.q[0.1], 1)}${u}`)
      + tipRow(t('out.tip.members'), d.n));
  });

  key(container, [
    ['#4fd1ff', t('out.key.median')],
    ['rgba(79,209,255,.22)', t('out.key.middle'), 'block'],
    ['rgba(79,209,255,.13)', t('out.key.outer'), 'block'],
    ['rgba(224,242,254,.55)', t('out.key.members', { n: lines.length })],
  ]);
}

/** Probability shading: white-blue for the good events, amber-rose for the bad. */
function probColor(p, kind) {
  if (!Number.isFinite(p)) return 'rgba(255,255,255,.04)';
  const a = 0.06 + p * 0.72;
  if (kind === 'bad') return `rgba(251,113,133,${a.toFixed(3)})`;
  if (kind === 'cold') return `rgba(167,139,250,${a.toFixed(3)})`;
  return `rgba(79,209,255,${a.toFixed(3)})`;
}

/**
 * Events down the side, days across the top, probability in the cell.
 *
 * The number is printed in every cell rather than left to the shading: a colour
 * ramp is quick to scan but is read differently by different people, and the
 * difference between 20 % and 40 % is the whole decision.
 */
export function renderEventGrid(container, { days, events, label, onPick, selected, width = 860 }) {
  container.textContent = '';
  if (!days.length) return;
  const rowH = 40;
  const pad = { l: 168, r: 8, t: 34, b: 8 };
  const height = pad.t + pad.b + events.length * rowH;
  const svg = frame(container, width, height, label);
  const colW = (width - pad.l - pad.r) / days.length;

  days.forEach((d, i) => {
    const cx = pad.l + i * colW + colW / 2;
    if (d.when) {
      text(svg, cx, pad.t - 18, fmtShortDay(d.when), { size: 9.5, anchor: 'middle', fill: '#c3ccd8', mono: false, weight: 600 });
      text(svg, cx, pad.t - 7, t('out.grid.members', { n: d.members }), { size: 7.5, anchor: 'middle', fill: '#66717f' });
    }
    if (d.date === selected) {
      svgEl('rect', {
        x: pad.l + i * colW + 1, y: pad.t - 30, width: colW - 2, height: height - pad.t - pad.b + 30,
        fill: 'none', stroke: 'rgba(255,255,255,.35)', 'stroke-width': 1.2, rx: 8,
      }, svg);
    }
  });

  events.forEach((e, r) => {
    const yy = pad.t + r * rowH;
    text(svg, pad.l - 12, yy + rowH / 2 + 1, t(`out.event.${e.id}`), { size: 10.5, anchor: 'end', fill: '#e6edf5', mono: false, weight: 550 });
    text(svg, pad.l - 12, yy + rowH / 2 + 13, t(`out.event.${e.id}.short`), { size: 8, anchor: 'end', fill: '#66717f', mono: false });
    days.forEach((d, i) => {
      const p = d.events[e.id];
      const cell = svgEl('rect', {
        x: pad.l + i * colW + 2, y: yy + 3, width: colW - 4, height: rowH - 6,
        fill: probColor(p, e.kind), rx: 7, role: onPick ? 'button' : null,
        style: onPick ? 'cursor:pointer' : null,
      }, svg);
      if (onPick) cell.addEventListener('click', () => onPick(d.date));
      hoverable(cell, tipTitle(`${t(`out.event.${e.id}`)} · ${d.when ? fmtShortDay(d.when) : d.date}`)
        + tipRow(t(`out.event.${e.id}.short`), p === null ? '–' : `${Math.round(p * 100)}%`)
        + (p === null ? '' : tipRow(t('out.tip.members'), t('out.tip.outOf', { k: Math.round(p * d.members), n: d.members }))));
      const shown = p === null ? '–' : `${Math.round(p * 100)}%`;
      text(svg, pad.l + i * colW + colW / 2, yy + rowH / 2 + 4, shown, {
        size: 11, anchor: 'middle', weight: 600,
        fill: Number.isFinite(p) && p > 0.55 ? '#06080b' : '#e6edf5',
      });
    });
  });
}
