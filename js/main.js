/* Application shell: state, loading, event wiring, redraw. */

import { APP, MOUNTAINS } from './config.js';
import { fetchSurface, fetchProfile, fetchEnsemble, fetchTraining, purgeCache } from './api.js';
import { train } from './ml.js';
import { assemble } from './forecast.js';
import { renderMatrix, renderProfile, renderHourly } from './charts.js';
import {
  renderRail, renderHero, renderIntel, renderModels, renderML, renderLegend,
  renderBandPicker, tooltip, cellTooltip, setStatus,
} from './ui.js';
import { $, $$, el, store, clamp, ago, nowIsoHour } from './util.js';

const NS = `areweather.${APP.version}`;
const tip = tooltip();

const state = {
  mountainId: null,
  unit: store.get(`${NS}.unit`) ?? 'ms',
  metric: 'temp',
  hours: 48,
  selected: 0,
  nowIndex: 0,
  bandZ: null,
  model: null,
  cachedAt: null,
  stale: false,
  training: false,
};

/* ---------- boot ---------- */
function initialMountain() {
  const fromHash = location.hash.replace('#', '');
  if (MOUNTAINS.some((m) => m.id === fromHash)) return fromHash;
  const saved = store.get(`${NS}.mountain`);
  if (MOUNTAINS.some((m) => m.id === saved)) return saved;
  return MOUNTAINS[0].id;
}

async function load(id, { force = false } = {}) {
  state.mountainId = id;
  store.set(`${NS}.mountain`, id);
  history.replaceState(null, '', `#${id}`);
  renderRail($('#mountain-rail'), id, (next) => load(next));
  const mtn = MOUNTAINS.find((m) => m.id === id);
  document.title = `${mtn.name} — ÅreWeather`;
  setStatus('working', 'Fetching models…');

  let surface;
  try {
    surface = await fetchSurface(mtn, { force });
  } catch (err) {
    fatal(mtn, err);
    return;
  }
  // The sounding and the ensemble are enrichments: a failure of either must not
  // take the page down with it.
  const [profile, ensemble] = await Promise.all([
    fetchProfile(mtn, { force }).catch(() => null),
    fetchEnsemble(mtn, { force }).catch(() => null),
  ]);

  const ml = loadML(mtn.id);
  state.cachedAt = surface.cachedAt;
  state.stale = surface.stale;
  state.model = assemble(mtn, {
    surface: surface.data,
    profile: profile?.data ?? null,
    ensemble: ensemble?.data ?? null,
    ml,
  });
  state.nowIndex = Math.max(0, state.model.hours.findIndex((h) => h.iso.slice(0, 13) === nowIsoHour(APP.timezone)));
  state.selected = state.nowIndex;
  state.bandZ = mtn.summit;
  renderAll();
  status();

  if (!ml || Date.now() - ml.trainedAt > APP.retrainAfterHours * 3600e3) {
    trainInBackground(mtn);
  }
}

function fatal(mtn, err) {
  setStatus('error', 'Offline');
  const hero = $('#hero');
  hero.textContent = '';
  const box = el('div', { class: 'error-box' }, hero);
  box.style.margin = '20px';
  box.innerHTML = `<b>Could not reach the weather service for ${mtn.name}.</b>
    ${navigator.onLine ? 'Open-Meteo did not answer' : 'You appear to be offline'} — ${err?.message ?? 'unknown error'}.
    Nothing is cached for this peak yet, so there is nothing to fall back on. Try again, or pick a mountain you have loaded before.`;
}

/* ---------- machine learning, off the critical path ---------- */
const mlKey = (id) => `${NS}.ml.${id}`;
const loadML = (id) => store.get(mlKey(id));

async function trainInBackground(mtn) {
  if (state.training) return;
  state.training = true;
  status();
  try {
    const { data } = await fetchTraining(mtn);
    const result = train(data);
    if (result) {
      store.set(mlKey(mtn.id), result);
      // Re-assemble with the learned weights; the forecast on screen sharpens.
      if (state.mountainId === mtn.id && state.model) {
        const s = await fetchSurface(mtn);
        const [p, e] = await Promise.all([fetchProfile(mtn).catch(() => null), fetchEnsemble(mtn).catch(() => null)]);
        state.model = assemble(mtn, { surface: s.data, profile: p?.data ?? null, ensemble: e?.data ?? null, ml: result });
        renderAll();
      }
    }
  } catch {
    if (state.mountainId === mtn.id) {
      renderML($('#ml'), { ml: { insufficient: true, n: 0, trainedAt: Date.now() } });
    }
  } finally {
    state.training = false;
    status();
  }
}

/* ---------- rendering ---------- */
function renderAll() {
  const m = state.model;
  if (!m) return;
  renderHero($('#hero'), m, state);
  renderIntel($('#intel'), m, state);
  renderModels($('#models'), m, state);
  renderML($('#ml'), m);
  renderBandPicker($('#band-picker'), m, state, pickBand);
  $('#band-label').textContent = state.bandZ === m.mtn.summit ? 'the summit' : `${state.bandZ} m`;
  renderLegend($('#matrix-legend'), state.metric, state.unit);
  $('#matrix-sub').textContent = m.haveProfile
    ? `Every ${APP.bandStep} m of ${m.mtn.name}, hour by hour, downscaled from a ${m.profileModels.length}-model sounding.`
    : `Every ${APP.bandStep} m of ${m.mtn.name}, hour by hour. No sounding available right now — using a constant lapse rate.`;
  $('#profile-sub').textContent = m.hours[state.selected]?.haveSounding
    ? 'Model sounding interpolated to the mountain, anchored to the surface ensemble.'
    : 'No pressure-level data for this hour — showing the lapse-rate fallback.';
  $('#models-sub').textContent = m.ml?.skill?.length
    ? `Weighted by measured ${APP.trainingDays}-day skill over this exact point.`
    : 'Weighted by native grid resolution until the skill training finishes.';
  drawCharts();
}

