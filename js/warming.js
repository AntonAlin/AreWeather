/* The warming page.
 *
 * Seven climate models, a century of daily values each, reduced in the browser
 * to a handful of winter metrics at six elevations. The models are fetched one
 * at a time and the page re-renders as each lands, so a slow connection gets a
 * partial answer rather than a spinner — and the model count on screen always
 * says how many of the seven are actually behind what you are looking at.
 *
 * Everything heavy is thrown away after it is summarised. What survives into
 * storage is roughly a hundred winters × six bands × eight numbers per model.
 */

import { CLIMATE_MODELS, WARMING, SOURCES } from './config.js';
import { fetchProjection, keepProjection, fetchObserved, keepObserved, forgetOldProjections } from './api.js';
import {
  extract, winters, ensemble, overPeriod, trend, staircase, verdict, reliabilityLine, pack, unpack,
} from './projection.js';
import { renderWarmingTrend, renderStaircase } from './charts.js';
import { setStatus } from './ui.js';
import { $, $$, el, dec, ago } from './util.js';
import { t, applyTranslations, renderLangToggle } from './i18n.js';

const state = {
  /** model key → band → winters[] */
  models: new Map(),
  observed: null,
  loaded: 0,
  failed: 0,
  /** what the API actually said, so an empty page can explain itself */
  errors: [],
  cacheFull: false,
  cachedAt: null,
  metric: 'coverDays',
  band: 1000,
};

/* ---------- loading ---------- */

/** Summarise one raw response into per-band winter records. */
function summarise(raw, modelKey) {
  const series = extract(raw, modelKey === 'era5' ? null : modelKey);
  if (!series) return null;
  const byBand = {};
  for (const z of WARMING.bands) byBand[z] = winters(series, z);
  return { elevation: series.elevation, byBand };
}

/** A cached entry is already packed; a fresh one still has its raw century. */
const asSummary = (data, modelKey) => (data?.raw ? summarise(data.raw, modelKey) : unpack(data));

/** Note a failure with the reason the API gave, not just that it happened. */
function fail(who, err) {
  const why = err?.message || String(err) || 'unknown error';
  state.errors.push(`${who}: ${why}`);
  state.failed++;
}

async function loadModel(m) {
  try {
    const { data, cachedAt, error } = await fetchProjection(m.key);
    const summary = asSummary(data, m.key);
    if (!summary) throw error ?? new Error('no usable series in the response');
    /* Caching is best-effort: a full localStorage must not cost us the model
       we just spent a megabyte fetching. */
    if (data?.raw && !keepProjection(m.key, pack(summary))) state.cacheFull = true;
    state.models.set(m.key, summary);
    state.cachedAt = Math.min(state.cachedAt ?? Infinity, cachedAt);
  } catch (err) {
    fail(m.key, err);
  } finally {
    state.loaded++;
    render();
  }
}

async function loadObserved() {
  try {
    const { data } = await fetchObserved();
    const summary = asSummary(data, 'era5');
    if (!summary) return;
    if (data?.raw && !keepObserved(pack(summary))) state.cacheFull = true;
    state.observed = summary;
    render();
  } catch (err) {
    /* The projection still stands on its own; the observed line just goes. */
    state.errors.push(`ERA5: ${err?.message ?? err}`);
  }
}

/** Two at a time: seven megabyte-scale responses in parallel help nobody. */
async function pool(items, limit, fn) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) await fn(queue.shift());
  }));
}

async function loadAll() {
  forgetOldProjections();
  render();
  await Promise.all([
    pool(CLIMATE_MODELS, 2, loadModel),
    loadObserved(),
  ]);
  render();
}

/* ---------- combining ---------- */

/** The multi-model ensemble at one band. */
function rowsAt(z) {
  const runs = [...state.models.values()].map((s) => s.byBand[z]).filter(Boolean);
  return runs.length ? ensemble(runs) : [];
}

