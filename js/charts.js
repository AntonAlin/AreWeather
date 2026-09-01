/* Hand-rolled SVG visualisation. No chart library: every mark here needs to
   know about elevation, phase or wind, and generic charting tools fight that. */

import { svgEl, tempColor, windColor, precipColor, clamp, lerp, fmtHour, fmtShortDay, fmtWind, compass, dec } from './util.js';
import { t } from './i18n.js';

const AXIS = '#66717f';
const GRID = 'rgba(255,255,255,.10)';

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
      svgEl('rect', {
        x: xOf(i) + 1, y: yOf(z) + 1, width: cw - 2, height: ch - 2, rx: 4,
        fill: fill(band), opacity: h.daylight ? 1 : 0.86,
      }, cells);
      if (metric !== 'precip' && Number.isFinite(value(band)) && (cw >= 26 || h.hour % 2 === 0)) {
        const v = metric === 'wind' ? fmtWind(band.wind, unit) : dec(value(band), 0);
        text(cells, xOf(i) + cw / 2, yOf(z) + ch / 2 + 3.2, String(v), {
          size: 9, anchor: 'middle', fill: 'rgba(255,255,255,.86)', weight: 500,
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
    svgEl('line', { x1: pad.l, y1: y(z), x2: width - pad.r, y2: y(z), stroke: GRID, 'stroke-width': 1, 'stroke-dasharray': '2 5' }, svg);
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
      'stroke-dasharray': temp === 0 ? '4 4' : '2 6',
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

  const colourFor = (a) => {
    if (lens === 'loading') {
      if (!a.loading) return 'rgba(255,255,255,.05)';
      return rampColour(a.loading / 100);
    }
    if (lens === 'sun') {
      const s = clamp(a.sun / 0.6, 0, 1);
      return s < 0.03 ? 'rgba(255,255,255,.05)' : `rgba(251,191,36,${0.12 + s * 0.72})`;
    }
    return windColor(a.wind);
  };
  const rampColour = (f) => {
    const c = (a, b) => Math.round(lerp(a, b, clamp(f, 0, 1)));
    return `rgb(${c(30, 251)},${c(58, 113)},${c(95, 133)})`;
  };

  const arc = (from, to, r0, r1) => {
    const a0 = ((from - 90) * Math.PI) / 180;
    const a1 = ((to - 90) * Math.PI) / 180;
    const p = (r, a) => `${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`;
    return `M ${p(r0, a0)} L ${p(r1, a0)} A ${r1} ${r1} 0 0 1 ${p(r1, a1)} L ${p(r0, a1)} A ${r0} ${r0} 0 0 0 ${p(r0, a0)} Z`;
  };

  aspects.forEach((a) => {
    const half = 22.5;
    svgEl('path', {
      d: arc(a.bearing - half, a.bearing + half, rInner, rOuter),
      fill: colourFor(a),
      stroke: 'rgba(6,8,11,.85)',
      'stroke-width': 2,
    }, svg);
    const mid = ((a.bearing - 90) * Math.PI) / 180;
    const rLabel = (rInner + rOuter) / 2;
    const value = lens === 'loading' ? String(a.loading)
      : lens === 'sun' ? `${Math.round(clamp(a.sun / 0.6, 0, 1) * 100)}`
        : fmtWind(a.wind, unit);
    text(svg, cx + rLabel * Math.cos(mid), cy + rLabel * Math.sin(mid) + 3.5, value, {
      size: 10, anchor: 'middle', fill: 'rgba(255,255,255,.92)', weight: 600,
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
    svgEl('line', { x1: pad.l, y1: y(v), x2: width - pad.r, y2: y(v), stroke: v === 0 ? 'rgba(251,191,36,.35)' : GRID, 'stroke-dasharray': v === 0 ? '4 4' : '2 6' }, svg);
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

  if (Number.isFinite(todayDoy)) {
    const week = clamp(Math.ceil(todayDoy / 7), 1, 52);
    svgEl('line', { x1: x(week), y1: pad.t, x2: x(week), y2: pad.t + plotH, stroke: 'rgba(255,255,255,.75)', 'stroke-width': 1.5 }, svg);
    text(svg, x(week), pad.t - 4, t('climate.now'), { size: 8, anchor: 'middle', fill: '#fff', weight: 700, tracking: 1 });
  }
}
