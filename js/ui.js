/* Panel rendering. Everything reads from the assembled forecast model; nothing
   here recomputes meteorology. */

import { el, $, round, fmtWind, windUnitLabel, compass, fmtClock, scoreColor, rampCss, wmoLabel, TEMP_STOPS, WIND_STOPS, ago } from './util.js';
import { bestWindow } from './forecast.js';
import { MOUNTAINS } from './config.js';

/* ---------- mountain rail ---------- */
export function renderRail(node, activeId, onPick) {
  node.textContent = '';
  for (const m of MOUNTAINS) {
    const b = el('button', { class: `mtn-chip${m.id === activeId ? ' on' : ''}`, type: 'button' }, node);
    el('span', { class: 'n', text: m.name }, b);
    el('span', { class: 'e', text: `${m.summit} m` }, b);
    b.addEventListener('click', () => onPick(m.id));
    if (m.id === activeId) requestAnimationFrame(() => b.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }));
  }
}

/* ---------- hero ---------- */
export function renderHero(node, model, state) {
  const h = model.hours[state.selected] ?? model.hours[0];
  const s = h.summit;
  const { unit } = state;
  const u = windUnitLabel(unit);
  node.textContent = '';
  const grid = el('div', { class: 'hero-grid reveal' }, node);
  const main = el('div', { class: 'hero-main' }, grid);

  const eyebrow = el('div', { class: 'hero-eyebrow' }, main);
  el('span', { class: 'tag', text: wmoLabel(h.weatherCode) ?? model.mtn.tags[0] }, eyebrow);
  el('span', { text: '·' }, eyebrow);
  el('span', { text: state.selected === state.nowIndex ? 'Now' : `${h.time.getHours()}:00 ${h.time.toDateString().slice(0, 3)}` }, eyebrow);
  el('span', { text: '·' }, eyebrow);
  el('span', { text: `${model.modelKeys.length} models`, title: model.modelKeys.join(', ') }, eyebrow);

  el('h1', { text: model.mtn.name }, main);
  const meta = el('p', { class: 'hero-meta' }, main);
  meta.innerHTML = `<span class="num">${model.mtn.summit}&nbsp;m</span> summit · <span class="num">${model.mtn.summit - model.mtn.base}&nbsp;m</span> of vertical from the valley · <span class="num">${model.mtn.lat.toFixed(3)}°N ${model.mtn.lon.toFixed(3)}°E</span>`;

  const now = el('div', { class: 'hero-now' }, main);
  const temp = el('div', { class: 'big-temp' }, now);
  temp.innerHTML = `${Number.isFinite(s.temp) ? Math.round(s.temp) : '–'}<sup>°C</sup>`;
  temp.style.color = 'transparent';
  temp.style.backgroundImage = 'linear-gradient(160deg,#fff,#9fd8ff)';
  temp.style.webkitBackgroundClip = 'text';
  temp.style.backgroundClip = 'text';

  const facts = el('div', { class: 'now-facts' }, now);
  const fact = (k, v, sub) => {
    const f = el('div', { class: 'fact' }, facts);
    el('div', { class: 'k', text: k }, f);
    const val = el('div', { class: 'v' }, f);
    val.innerHTML = sub ? `${v} <small>${sub}</small>` : v;
  };
  fact('Feels like', `${Number.isFinite(s.feels) ? Math.round(s.feels) : '–'}°`);
  fact('Wind', fmtWind(s.wind, unit), `${u} ${compass(s.dir)}`);
  fact('Gusts', fmtWind(s.gust, unit), u);
  fact('Humidity', `${Math.round(s.rh)}`, '%');
  if (h.newSnow24 > 0.4) fact('New snow 24 h', `${round(h.newSnow24, 1)}`, 'cm');
  else fact('Precip 24 h', `${round(h.precip24, 1)}`, 'mm');

  el('p', { class: 'hero-summary', html: summaryLine(model, h, unit) }, main);

  /* verdicts */
  const side = el('div', { class: 'hero-side' }, grid);
  verdictCard(side, 'Trail running', h.trail, model, 'trail', state);
  verdictCard(side, 'Ski mountaineering', h.skimo, model, 'skimo', state);
}