/** The observed record at one band, shaped like the ensemble rows. */
function observedAt(z) {
  const run = state.observed?.byBand?.[z];
  return run ?? [];
}

/** Every band, for the current metric. */
function bandsFor(metric) {
  const map = new Map(WARMING.bands.map((z) => [z, rowsAt(z)]));
  return staircase(map, metric);
}

/* ---------- rendering ---------- */

const METRIC_UNITS = {
  coverDays: 'warm.unit.days',
  freezeDays: 'warm.unit.days',
  thawDays: 'warm.unit.days',
  snowmakingNights: 'warm.unit.nights',
};

function renderPills() {
  const n = state.models.size;
  $('#warm-models').textContent = t('warm.pill.models', { n, total: CLIMATE_MODELS.length });
  $('#warm-span').textContent = t('warm.pill.span', { from: WARMING.from, to: WARMING.to });
  $('#warm-scenario').textContent = t('warm.pill.scenario', { scenario: SOURCES.projection.scenario });
}

/** The headline: what happens to the season at each height. */
function renderVerdict() {
  const node = $('#verdict-grid');
  node.textContent = '';
  const rows = verdict(bandsFor('coverDays'));
  const usable = rows.filter((r) => Number.isFinite(r.present));
  if (!usable.length) {
    if (!state.loaded) { $('#verdict-note').textContent = ''; return; }
    /* An empty page that cannot say why is a bug report nobody can file. */
    const note = $('#verdict-note');
    note.textContent = '';
    el('span', { text: t('warm.noData') }, note);
    const reason = state.errors[0]?.replace(/^[^:]+: /, '');
    el('span', {
      class: 'why',
      text: reason ? t('warm.noData.why', { reason }) : t('warm.noData.offline'),
    }, note);
    return;
  }

  for (const r of rows) {
    /* A band is "holding" if it still clears the reliability test at the end of
       the model data, "fading" if it loses it, and "gone" if it never had it. */
    const kind = !r.reliableNow ? 'gone' : (r.reliableLater ? 'holds' : 'fading');
    const card = el('div', { class: `verdict ${kind}` }, node);
    el('div', { class: 'z', text: t('warm.atHeight', { z: r.z }) }, card);
    const now = el('div', { class: 'now' }, card);
    now.append(document.createTextNode(Number.isFinite(r.future) ? dec(r.future, 0) : '–'));
    el('small', { text: t('warm.unit.daysShort') }, now);
    /* The headline number is the projected one, and the card has to say so —
       read alone it would otherwise look like today's season. */
    el('div', { class: 'when', text: t('warm.verdict.by', { from: WARMING.periods[2].from, to: WARMING.periods[2].to }) }, card);
    el('div', {
      class: 'then',
      html: t('warm.verdict.change', {
        present: `<b>${Number.isFinite(r.present) ? dec(r.present, 0) : '–'}</b>`,
        delta: Number.isFinite(r.lost) ? `<b>${r.lost > 0 ? '+' : '−'}${dec(Math.abs(r.lost), 0)}</b>` : '–',
      }),
    }, card);
    el('span', { class: 'tag', text: t(`warm.tag.${kind}`) }, card);
  }

  const bands = bandsFor('coverDays');
  const now = reliabilityLine(bands, 'present');
  const later = reliabilityLine(bands, 'future');
  $('#verdict-note').innerHTML = t('warm.verdict.note', {
    depth: WARMING.reliableDepth,
    days: WARMING.reliableDays,
    nowLine: now.z === null ? t('warm.line.none') : (now.all ? t('warm.line.all') : t('warm.line.above', { z: now.z })),
    laterLine: later.z === null ? t('warm.line.none') : (later.all ? t('warm.line.all') : t('warm.line.above', { z: later.z })),
  });
}