function drawCharts() {
  const m = state.model;
  if (!m) return;
  renderMatrix($('#matrix'), m, {
    metric: state.metric,
    hours: state.hours,
    unit: state.unit,
    selected: state.selected,
    nowIndex: state.nowIndex,
    onPick: (i, z) => {
      state.selected = i;
      if (z != null) state.bandZ = z;
      renderHero($('#hero'), m, state);
      renderIntel($('#intel'), m, state);
      renderModels($('#models'), m, state);
      renderBandPicker($('#band-picker'), m, state, pickBand);
      $('#band-label').textContent = state.bandZ === m.mtn.summit ? 'the summit' : `${state.bandZ} m`;
      drawProfile();
      drawHourly();
    },
    onHover: (h, band, ev) => {
      if (!h) return tip.hide();
      tip.show(cellTooltip(h, band, state.unit), ev);
    },
  });
  drawProfile();
  drawHourly();
}

function pickBand(z) {
  state.bandZ = z;
  $('#band-label').textContent = z === state.model.mtn.summit ? 'the summit' : `${z} m`;
  renderBandPicker($('#band-picker'), state.model, state, pickBand);
  drawHourly();
}

function drawProfile() {
  const node = $('#profile');
  const w = Math.max(320, node.clientWidth || node.parentElement.clientWidth - 40);
  renderProfile(node, state.model, state.selected, { unit: state.unit, width: w });
}

function drawHourly() {
  const node = $('#hourly');
  const w = Math.max(340, node.clientWidth || node.parentElement.clientWidth - 40);
  renderHourly(node, state.model, {
    bandZ: state.bandZ,
    hours: state.hours,
    unit: state.unit,
    width: w,
    nowIndex: state.nowIndex,
    selected: state.selected,
    onPick: (i) => {
      state.selected = i;
      renderHero($('#hero'), state.model, state);
      renderIntel($('#intel'), state.model, state);
      renderModels($('#models'), state.model, state);
      drawProfile();
      drawCharts();
    },
  });
}

function status() {
  if (state.training) return setStatus('working', 'Training on 45 days…');
  if (!navigator.onLine) return setStatus('stale', `Offline · ${ago(state.cachedAt)}`);
  if (state.stale) return setStatus('stale', `Cached · ${ago(state.cachedAt)}`);
  setStatus('live', `Live · ${ago(state.cachedAt)}`);
}

/* ---------- events ---------- */
/** Segmented controls are toggle buttons; keep their state readable to assistive tech. */
function press(group, active) {
  for (const b of group) {
    const on = b === active;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
}

function wire() {
  $$('#matrix-metric button').forEach((b) => b.addEventListener('click', () => {
    press($$('#matrix-metric button'), b);
    state.metric = b.dataset.metric;
    renderLegend($('#matrix-legend'), state.metric, state.unit);
    drawCharts();
  }));
  $$('#matrix-range button').forEach((b) => b.addEventListener('click', () => {
    press($$('#matrix-range button'), b);
    state.hours = +b.dataset.hours;
    state.selected = clamp(state.selected, 0, state.hours - 1);
    drawCharts();
  }));
  $$('#unit-toggle button').forEach((b) => b.addEventListener('click', () => {
    press($$('#unit-toggle button'), b);
    state.unit = b.dataset.unit;
    store.set(`${NS}.unit`, state.unit);
    renderAll();
  }));
  $('#status-pill').addEventListener('click', () => load(state.mountainId, { force: true }));

  addEventListener('keydown', (ev) => {
    if (!state.model) return;
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') {
      state.selected = clamp(state.selected + (ev.key === 'ArrowRight' ? 1 : -1), 0, state.hours - 1);
      renderHero($('#hero'), state.model, state);
      renderIntel($('#intel'), state.model, state);
      renderModels($('#models'), state.model, state);
      drawCharts();
      ev.preventDefault();
    }
  });

  addEventListener('hashchange', () => {
    const id = location.hash.replace('#', '');
    if (id && id !== state.mountainId && MOUNTAINS.some((m) => m.id === id)) load(id);
  });
  addEventListener('online', () => load(state.mountainId, { force: true }));
  addEventListener('offline', status);

  let t;
  addEventListener('resize', () => {
    clearTimeout(t);
    t = setTimeout(() => { drawProfile(); drawHourly(); }, 160);
  });
  setInterval(status, 60e3);
}

/* ---------- go ---------- */
press($$('#unit-toggle button'), $$('#unit-toggle button').find((b) => b.dataset.unit === state.unit));
for (const group of ['#matrix-metric', '#matrix-range']) press($$(`${group} button`), $(`${group} button.on`));
$('#build-line').textContent = `${APP.version} · ${MOUNTAINS.length} peaks · data cached in this browser`;
wire();
load(initialMountain());

if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// Escape hatch for a corrupted cache, from the console.
window.areweather = { purgeCache, state };