function verdictCard(parent, name, v, model, key, state) {
  const c = el('div', { class: 'verdict' }, parent);
  const top = el('div', { class: 'verdict-top' }, c);
  el('div', { class: 'verdict-name', text: name }, top);
  const score = el('div', { class: 'verdict-score num', text: v.score }, top);
  score.style.color = scoreColor(v.score);
  const bar = el('div', { class: 'verdict-bar' }, c);
  const fill = el('i', {}, bar);
  fill.style.width = `${v.score}%`;
  fill.style.background = scoreColor(v.score);
  const t = el('div', { class: 'verdict-text' }, c);
  t.innerHTML = `<b>${v.label}</b>${v.why.length ? ` — limited by ${v.why.join(', ')}` : ' — nothing holding you back'}`;

  const win = bestWindow(model.hours.slice(state.nowIndex), key, { len: 4, within: 48 });
  if (win) {
    const strip = el('div', { class: 'window-strip' }, c);
    const pool = model.hours.slice(state.nowIndex, state.nowIndex + 48);
    const stepN = Math.max(1, Math.round(pool.length / 24));
    for (let i = 0; i < pool.length; i += stepN) {
      const chunk = pool.slice(i, i + stepN);
      const avg = chunk.reduce((a, x) => a + x[key].score, 0) / chunk.length;
      const cell = el('i', {}, strip);
      const inner = el('span', {}, cell);
      inner.style.background = scoreColor(avg);
      inner.style.opacity = chunk[0].daylight ? '.95' : '.35';
      cell.title = `${chunk[0].time.getHours()}:00 — score ${Math.round(avg)}${chunk[0].daylight ? '' : ' (dark)'}`;
    }
    const lg = el('div', { class: 'window-legend' }, c);
    el('span', { text: 'next 48 h' }, lg);
    el('span', { text: `best window ${fmtClock(win.start)}–${fmtClock(win.end)} ${win.start.toDateString().slice(0, 3)} · ${Math.round(win.score)}` }, lg);
  }
}

function summaryLine(model, h, unit) {
  const s = h.summit;
  const u = windUnitLabel(unit);
  const bits = [];
  bits.push(`Summit <b>${Math.round(s.temp)}°</b> with <b>${fmtWind(s.wind, unit)} ${u}</b> from the ${compass(s.dir)}, feeling like <b>${Math.round(s.feels)}°</b>.`);
  if (h.inversion) bits.push('An <b>inversion</b> is in place — the summit is warmer than the valley, so cold air is pooling below you.');
  else if (Number.isFinite(h.lapse)) bits.push(`Lapse rate <b>${round(h.lapse, 1)}°/100 m</b>, so the valley sits near ${Math.round(h.valley.temp)}°.`);
  if (Number.isFinite(h.snowLine)) bits.push(`Snow line at <b>${Math.round(h.snowLine / 10) * 10} m</b>.`);
  else if (h.precip24 > 1) bits.push(h.summit.phase === 'snow' ? 'Everything is falling as snow.' : 'Everything is falling as rain.');
  if (h.newSnow24 > 1) bits.push(`<b>${round(h.newSnow24, 1)} cm</b> of new snow in the last 24 h.`);
  if (h.summitInCloud) bits.push('The summit is <b>in cloud</b>.');
  if (h.drift > 40) bits.push(`Wind is actively <b>loading lee slopes</b> (index ${h.drift}).`);
  return bits.join(' ');
}