function renderStair() {
  const bands = bandsFor(state.metric);
  const isCover = state.metric === 'coverDays';
  renderStaircase($('#staircase'), bands, {
    threshold: isCover ? WARMING.reliableDays : undefined,
    thresholdLabel: isCover ? t('warm.threshold.reliable', { days: WARMING.reliableDays }) : undefined,
    unit: t(METRIC_UNITS[state.metric]),
    label: t(`warm.metric.${state.metric}.label`),
  });
  const note = $('#stair-note');
  note.textContent = t(`warm.metric.${state.metric}.note`);
  if (state.cacheFull) el('span', { class: 'why', text: t('warm.cacheFull') }, note);
}

function renderTrend() {
  const rows = rowsAt(state.band);
  const isCover = state.metric === 'coverDays';
  renderWarmingTrend($('#trend'), {
    rows,
    observed: observedAt(state.band),
    metric: state.metric,
    unit: t(METRIC_UNITS[state.metric]),
    threshold: isCover ? WARMING.reliableDays : undefined,
    thresholdLabel: isCover ? t('warm.threshold.reliable', { days: WARMING.reliableDays }) : undefined,
    label: t('warm.trend.label', { z: state.band }),
  });

  const facts = $('#trend-facts');
  facts.textContent = '';
  const card = (k, v, unit, d) => {
    const box = el('div', { class: 'intel' }, facts);
    el('div', { class: 'k', text: k }, box);
    const val = el('div', { class: 'v' }, box);
    val.append(document.createTextNode(v));
    if (unit) el('small', { text: ` ${unit}` }, val);
    if (d) el('div', { class: 'd', text: d }, box);
  };

  const obs = observedAt(state.band);
  const obsTrend = trend(obs, 'tmeanWinter');
  const modelTrend = trend(rows.filter((r) => r.winter >= 1990), state.metric);
  const past = overPeriod(rows, state.metric, WARMING.periods[0]);
  const present = overPeriod(rows, state.metric, WARMING.periods[1]);
  const future = overPeriod(rows, state.metric, WARMING.periods[2]);

  if (obsTrend) {
    card(t('warm.fact.observedWarming'), `${obsTrend.perDecade > 0 ? '+' : '−'}${dec(Math.abs(obsTrend.perDecade), 2)}`,
      '°C', t('warm.fact.perDecade', { from: obsTrend.from, to: obsTrend.to }));
  }
  for (const [k, v, p] of [
    [t('warm.period.past'), past, WARMING.periods[0]],
    [t('warm.period.present'), present, WARMING.periods[1]],
    [t('warm.period.future'), future, WARMING.periods[2]],
  ]) {
    card(k, Number.isFinite(v) ? dec(v, 0) : '–', t(METRIC_UNITS[state.metric]), `${p.from}–${p.to}`);
  }
  if (modelTrend) {
    card(t('warm.fact.rate'), `${modelTrend.perDecade > 0 ? '+' : '−'}${dec(Math.abs(modelTrend.perDecade), 1)}`,
      t(METRIC_UNITS[state.metric]), t('warm.fact.sinceDecade'));
  }
  $('#trend-note').textContent = t('warm.trend.note', { z: state.band, n: state.models.size });
}

function renderMaking() {
  const bands = bandsFor('snowmakingNights');
  renderStaircase($('#making'), bands, {
    unit: t('warm.unit.nights'),
    label: t('warm.making.label'),
  });
  const base = bands[0];
  const present = base?.periods.find((p) => p.id === 'present')?.value;
  const future = base?.periods.find((p) => p.id === 'future')?.value;
  $('#making-note').textContent = Number.isFinite(present) && Number.isFinite(future)
    ? t('warm.making.note', { z: base.z, present: dec(present, 0), future: dec(future, 0), wb: WARMING.snowmakingWetBulb })
    : t('warm.making.noteShort', { wb: WARMING.snowmakingWetBulb });
}

