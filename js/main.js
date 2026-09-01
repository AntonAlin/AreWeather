/* Application shell: state, loading, event wiring, redraw. */

import { APP, MOUNTAINS } from './config.js';
import { fetchSurface, fetchProfile, fetchEnsemble, fetchTraining, fetchObservations, fetchClimate, keepClimate, purgeCache } from './api.js';
import { train } from './ml.js';
import { assemble } from './forecast.js';
import { renderMatrix, renderProfile, renderHourly } from './charts.js';
import {
  renderRail, renderHero, renderIntel, renderModels, renderML, renderLegend,
  renderBandPicker, renderObservations, renderClimate, renderAspect, tooltip, cellTooltip, setStatus,
} from './ui.js';
import { summarise, weekly, contextFor } from './climate.js';
import { parseStationSet, buildObservations } from './observations.js';
import { SMHI } from './config.js';
import { $, $$, el, store, clamp, ago, nowIsoHour } from './util.js';
import { t, applyTranslations, renderLangToggle } from './i18n.js';

const NS = `areweather.${APP.version}`;
const tip = tooltip();

const state = {
  mountainId: null,
  unit: store.get(`${NS}.unit`) ?? 'ms',
  activity: store.get(`${NS}.activity`) ?? 'trail',
  aspectLens: 'wind',
  climate: null,
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
  setStatus('working', t('status.fetching'));

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
  // Fall back if the remembered activity does not exist on this peak.
  if (!state.model.activities.some((a) => a.id === state.activity)) state.activity = state.model.activities[0].id;
  state.selected = state.nowIndex;
  state.bandZ = mtn.summit;
  renderAll();
  status();

  if (!ml || Date.now() - ml.trainedAt > APP.retrainAfterHours * 3600e3) {
    trainInBackground(mtn);
  }
  loadObservations();
  loadClimate(mtn);
}

/* ---------- climatology ----------
   The heaviest request the app makes, so it is deferred until the forecast is
   on screen, summarised once, and cached for a month. What gets stored is the
   distribution, never the decade of raw numbers behind it. */
async function loadClimate(mtn) {
  state.climate = null;
  if (state.model) renderClimate($('#climate'), state.model, null, state);
  try {
    const { data } = await fetchClimate(mtn);
    // A cached entry is already summarised; a fresh one still has its archive.
    const summary = data.raw ? summarise(data.raw) : data;
    if (!summary) throw new Error('empty archive');
    if (data.raw) keepClimate(mtn.id, summary);
    if (state.mountainId !== mtn.id || !state.model) return;
    state.climate = { ...summary, weeks: weekly(summary) };
    renderClimateCard();
  } catch (err) {
    state.climate = { error: err?.message ?? 'unavailable' };
    if (state.mountainId === mtn.id) renderClimate($('#climate'), state.model, state.climate, state);
  }
}

/** The climate card compares the *selected day*, so it re-renders with the hour. */
function renderClimateCard() {
  if (!state.model) return;
  const climate = state.climate;
  if (!climate || climate.error) {
    renderClimate($('#climate'), state.model, climate, state);
    return;
  }
  const h = state.model.hours[state.selected] ?? state.model.hours[0];
  const date = h.iso.slice(0, 10);
  const sameDay = state.model.hours.filter((x) => x.iso.slice(0, 10) === date);
  const temps = sameDay.map((x) => x.summit.temp).filter(Number.isFinite);
  const winds = sameDay.map((x) => x.summit.wind).filter(Number.isFinite);
  const context = contextFor(climate, {
    date,
    tmax: temps.length ? Math.max(...temps) : NaN,
    wind: winds.length ? Math.max(...winds) : NaN,
    precip: sameDay.reduce((a, x) => a + (x.summit.precip || 0), 0),
  });
  renderClimate($('#climate'), { ...state.model, dailySummary: [{ time: h.time }] }, { ...climate, context }, state);
}

/* ---------- SMHI observations ----------
   Never on the critical path: the forecast is the product, this is the reality
   check next to it. One request per parameter serves every mountain, so
   switching peaks re-renders from the same cached station sets. */
let stationSets = null;

async function loadObservations() {
  const mountainAtStart = state.mountainId;
  try {
    if (!stationSets) {
      const results = await Promise.all(SMHI.parameters.map(
        (p) => fetchObservations(p.id).then((r) => [p.key, parseStationSet(r.data)]).catch(() => [p.key, null]),
      ));
      const sets = Object.fromEntries(results.filter(([, v]) => v));
      if (!Object.keys(sets).length) throw new Error('no station data');
      stationSets = sets;
    }
    if (state.mountainId !== mountainAtStart || !state.model) return;
    renderObservations($('#observations'), state.model, buildObservations(state.model, stationSets), state);
  } catch (err) {
    const node = $('#observations');
    node.textContent = '';
    const box = el('div', { class: 'obs-empty' }, node);
    box.innerHTML = t('obs.failed')
      + t(navigator.onLine ? 'obs.failedOnline' : 'obs.failedOffline')
      + `<br><span class="muted" style="font-size:.9em">${err?.message ?? t('error.unknown')}</span>`;
  }
}

