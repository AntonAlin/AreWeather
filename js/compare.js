/* The comparison view: every peak scored side by side.

   This exists because the single-peak view answers "what is Åreskutan doing?"
   and the question people actually have on a Wednesday evening is "where should
   I go on Saturday?" — which used to mean clicking through ten mountains.

   Ten peaks means ten sets of requests, so this page is deliberately frugal:
   two small requests per mountain, three at a time, every one of them sharing
   the same 30-minute cache as the detail view. Opening a peak afterwards costs
   nothing extra. */

import { APP, MOUNTAINS, ACTIVITIES, activityById, activitiesFor } from './config.js';
import { fetchSurface, fetchAux } from './api.js';
import { assemble, dailySummaries } from './forecast.js';
import { setStatus } from './ui.js';
import { $, $$, el, store, clamp, round, scoreColor, fmtShortDay, fmtClock, ago, nowIsoHour } from './util.js';

const NS = `areweather.${APP.version}`;
const HORIZON = 7;

const state = {
  activity: store.get(`${NS}.activity`) ?? 'trail',
  sort: 'best',
  rows: MOUNTAINS.map((mtn) => ({ mtn, model: null, days: null, error: null, loading: true })),
  loaded: 0,
  cachedAt: null,
};

const activityName = (id) => activityById(id).name.toLowerCase();

/* ---------- loading ---------- */

/** Run `fn` over `items` with at most `limit` in flight, in order. */
async function pool(items, limit, fn) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i], i);
    }
  });
  await Promise.all(workers);
}

async function loadRow(row, { force = false } = {}) {
  try {
    const [surface, aux] = await Promise.all([
      fetchSurface(row.mtn, { force }),
      fetchAux(row.mtn, { force }).catch(() => null),
    ]);
    const ml = store.get(`${NS}.ml.${row.mtn.id}`);
    row.model = assemble(row.mtn, {
      surface: surface.data,
      profile: aux?.data ?? null,   // same shape; carries snow depth and freezing level
      ensemble: null,
      ml,
    });
    row.nowIndex = Math.max(0, row.model.hours.findIndex((h) => h.iso.slice(0, 13) === nowIsoHour(APP.timezone)));
    row.cachedAt = surface.cachedAt;
    row.stale = surface.stale;
    state.cachedAt = Math.min(state.cachedAt ?? Infinity, surface.cachedAt);
  } catch (err) {
    row.error = err?.message ?? 'no data';
  } finally {
    row.loading = false;
    state.loaded++;
    summarise(row);
    renderProgress();
    renderGrid();
    renderPicks();
  }
}

function summarise(row) {
  if (!row.model) { row.days = null; return; }
  row.applicable = activitiesFor(row.mtn).some((a) => a.id === state.activity);
  row.days = row.applicable
    ? dailySummaries(row.model, state.activity, { fromIndex: row.nowIndex }).slice(0, HORIZON)
    : [];
}

async function loadAll({ force = false } = {}) {
  state.loaded = 0;
  state.cachedAt = null;
  for (const row of state.rows) { row.loading = true; row.error = null; }
  setStatus('working', `Scoring ${state.rows.length} peaks…`);
  renderProgress();
  renderGrid();
  await pool(state.rows, 3, (row) => loadRow(row, { force }));
  const failed = state.rows.filter((r) => r.error).length;
  if (failed === state.rows.length) setStatus('error', 'No data');
  else if (failed) setStatus('stale', `${state.rows.length - failed} of ${state.rows.length} peaks`);
  else setStatus('live', `Live · ${ago(state.cachedAt)}`);
  $('#progress').hidden = true;
  state.sort = 'best';
  renderGrid();
}

/* ---------- the day columns ---------- */