/* ---------- intel ---------- */
export function renderIntel(node, model, state) {
  const h = model.hours[state.selected] ?? model.hours[0];
  const { unit } = state;
  const u = windUnitLabel(unit);
  node.textContent = '';
  const card = (k, v, sub, tone = '') => {
    const c = el('div', { class: `intel ${tone}` }, node);
    el('div', { class: 'k', text: k }, c);
    el('div', { class: 'v', html: v }, c);
    if (sub) el('div', { class: 'd', html: sub }, c);
  };

  const fl = h.freezingLevel;
  card('Freezing level', Number.isFinite(fl) ? `${Math.round(fl / 10) * 10}<small> m</small>` : '–',
    Number.isFinite(fl) ? (fl < model.mtn.summit ? `${Math.round(model.mtn.summit - fl)} m of the mountain is below freezing` : 'Whole mountain above freezing') : 'Not reported by the high-res models',
    Number.isFinite(fl) && fl < model.mtn.base ? 'good' : '');

  card('Snow line', Number.isFinite(h.snowLine) ? `${Math.round(h.snowLine / 10) * 10}<small> m</small>` : (h.summit.phase === 'snow' ? 'Below base' : '–'),
    'Wet-bulb crossing, not air temperature');

  card('Cloud base', Number.isFinite(h.cloudBase) ? `${Math.round(h.cloudBase / 10) * 10}<small> m</small>` : '–',
    h.summitInCloud ? 'Summit is in cloud — expect flat light' : 'Summit is clear of cloud',
    h.summitInCloud ? 'warn' : 'good');

  const chill = h.summit.feels;
  card('Wind chill', Number.isFinite(chill) ? `${Math.round(chill)}<small>°</small>` : '–',
    chill < -25 ? 'Frostbite in minutes on exposed skin' : chill < -12 ? 'Cover everything' : 'Manageable with normal layers',
    chill < -25 ? 'danger' : chill < -12 ? 'warn' : '');

  card('Summit wind', `${fmtWind(h.summit.wind, unit)}<small> ${u}</small>`,
    `Gusting ${fmtWind(h.summit.gust, unit)} ${u} from the ${compass(h.summit.dir)}`,
    h.summit.gust > 25 ? 'danger' : h.summit.wind > 15 ? 'warn' : '');

  card('Wind loading', `${h.drift}<small>/100</small>`,
    h.drift > 60 ? 'Active transport onto lee slopes' : h.drift > 25 ? 'Some transport of loose snow' : 'Little or no snow moving',
    h.drift > 60 ? 'danger' : h.drift > 25 ? 'warn' : '');

  card('Lapse rate', Number.isFinite(h.lapse) ? `${round(h.lapse, 1)}<small>°/100 m</small>` : '–',
    h.inversion ? 'Inversion — valley colder than the summit' : h.haveSounding ? 'From the model sounding' : 'Standard fallback (no sounding)',
    h.inversion ? 'warn' : '');

  card('New snow 24 h', `${round(h.newSnow24, 1)}<small> cm</small>`,
    `${round(h.precip24, 1)} mm total water · ratio ${Math.round(h.newSnow24 > 0 ? (h.newSnow24 * 10) / Math.max(0.1, h.precip24) : 10)}:1`,
    h.newSnow24 > 20 ? 'warn' : h.newSnow24 > 5 ? 'good' : '');

  card('Chance of precip', h.pop !== null && Number.isFinite(h.pop) ? `${Math.round(h.pop * 100)}<small>%</small>` : '–',
    model.ml?.precip?.use ? 'Calibrated against reanalysis' : 'Share of models with measurable precipitation');

  if (Number.isFinite(h.visibility)) {
    card('Visibility', h.visibility >= 20000 ? '20+<small> km</small>' : `${round(h.visibility / 1000, 1)}<small> km</small>`, 'Model horizontal visibility',
      h.visibility < 1000 ? 'danger' : h.visibility < 5000 ? 'warn' : 'good');
  }
  if (Number.isFinite(h.snowDepth)) {
    card('Snow depth', `${Math.round(h.snowDepth * 100)}<small> cm</small>`, 'Modelled cover at summit height', h.snowDepth > 0.4 ? 'good' : h.snowDepth < 0.05 ? '' : 'warn');
  }
  card('Model spread', `±${round(h.spreadT / 2, 1)}<small>°</small>`,
    h.spreadT < 1.5 ? 'Models strongly agree — high confidence' : h.spreadT < 3.5 ? 'Normal disagreement' : 'Models disagree — treat this hour as uncertain',
    h.spreadT > 3.5 ? 'warn' : h.spreadT < 1.5 ? 'good' : '');

  if (Number.isFinite(h.cape) && h.cape > 200) {
    card('CAPE', `${Math.round(h.cape)}<small> J/kg</small>`, h.cape > 800 ? 'Thunderstorms likely — get off the ridge' : 'Some convective potential', h.cape > 800 ? 'danger' : 'warn');
  }
  const day = model.daily.find((d) => d.date === h.iso.slice(0, 10));
  if (day?.sunrise && day?.sunset) {
    card('Daylight', `${fmtClock(day.sunrise)}<small>–${fmtClock(day.sunset)}</small>`,
      `${round((day.sunset - day.sunrise) / 3.6e6, 1)} h of light${Number.isFinite(day.uv) ? ` · UV max ${round(day.uv, 1)}` : ''}`);
  }
}

