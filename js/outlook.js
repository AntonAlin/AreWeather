/* The outlook page.
 *
 * One peak, one elevation, and the whole ensemble carried through to daily
 * totals per member so that every percentage on screen is a count of specific
 * futures rather than an inference from a spread.
 *
 * It reuses the caches the forecast page already fills, so arriving here after
 * looking at a peak usually costs nothing at all.
 */

import { MOUNTAINS, APP, OUTLOOK, SOURCES } from './config.js';
import { fetchSurface, fetchEnsemble } from './api.js';
import { memberDays, daily, trajectories, fan, agreement, headline } from './probability.js';
import { precipProbability } from './ml.js';
import { renderFan, renderEventGrid } from './charts.js';
import { renderRail, setStatus } from './ui.js';
import {
  $, $$, el, store, dec, ago, fmtDay, fmtTemp, fmtWind, windUnitLabel,
} from './util.js';
import { t, applyTranslations, renderLangToggle } from './i18n.js';

const NS = `areweather.${APP.version}`;

const state = {
  mountainId: null,
  band: OUTLOOK.defaultBand,
  metric: 'tmax',
  selected: null,
  unit: store.get(`${NS}.unit`) ?? 'ms',
  rows: [],
  days: [],
  ensemble: null,
  ml: null,
  cachedAt: null,
  error: null,
};

const mountain = () => MOUNTAINS.find((m) => m.id === state.mountainId) ?? MOUNTAINS[0];

/* ---------- loading ---------- */

/** The peak named in the hash, the last one looked at, or the obvious one. */
function initialMountain() {
  const hash = location.hash.slice(1);
  if (MOUNTAINS.some((m) => m.id === hash)) return hash;
  const saved = store.get(`${NS}.mountain`);
  return MOUNTAINS.some((m) => m.id === saved) ? saved : MOUNTAINS[0].id;
}

async function load(id, { force = false } = {}) {
  state.mountainId = id;
  state.error = null;
  state.selected = null;
  store.set(`${NS}.mountain`, id);
  history.replaceState(null, '', `#${id}`);
  const mtn = mountain();
  document.title = `${mtn.name} — ${t('page.outlook.title')}`;
  renderRail($('#peak-rail'), id, (next) => load(next));
  setStatus('working', t('status.fetching'));
  render();

  state.ml = store.get(`${NS}.ml.${id}`) ?? null;
  /* The surface run is not used for any number here, but asking for it keeps
     this page and the forecast page on one cache entry rather than two. */
  const [ens] = await Promise.all([
    fetchEnsemble(mtn, { force }).catch((err) => { state.error = err; return null; }),
    fetchSurface(mtn, { force }).catch(() => null),
  ]);

  state.ensemble = ens?.data ?? null;
  state.cachedAt = ens?.cachedAt ?? null;
  recompute();
  render();
}

/** Everything downstream of the members, redone when the band changes. */
function recompute() {
  const mtn = mountain();
  state.rows = state.ensemble
    ? memberDays(state.ensemble, { elevation: state.band, anchor: mtn.summit })
    : [];

  /* The one calibrated number on the page. `precipProbability` returns null
     when the learned model did not beat the raw ensemble on its hold-out
     block, and the raw member fraction is then used and labelled as raw. */
  const calibrate = ({ wetFrac, ensP, cloud }) => precipProbability(state.ml, {
    ensP, wetFrac, rh: null, cloud,
  });
  state.days = daily(state.rows, { calibrate });
  if (!state.days.some((d) => d.date === state.selected)) {
    state.selected = state.days[0]?.date ?? null;
  }
}

/* ---------- rendering ---------- */

const pct = (p) => (Number.isFinite(p) ? `${Math.round(p * 100)}%` : '–');