function fatal(mtn, err) {
  setStatus('error', t('status.error'));
  const hero = $('#hero');
  hero.textContent = '';
  const box = el('div', { class: 'error-box' }, hero);
  box.style.margin = '20px';
  box.innerHTML = t('error.fatal', {
    mtn: mtn.name,
    reason: navigator.onLine ? t('error.noAnswer') : t('error.offline'),
    message: err?.message ?? t('error.unknown'),
  });
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
state.onActivity = (id) => {
  state.activity = id;
  store.set(`${NS}.activity`, id);
  renderHero($('#hero'), state.model, state);
};

function renderAll() {
  const m = state.model;
  if (!m) return;
  renderHero($('#hero'), m, state);
  renderIntel($('#intel'), m, state);
  renderModels($('#models'), m, state);
  renderML($('#ml'), m);
  renderAspect($('#aspect'), m, state);
  renderClimateCard();
  renderBandPicker($('#band-picker'), m, state, pickBand);
  $('#band-label').textContent = state.bandZ === m.mtn.summit ? t('hourly.summit') : t('hourly.band', { z: state.bandZ });
  renderLegend($('#matrix-legend'), state.metric, state.unit);
  $('#matrix-sub').textContent = m.haveProfile
    ? t('matrix.sub', { step: APP.bandStep, mtn: m.mtn.name, n: m.profileModels.length })
    : t('matrix.subNoProfile', { step: APP.bandStep, mtn: m.mtn.name });
  $('#profile-sub').textContent = m.hours[state.selected]?.haveSounding ? t('profile.sub') : t('profile.subFallback');
  $('#models-sub').textContent = m.ml?.skill?.length
    ? t('models.sub', { days: APP.trainingDays })
    : t('models.subPrior');
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
      renderAspect($('#aspect'), m, state);
      renderClimateCard();
      renderBandPicker($('#band-picker'), m, state, pickBand);
      $('#band-label').textContent = state.bandZ === m.mtn.summit ? t('hourly.summit') : t('hourly.band', { z: state.bandZ });
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
  $('#band-label').textContent = z === state.model.mtn.summit ? t('hourly.summit') : t('hourly.band', { z });
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
      renderAspect($('#aspect'), state.model, state);
      renderClimateCard();
      drawProfile();
      drawCharts();
    },
  });
}

function status() {
  if (state.training) return setStatus('working', t('status.training'));
  if (!navigator.onLine) return setStatus('stale', t('status.offline', { age: ago(state.cachedAt) }));
  if (state.stale) return setStatus('stale', t('status.cached', { age: ago(state.cachedAt) }));
  setStatus('live', t('status.live', { age: ago(state.cachedAt) }));
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
  $$('#aspect-lens button').forEach((b) => b.addEventListener('click', () => {
    press($$('#aspect-lens button'), b);
    state.aspectLens = b.dataset.lens;
    if (state.model) renderAspect($('#aspect'), state.model, state);
  }));
  $('#status-pill').addEventListener('click', () => load(state.mountainId, { force: true }));

  addEventListener('keydown', (ev) => {
    if (!state.model) return;
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') {
      state.selected = clamp(state.selected + (ev.key === 'ArrowRight' ? 1 : -1), 0, state.hours - 1);
      renderHero($('#hero'), state.model, state);
      renderIntel($('#intel'), state.model, state);
      renderModels($('#models'), state.model, state);
      renderAspect($('#aspect'), state.model, state);
      renderClimateCard();
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

  let resizeTimer;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { drawProfile(); drawHourly(); }, 160);
  });
  setInterval(status, 60e3);
}

/* ---------- go ---------- */
press($$('#unit-toggle button'), $$('#unit-toggle button').find((b) => b.dataset.unit === state.unit));
for (const group of ['#matrix-metric', '#matrix-range']) press($$(`${group} button`), $(`${group} button.on`));
$('#build-line').textContent = t('footer.build', { version: APP.version, n: MOUNTAINS.length });
/* Language: translate the static markup, then re-render everything JavaScript
   built. Switching never refetches — the assembled model is language-free. */
applyTranslations();
renderLangToggle($('#lang-toggle'), () => {
  applyTranslations();
  if (state.model) renderAll();
  status();
});

wire();
load(initialMountain());

if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// Escape hatch for a corrupted cache, from the console.
window.areweather = { purgeCache, state };