/* ---------- models ---------- */
export function renderModels(node, model, state) {
  const h = model.hours[state.selected] ?? model.hours[0];
  node.textContent = '';
  const skill = model.ml?.skill ?? [];
  const rows = model.modelKeys.map((k) => {
    const meta = skill.find((s) => s.key === k);
    const p = h.per[k] ?? {};
    return { key: k, meta, weight: model.weights[k] ?? 0, t: p.t, w: p.ws, dir: p.wd };
  }).sort((a, b) => b.weight - a.weight);

  const maxW = Math.max(...rows.map((r) => r.weight), 0.01);
  for (const r of rows) {
    const row = el('div', { class: 'model-row' }, node);
    const name = el('div', { class: 'model-name' }, row);
    name.innerHTML = `${r.meta?.name ?? r.key}<small>${r.meta?.org ?? ''}${r.meta?.res ? ` · ${r.meta.res}` : ''}${Number.isFinite(r.meta?.maeT) ? ` · MAE ${round(r.meta.maeT, 2)}°` : ''}</small>`;
    el('div', { class: 'model-weight num', text: `${Math.round(r.weight * 100)}%` }, row);
    const track = el('div', { class: 'model-track' }, row);
    const bar = el('i', {}, track);
    bar.style.width = `${(r.weight / maxW) * 100}%`;
    const v = el('div', { class: 'model-val num' }, row);
    v.innerHTML = Number.isFinite(r.t)
      ? `${round(r.t, 1)}° <small>${fmtWind(r.w, state.unit)}</small>`
      : '<small>no data</small>';
  }

  const foot = el('p', { class: 'ml-note' }, node);
  foot.style.marginTop = '12px';
  foot.innerHTML = model.ml?.skill?.length
    ? `Weights are a softmax over each model's mean absolute temperature error against ${model.ml.truthModel === 'era5_land' ? 'ERA5-Land' : 'ERA5'} reanalysis at this exact point over ${model.ml.n} hours. Values shown are each model's raw forecast at ${h.time.getHours()}:00, before correction.`
    : 'Weights are falling back to resolution-based priors — the skill training has not completed for this peak yet.';
}