function renderPills() {
  const n = state.days[0]?.members ?? 0;
  $('#out-members').textContent = n
    ? t('out.pill.members', { n })
    : t('out.pill.noMembers');
  $('#out-system').textContent = t('out.pill.system', {
    system: state.ensemble?._model ?? SOURCES.ensemble.name,
  });
  const pill = $('#out-ml');
  const on = !!state.ml?.precip?.use;
  pill.className = `pill ${on ? 'ok' : 'amber'}`;
  pill.textContent = on ? t('out.pill.mlOn') : t('out.pill.mlOff');
}

function renderHeadline() {
  const node = $('#out-headline');
  node.textContent = '';
  if (state.error) {
    node.className = 'headline warn';
    node.textContent = t('out.error', { reason: state.error.message ?? String(state.error) });
    return;
  }
  const best = headline(state.days);
  node.className = 'headline';
  if (!best) {
    if (state.days.length) node.textContent = t('out.headline.quiet');
    return;
  }
  node.innerHTML = t('out.headline', {
    p: `<b>${pct(best.p)}</b>`,
    event: t(`out.event.${best.event.id}.phrase`),
    day: fmtDay(best.day.when),
  });
}

function renderGrid() {
  const node = $('#event-grid');
  if (!state.days.length) { node.textContent = ''; return; }
  renderEventGrid(node, {
    days: state.days,
    events: OUTLOOK.events,
    selected: state.selected,
    label: t('out.grid.label', { z: state.band }),
    onPick: (date) => { state.selected = date; render(); },
  });
  const missing = OUTLOOK.events.filter((e) => state.days.every((d) => d.events[e.id] === null));
  $('#grid-note').textContent = missing.length
    ? t('out.grid.missing', { events: missing.map((e) => t(`out.event.${e.id}`)).join(', ') })
    : t('out.grid.note', { z: state.band, n: state.days[0]?.members ?? 0 });
}

function renderDays() {
  const node = $('#day-cards');
  node.textContent = '';
  for (const d of state.days) {
    const card = el('button', {
      type: 'button',
      class: `day-card${d.date === state.selected ? ' on' : ''}`,
      'aria-pressed': d.date === state.selected ? 'true' : 'false',
    }, node);
    card.addEventListener('click', () => { state.selected = d.date; render(); });

    el('div', { class: 'd-day', text: fmtDay(d.when) }, card);

    const temp = el('div', { class: 'd-temp' }, card);
    el('b', { text: fmtTemp(d.tmax.p50) }, temp);
    el('span', { class: 'range', text: t('out.day.range', { lo: dec(d.tmax.p10, 0), hi: dec(d.tmax.p90, 0) }) }, temp);

    const rows = el('div', { class: 'd-rows' }, card);
    const line = (k, v, cls) => {
      const r = el('div', { class: `d-line ${cls ?? ''}`.trim() }, rows);
      el('span', { class: 'k', text: k }, r);
      el('span', { class: 'v', text: v }, r);
    };
    line(d.popCalibrated ? t('out.day.popCal') : t('out.day.pop'), pct(d.pop));
    if (Number.isFinite(d.snow.p50) && (d.snow.p90 > 0.5)) {
      line(t('out.day.snow'), t('out.day.snowRange', { p50: dec(d.snow.p50, 0), p90: dec(d.snow.p90, 0) }));
    }
    line(t('out.day.wind'), `${fmtWind(d.wind.p50, state.unit)}–${fmtWind(d.wind.p90, state.unit)} ${windUnitLabel(state.unit)}`);

    const agree = agreement(d.spread);
    if (agree) {
      el('span', { class: `tag agree-${agree}`, text: t(`out.agree.${agree}`, { spread: dec(d.spread, 0) }) }, card);
    }
  }
}

const FAN_UNITS = { tmax: '°C', snow: 'cm', windMax: null };

function renderFanChart() {
  const node = $('#fan');
  if (!state.rows.length) { node.textContent = ''; return; }
  const metric = state.metric;
  renderFan(node, {
    fan: fan(state.rows, metric),
    lines: trajectories(state.rows, metric).lines,
    unit: FAN_UNITS[metric] ?? windUnitLabel(state.unit),
    zero: metric !== 'tmax',
    label: t(`out.metric.${metric}.label`, { z: state.band }),
  });
  $('#fan-note').textContent = t(`out.metric.${metric}.note`);
}