/** Union of dates across every loaded peak, so the columns line up. */
function dateColumns() {
  const seen = new Map();
  for (const row of state.rows) {
    for (const d of row.days ?? []) if (!seen.has(d.date)) seen.set(d.date, d.time);
  }
  return [...seen.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(0, HORIZON);
}

const rank = (row) => (row.days?.length ? Math.max(...row.days.map((d) => d.best.score)) : -1);
const notHere = (row) => !row.loading && !row.error && row.applicable === false;

function sortedRows() {
  const rows = [...state.rows];
  if (state.sort === 'name') return rows.sort((a, b) => a.mtn.name.localeCompare(b.mtn.name, 'sv'));
  if (state.sort === 'height') return rows.sort((a, b) => b.mtn.summit - a.mtn.summit);
  return rows.sort((a, b) => rank(b) - rank(a));
}

/* ---------- rendering ---------- */

function renderProgress() {
  const bar = $('#progress');
  const done = state.loaded / state.rows.length;
  bar.hidden = done >= 1;
  bar.firstElementChild.style.width = `${Math.round(done * 100)}%`;
}

function cellTone(score) {
  const c = scoreColor(score);
  return { color: c, background: `${c}22`, border: `1px solid ${c}55` };
}

function renderGrid() {
  const table = $('#grid');
  const columns = dateColumns();
  table.textContent = '';

  const thead = el('thead', {}, table);
  const hr = el('tr', {}, thead);
  el('th', { class: 'peak-head', text: 'Peak' }, hr);
  const todayKey = nowIsoHour(APP.timezone).slice(0, 10);
  for (const [date, time] of columns) {
    const th = el('th', { class: date === todayKey ? 'today' : '' }, hr);
    th.innerHTML = date === todayKey
      ? `Today<small>${fmtShortDay(time)}</small>`
      : `${fmtShortDay(time).split(' ')[0]}<small>${time.getDate()}/${time.getMonth() + 1}</small>`;
  }

  const tbody = el('tbody', {}, table);
  for (const row of sortedRows()) {
    const tr = el('tr', {}, tbody);
    const peak = el('td', { class: 'peak' }, tr);
    const a = el('a', { class: 'peak-link', href: `./#${row.mtn.id}` }, peak);
    el('span', { class: 'pn', text: row.mtn.name }, a);
    el('span', { class: 'pe', text: `${row.mtn.summit} m` }, a);

    if (row.loading) {
      const td = el('td', { colspan: Math.max(1, columns.length) }, tr);
      const wrap = el('div', { class: 'row-loading' }, td);
      el('i', {}, wrap);
      continue;
    }
    if (notHere(row)) {
      const td = el('td', { colspan: Math.max(1, columns.length) }, tr);
      el('div', { class: 'row-na', text: `${activityById(state.activity).name} is not a thing on this peak — no lift, or the wrong terrain for it` }, td);
      continue;
    }
    if (row.error || !row.days) {
      const td = el('td', { colspan: Math.max(1, columns.length) }, tr);
      el('div', { class: 'row-error', text: `no data — ${row.error ?? 'unavailable'}` }, td);
      continue;
    }

    for (const [date] of columns) {
      const day = row.days.find((d) => d.date === date);
      const td = el('td', { class: 'cell-wrap' }, tr);
      if (!day) { el('div', { class: 'cell empty', text: '–' }, td); continue; }
      const cell = el('a', {
        class: 'cell', href: `./#${row.mtn.id}`,
        'aria-label': `${row.mtn.name}, ${fmtShortDay(day.time)}: score ${Math.round(day.best.score)} for ${activityName(state.activity)}, best window ${fmtClock(day.best.startTime)} to ${fmtClock(day.best.endTime)}${day.best.dark ? ', after dark' : ''}`,
      }, td);
      Object.assign(cell.style, cellTone(day.best.score));
      el('span', { class: 's', text: Math.round(day.best.score) }, cell);
      el('span', {
        class: `w${day.best.dark ? ' dark' : ''}`,
        text: `${fmtClock(day.best.startTime)}–${fmtClock(day.best.endTime)}`,
        title: day.best.dark ? 'No daylight left in this window' : '',
      }, cell);
      cell.addEventListener('pointerenter', (ev) => showTip(row, day, ev));
      cell.addEventListener('pointermove', (ev) => showTip(row, day, ev));
      cell.addEventListener('pointerleave', hideTip);
    }
  }
  renderLegend();
}

function renderLegend() {
  const node = $('#legend');
  node.textContent = '';
  el('span', { text: 'Score' }, node);
  const sw = el('div', { class: 'swatches' }, node);
  for (const s of [10, 30, 45, 60, 75, 90]) {
    const i = el('i', { title: String(s) }, sw);
    i.style.background = scoreColor(s);
  }
  const activity = activityById(state.activity);
  el('span', { class: 'muted', text: `poor → excellent · times are the best ${activity.window}-hour ${activity.night ? 'window after dark' : 'daylight window'} that day` }, node);
  const dark = el('span', { class: 'key' }, node);
  const marker = el('i', { text: '00–00' }, dark);
  marker.style.cssText = 'font-family:var(--mono);font-size:.62rem;color:var(--amber);background:none;width:auto;height:auto';
  el('span', { class: 'muted', text: 'in amber: no daylight left' }, dark);
}

function renderPicks() {
  const grid = $('#picks-grid');
  const candidates = [];
  for (const row of state.rows) {
    for (const day of row.days ?? []) candidates.push({ row, day });
  }
  candidates.sort((a, b) => b.day.best.score - a.day.best.score);

  // One entry per mountain, so the list is three places to go rather than one
  // mountain three days running.
  const picks = [];
  const seen = new Set();
  for (const c of candidates) {
    if (seen.has(c.row.mtn.id)) continue;
    seen.add(c.row.mtn.id);
    picks.push(c);
    if (picks.length === 3) break;
  }

  grid.textContent = '';
  if (!picks.length) {
    el('p', { class: 'sub', text: state.loaded ? 'No peak returned usable data. Try refreshing.' : 'Scoring every peak…' }, grid);
    return;
  }

  const top = picks[0].day.best.score;
  const activity = activityById(state.activity);
  // Out of season is a different answer from a bad week, and saying so is the
  // difference between a useful forecast and a wall of low numbers.
  const outOfSeason = candidates.length
    && candidates.filter((c) => c.day.best.label === 'Out of season').length > candidates.length * 0.7;

  if (outOfSeason) {
    $('#picks-title').textContent = `${activity.name} is out of season`;
    $('#picks-sub').textContent = activity.season?.snowMin
      ? `There is not enough snow for ${activityName(state.activity)} on these peaks, and none of the next seven days changes that. The grid below shows where it is closest.`
      : `There is too much snow for ${activityName(state.activity)} right now. The grid below shows where it is closest.`;
  } else {
    $('#picks-title').textContent = top >= 65 ? 'Where to go' : top >= 45 ? 'The least bad options' : 'It is that kind of week';
    $('#picks-sub').textContent = top >= 65
      ? `Best windows for ${activityName(state.activity)} in the next seven days.`
      : top >= 45
        ? `Nothing scores well for ${activityName(state.activity)} this week. These are the best of it.`
        : `Nothing in the next seven days scores above ${Math.round(top)} for ${activityName(state.activity)}. Sometimes the honest answer is to stay in the valley.`;
  }

  picks.forEach((p, i) => {
    const tone = scoreColor(p.day.best.score);
    const card = el('a', { class: 'pick', href: `./#${p.row.mtn.id}` }, grid);
    card.style.setProperty('--tone', tone);
    el('div', { class: 'rank', text: i === 0 ? 'Best bet' : `Option ${i + 1}` }, card);
    el('div', { class: 'name', text: p.row.mtn.name }, card);
    el('div', { class: 'when', text: `${fmtShortDay(p.day.time)} · ${fmtClock(p.day.best.startTime)}–${fmtClock(p.day.best.endTime)}` }, card);
    const score = el('div', { class: 'score', text: Math.round(p.day.best.score) }, card);
    score.style.color = tone;
    const why = el('div', { class: 'why' }, card);
    why.innerHTML = `<b>${p.day.best.label}</b> — ${p.day.best.why.length ? `limited by ${p.day.best.why.join(', ')}` : 'nothing holding you back'}. `
      + `${Math.round(p.day.tMax)}° to ${Math.round(p.day.tMin)}° at the summit, wind to ${round(p.day.windMax, 1)} m/s`
      + `${p.day.newSnow > 1 ? `, ${round(p.day.newSnow, 1)} cm of new snow` : p.day.precip > 1 ? `, ${round(p.day.precip, 1)} mm of precipitation` : ''}.`;
  });
}

/* ---------- tooltip ---------- */
const tipNode = $('#tooltip');
function showTip(row, day, ev) {
  const rowHtml = (k, v) => `<div class="row"><span>${k}</span><span>${v}</span></div>`;
  tipNode.innerHTML = `<b>${row.mtn.name} · ${fmtShortDay(day.time)}</b>`
    + rowHtml('Best window', `${fmtClock(day.best.startTime)}–${fmtClock(day.best.endTime)}`)
    + rowHtml('Score', `${Math.round(day.best.score)} — ${day.best.label}`)
    + rowHtml('Summit temp', `${Math.round(day.tMax)}° / ${Math.round(day.tMin)}°`)
    + rowHtml('Max wind', `${round(day.windMax, 1)} m/s`)
    + (day.newSnow > 0.4 ? rowHtml('New snow', `${round(day.newSnow, 1)} cm`) : rowHtml('Precipitation', `${round(day.precip, 1)} mm`))
    + (day.best.why.length ? `<div class="row" style="margin-top:5px"><span>Limited by</span><span>${day.best.why[0]}</span></div>` : '')
    + (day.best.dark ? rowHtml('Daylight', 'none left — headlamp') : '')
    + (day.partial ? rowHtml('Part day', 'from now on') : '');
  tipNode.classList.add('on');
  const r = tipNode.getBoundingClientRect();
  const x = clamp(ev.clientX + 14, 8, innerWidth - r.width - 8);
  const y = ev.clientY + 14 + r.height > innerHeight - 8 ? ev.clientY - r.height - 14 : ev.clientY + 14;
  tipNode.style.left = `${x}px`;
  tipNode.style.top = `${Math.max(8, y)}px`;
}
const hideTip = () => tipNode.classList.remove('on');

/* ---------- events ---------- */
function press(group, active) {
  for (const b of group) {
    const on = b === active;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
}

function buildActivityPicker() {
  const rail = $('#activity');
  rail.textContent = '';
  for (const a of ACTIVITIES) {
    const b = el('button', {
      type: 'button', text: a.short, title: a.blurb,
      'data-activity': a.id,
      class: a.id === state.activity ? 'on' : '',
      'aria-pressed': a.id === state.activity ? 'true' : 'false',
    }, rail);
    b.addEventListener('click', () => selectActivity(b));
  }
}

function selectActivity(b) {
  press($$('#activity button'), b);
  state.activity = b.dataset.activity;
  store.set(`${NS}.activity`, state.activity);
  // No refetch: the forecasts are already in memory, only the scoring changes.
  for (const row of state.rows) summarise(row);
  renderGrid();
  renderPicks();
}

$$('#sort button').forEach((b) => b.addEventListener('click', () => {
  press($$('#sort button'), b);
  state.sort = b.dataset.sort;
  renderGrid();
}));

$('#status-pill').addEventListener('click', () => loadAll({ force: true }));
addEventListener('online', () => loadAll({ force: true }));
setInterval(() => {
  if (state.cachedAt && !state.rows.some((r) => r.loading)) setStatus(navigator.onLine ? 'live' : 'stale', `${navigator.onLine ? 'Live' : 'Offline'} · ${ago(state.cachedAt)}`);
}, 60e3);

buildActivityPicker();
loadAll();

if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