/* ---------- learning log ---------- */
export function renderML(node, model) {
  const ml = model.ml;
  node.textContent = '';
  const head = el('div', { class: 'ml-head' }, node);

  if (!ml) {
    el('span', { class: 'ml-badge', text: 'training…' }, head);
    el('p', { class: 'ml-note', text: 'Fetching 45 days of archived forecasts and reanalysis, then fitting the correction in this tab. The forecast above is already usable — it will quietly sharpen when this finishes.' }, node);
    return;
  }
  if (ml.insufficient) {
    el('span', { class: 'ml-badge no', text: 'not enough data' }, head);
    el('p', { class: 'ml-note', html: `Only <code>${ml.n}</code> usable hours came back from the archive for this point, below the 200 needed to fit anything trustworthy. The app is using resolution-based model priors and pure physics downscaling instead — which is the honest fallback, not a degraded one.` }, node);
    return;
  }

  const improved = ml.temp?.use;
  el('span', { class: `ml-badge ${improved ? 'ok' : 'no'}`, text: improved ? 'correction active' : 'correction disabled' }, head);
  el('span', { class: 'ml-note', text: `${ml.n} hours · ${ml.range?.start_date} → ${ml.range?.end_date} · truth: ${ml.truthModel === 'era5_land' ? 'ERA5-Land 9 km' : 'ERA5'}` }, head);

  const grid = el('div', { class: 'ml-metrics' }, node);
  const metric = (k, v, tone) => {
    const m = el('div', { class: 'ml-metric' }, grid);
    el('div', { class: 'k', text: k }, m);
    const val = el('div', { class: 'v', html: v }, m);
    if (tone) val.style.color = tone;
  };
  const s = ml.scores;
  metric('Raw ensemble MAE', `${round(s.rawMaeT, 2)}<small>°C</small>`);
  metric('Skill-weighted MAE', `${round(s.maeBaseT, 2)}<small>°C</small>`, s.maeBaseT < s.rawMaeT ? '#a3e635' : undefined);
  metric('After ML correction', `${round(s.maeMlT, 2)}<small>°C</small>`, improved ? '#a3e635' : '#fbbf24');
  if (Number.isFinite(s.maeBaseW)) metric('Wind MAE', `${round(s.maeBaseW, 2)} → ${Number.isFinite(s.maeMlW) ? round(s.maeMlW, 2) : '–'}<small> m/s</small>`, ml.wind?.use ? '#a3e635' : undefined);
  if (Number.isFinite(s.brierBase)) metric('Precip Brier', `${round(s.brierBase, 3)} → ${Number.isFinite(s.brierMl) ? round(s.brierMl, 3) : '–'}`, ml.precip?.use ? '#a3e635' : undefined);

  const gain = ((s.maeBaseT - s.maeMlT) / s.maeBaseT) * 100;
  const note = el('p', { class: 'ml-note' }, node);
  const top = ml.skill[0];
  note.innerHTML = improved
    ? `On a hold-out block of <code>${ml.nHold}</code> hours the correction never saw, it cut temperature error by <code>${round(gain, 1)}%</code>. Best single model here is <b>${top.name}</b> (${top.org}) at <code>${round(top.maeT, 2)}°C</code> MAE, carrying <code>${Math.round(top.weight * 100)}%</code> of the weight. The learned correction is applied at summit height and then propagated down the sounding.`
    : `The fitted correction did not beat the skill-weighted ensemble on the hold-out block (<code>${round(s.maeMlT, 2)}</code> vs <code>${round(s.maeBaseT, 2)}</code> °C), so it is switched off and you are seeing the weighted ensemble. That is the correct outcome to report — a model that cannot prove it helps should not be allowed to touch the forecast.`;

  const note2 = el('p', { class: 'ml-note' }, node);
  note2.style.marginTop = '8px';
  note2.innerHTML = `Reanalysis is a ~9 km grid estimate, not a summit weather station, so it captures systematic model bias rather than the last few hundred metres of local terrain effect. Retrains automatically every three days; weights live in this browser only.`;
}