function renderMl() {
  const node = $('#ml-facts');
  node.textContent = '';
  const ml = state.ml;
  const card = (k, v, unit, d, cls) => {
    const box = el('div', { class: `intel ${cls ?? ''}`.trim() }, node);
    el('div', { class: 'k', text: k }, box);
    const val = el('div', { class: 'v' }, box);
    val.append(document.createTextNode(v));
    if (unit) el('small', { text: ` ${unit}` }, val);
    if (d) el('div', { class: 'd', text: d }, box);
  };

  if (!ml) {
    $('#ml-note').textContent = t('out.ml.none');
    return;
  }
  const s = ml.scores ?? {};
  const on = !!ml.precip?.use;
  if (Number.isFinite(s.brierBase)) {
    card(t('out.ml.brierBase'), dec(s.brierBase, 3), null, t('out.ml.brierBaseNote'));
  }
  if (Number.isFinite(s.brierMl)) {
    const better = s.brierMl < s.brierBase;
    card(t('out.ml.brierMl'), dec(s.brierMl, 3), null,
      t(better ? 'out.ml.brierBetter' : 'out.ml.brierWorse'), better ? 'good' : 'warn');
  }
  if (Number.isFinite(s.maeBaseT) && Number.isFinite(s.maeMlT)) {
    card(t('out.ml.temp'), `${s.maeMlT < s.maeBaseT ? '−' : '+'}${dec(Math.abs(s.maeBaseT - s.maeMlT), 2)}`,
      '°C', t('out.ml.tempNote'), ml.temp?.use ? 'good' : '');
  }
  card(t('out.ml.trained'), dec(ml.n ?? 0, 0), t('out.ml.hours'), t('out.ml.trainedNote', { n: ml.nHold ?? 0 }));

  $('#ml-note').textContent = on
    ? t('out.ml.noteOn', { truth: ml.truthModel ?? 'ERA5-Land' })
    : t('out.ml.noteOff');
}

function renderBandPickerOnce() {
  const node = $('#out-band');
  if (node.children.length) return;
  for (const z of [...OUTLOOK.bands].reverse()) {
    const b = el('button', { type: 'button', text: `${z} m`, class: z === state.band ? 'on' : '' }, node);
    b.dataset.band = String(z);
    b.setAttribute('aria-pressed', String(z === state.band));
    b.addEventListener('click', () => {
      state.band = z;
      $$('#out-band button').forEach((x) => {
        x.classList.toggle('on', x === b);
        x.setAttribute('aria-pressed', String(x === b));
      });
      recompute();
      render();
    });
  }
}

/** Painted last: applyTranslations() rewrites the pill's markup on every render. */
function status() {
  if (state.error) return setStatus('error', t('status.noData'));
  if (!state.ensemble) return setStatus('working', t('status.fetching'));
  setStatus('live', t('status.live', { age: ago(state.cachedAt) }));
}

function render() {
  applyTranslations();
  renderBandPickerOnce();
  renderPills();
  renderHeadline();
  renderGrid();
  renderDays();
  renderFanChart();
  renderMl();
  status();
}

/* ---------- events ---------- */

for (const b of $$('#fan-metric button')) {
  b.setAttribute('aria-pressed', String(b.classList.contains('on')));
  b.addEventListener('click', () => {
    state.metric = b.dataset.metric;
    $$('#fan-metric button').forEach((x) => {
      x.classList.toggle('on', x === b);
      x.setAttribute('aria-pressed', String(x === b));
    });
    renderFanChart();
  });
}

$('#status-pill').addEventListener('click', () => load(state.mountainId, { force: true }));
addEventListener('hashchange', () => {
  const id = location.hash.slice(1);
  if (MOUNTAINS.some((m) => m.id === id) && id !== state.mountainId) load(id);
});

applyTranslations();
renderLangToggle($('#lang-toggle'), render);
load(initialMountain());

if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