function renderSummer() {
  const node = $('#summer-facts');
  node.textContent = '';
  const rows = rowsAt(state.band);
  if (!rows.length) return;

  const card = (k, v, unit, d, cls) => {
    const box = el('div', { class: `intel ${cls ?? ''}`.trim() }, node);
    el('div', { class: 'k', text: k }, box);
    const val = el('div', { class: 'v' }, box);
    val.append(document.createTextNode(v));
    if (unit) el('small', { text: ` ${unit}` }, val);
    if (d) el('div', { class: 'd', text: d }, box);
  };
  const change = (metric) => {
    const p = overPeriod(rows, metric, WARMING.periods[1]);
    const f = overPeriod(rows, metric, WARMING.periods[2]);
    return Number.isFinite(p) && Number.isFinite(f) ? f - p : NaN;
  };

  const snowFree = change('freezeDays');
  const thaw = change('thawDays');
  const share = change('snowShare');
  const fall = change('snowfall');

  if (Number.isFinite(snowFree)) {
    card(t('warm.summer.frostFree'), `${snowFree < 0 ? '+' : '−'}${dec(Math.abs(snowFree), 0)}`,
      t('warm.unit.days'), t('warm.summer.frostFreeNote'), 'good');
  }
  if (Number.isFinite(thaw)) {
    card(t('warm.summer.thaws'), `${thaw > 0 ? '+' : '−'}${dec(Math.abs(thaw), 0)}`,
      t('warm.unit.days'), t('warm.summer.thawsNote'), thaw > 0 ? 'warn' : '');
  }
  if (Number.isFinite(share)) {
    card(t('warm.summer.share'), `${share > 0 ? '+' : '−'}${dec(Math.abs(share * 100), 0)}`,
      '%', t('warm.summer.shareNote'), share < 0 ? 'warn' : '');
  }
  if (Number.isFinite(fall)) {
    card(t('warm.summer.snowfall'), `${fall > 0 ? '+' : '−'}${dec(Math.abs(fall), 0)}`,
      'cm', t('warm.summer.snowfallNote'), fall < 0 ? 'warn' : '');
  }
}

/** The status pill is repainted last: applyTranslations() rewrites the markup. */
function status() {
  if (state.loaded < CLIMATE_MODELS.length) {
    return setStatus('working', t('warm.status.loading', { n: state.loaded, total: CLIMATE_MODELS.length }));
  }
  if (!state.models.size) return setStatus('error', t('warm.status.failed'));
  if (state.failed) return setStatus('stale', t('warm.status.partial', { n: state.models.size, total: CLIMATE_MODELS.length }));
  setStatus('live', t('warm.status.ready', { n: state.models.size, age: ago(state.cachedAt) }));
}

function renderBandPicker() {
  const node = $('#trend-band');
  if (node.children.length) return;
  for (const z of [...WARMING.bands].reverse()) {
    const b = el('button', { type: 'button', text: `${z} m`, class: z === state.band ? 'on' : '' }, node);
    b.dataset.band = String(z);
    b.setAttribute('aria-pressed', String(z === state.band));
    b.addEventListener('click', () => {
      state.band = z;
      $$('#trend-band button').forEach((x) => {
        x.classList.toggle('on', x === b);
        x.setAttribute('aria-pressed', String(x === b));
      });
      renderTrend();
      renderSummer();
    });
  }
}

function render() {
  applyTranslations();
  renderPills();
  renderBandPicker();
  renderVerdict();
  renderStair();
  renderTrend();
  renderMaking();
  renderSummer();
  status();
}

/* ---------- events ---------- */

for (const b of $$('#stair-metric button')) {
  b.setAttribute('aria-pressed', String(b.classList.contains('on')));
  b.addEventListener('click', () => {
    state.metric = b.dataset.metric;
    $$('#stair-metric button').forEach((x) => {
      x.classList.toggle('on', x === b);
      x.setAttribute('aria-pressed', String(x === b));
    });
    renderStair();
    renderTrend();
  });
}

$('#status-pill').addEventListener('click', () => location.reload());

applyTranslations();
renderLangToggle($('#lang-toggle'), render);
document.title = t('page.warming.title');
loadAll();

if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