/* ---------- legends and small parts ---------- */
export function renderLegend(node, metric, unit) {
  node.textContent = '';
  const scale = el('div', { class: 'scale' }, node);
  if (metric === 'wind') {
    el('span', { text: `0 ${windUnitLabel(unit)}` }, scale);
    const bar = el('div', { class: 'bar' }, scale);
    bar.style.background = rampCss(WIND_STOPS);
    el('span', { text: unit === 'kmh' ? '144' : '40' }, scale);
  } else if (metric === 'precip') {
    el('span', { text: 'dry' }, scale);
    const bar = el('div', { class: 'bar' }, scale);
    bar.style.background = 'linear-gradient(90deg, rgba(255,255,255,.05), #164e63, #1d4ed8, #a21caf)';
    el('span', { text: '10 mm/h rain' }, scale);
    const bar2 = el('div', { class: 'bar' }, scale);
    bar2.style.background = 'linear-gradient(90deg, #1e3a5f, #e0f2fe)';
    el('span', { text: 'snow' }, scale);
  } else {
    el('span', { text: '−30°' }, scale);
    const bar = el('div', { class: 'bar' }, scale);
    bar.style.background = rampCss(TEMP_STOPS);
    el('span', { text: '+30°' }, scale);
  }
  const keys = el('div', { class: 'legend' }, node);
  keys.style.gap = '12px';
  const key = (color, label, dash) => {
    const k = el('span', { class: 'key' }, keys);
    const i = el('i', {}, k);
    i.style.background = dash ? `repeating-linear-gradient(90deg, ${color} 0 3px, transparent 3px 6px)` : color;
    el('span', { text: label }, k);
  };
  key('#ffffff', 'snow line', true);
  key('#fbbf24', 'freezing level', true);
  key('rgba(0,0,0,.5)', 'darker column = night');
  el('span', { class: 'muted', text: 'click any cell to move the profile and intel to that hour' }, keys);
}

export function renderBandPicker(node, model, state, onPick) {
  node.textContent = '';
  const heights = [...model.bandHeights].reverse();
  for (const z of heights) {
    const b = el('button', { type: 'button', class: z === state.bandZ ? 'on' : '', text: z === model.mtn.summit ? `${z} summit` : `${z}` }, node);
    b.addEventListener('click', () => onPick(z));
  }
}

/* ---------- tooltip ---------- */
export function tooltip() {
  const node = $('#tooltip');
  return {
    show(html, ev) {
      node.innerHTML = html;
      node.classList.add('on');
      const pad = 14;
      const r = node.getBoundingClientRect();
      let x = ev.clientX + pad;
      let y = ev.clientY + pad;
      if (x + r.width > innerWidth - 8) x = ev.clientX - r.width - pad;
      if (y + r.height > innerHeight - 8) y = ev.clientY - r.height - pad;
      node.style.left = `${Math.max(8, x)}px`;
      node.style.top = `${Math.max(8, y)}px`;
    },
    hide() { node.classList.remove('on'); },
  };
}

export function cellTooltip(h, band, unit) {
  if (!h || !band) return '';
  const u = windUnitLabel(unit);
  const row = (k, v) => `<div class="row"><span>${k}</span><span>${v}</span></div>`;
  return `<b>${band.z} m · ${String(h.time.getHours()).padStart(2, '0')}:00 ${h.time.toDateString().slice(0, 3)}</b>`
    + row('Temperature', `${round(band.temp, 1)}°`)
    + row('Feels like', `${round(band.feels, 1)}°`)
    + row('Wet bulb', `${round(band.wetBulb, 1)}°`)
    + row('Wind', `${fmtWind(band.wind, unit)} ${u} ${compass(band.dir)}`)
    + row('Gusts', `${fmtWind(band.gust, unit)} ${u}`)
    + row('Humidity', `${Math.round(band.rh)}%`)
    + (band.precip >= 0.05 ? row(band.phase === 'snow' ? 'Snow' : band.phase === 'mix' ? 'Sleet' : 'Rain', band.phase === 'snow' ? `${round(band.snowCm, 1)} cm` : `${round(band.precip, 1)} mm`) : row('Precipitation', 'dry'));
}

/* ---------- status ---------- */
export function setStatus(kind, text) {
  const pill = $('#status-pill');
  pill.className = `status-pill ${kind}`;
  $('#status-text').textContent = text;
}
export const dataAge = (ts) => (ts ? `updated ${ago(ts)}` : 'live');
