/* Trip planning.
 *
 * The single-peak view answers "what is Åreskutan doing", the comparison view
 * answers "where should I go on Saturday". Neither answers the question a
 * visitor actually starts with: "I am there from Friday to Tuesday — what am I
 * going to be able to do, and what do I need to bring?"
 *
 * Inside the forecast horizon that is a search over peaks and sports. Outside
 * it, honesty demands climatology instead of a forecast, clearly labelled as
 * such — a seven-day model run has nothing to say about a trip in March.
 */

import { APP, MOUNTAINS, activitiesFor } from './config.js';
import { fetchSurface, fetchAux, fetchClimate, keepClimate } from './api.js';
import { assemble, dailySummaries } from './forecast.js';
import { summarise, weekly, dayOfYear } from './climate.js';
import { setStatus } from './ui.js';
import { $, el, store, dec, scoreColor, fmtDay, fmtDayMonth, fmtClock, isoDate, nowIsoHour, ago } from './util.js';
import { t, tr, applyTranslations, renderLangToggle } from './i18n.js';

const NS = `areweather.${APP.version}`;
const MAX_NIGHTS = 21;

const state = {
  from: store.get(`${NS}.tripFrom`) ?? null,
  to: store.get(`${NS}.tripTo`) ?? null,
  rows: MOUNTAINS.map((mtn) => ({ mtn, model: null, error: null })),
  climate: null,
  loaded: 0,
  cachedAt: null,
};

/* ---------- dates ---------- */
const addDays = (iso, n) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return isoDate(d);
};
const today = () => nowIsoHour(APP.timezone).slice(0, 10);
const nights = (from, to) => Math.round((new Date(`${to}T12:00:00`) - new Date(`${from}T12:00:00`)) / 864e5);

function datesIn(from, to) {
  const out = [];
  for (let d = from; d <= to && out.length <= MAX_NIGHTS + 1; d = addDays(d, 1)) out.push(d);
  return out;
}

/* ---------- loading ---------- */
async function pool(items, limit, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await fn(items[next++]);
  }));
}

async function loadRow(row) {
  try {
    const [surface, aux] = await Promise.all([
      fetchSurface(row.mtn),
      fetchAux(row.mtn).catch(() => null),
    ]);
    row.model = assemble(row.mtn, {
      surface: surface.data,
      profile: aux?.data ?? null,
      ensemble: null,
      ml: store.get(`${NS}.ml.${row.mtn.id}`),
    });
    row.nowIndex = Math.max(0, row.model.hours.findIndex((h) => h.iso.slice(0, 13) === nowIsoHour(APP.timezone)));
    state.cachedAt = Math.min(state.cachedAt ?? Infinity, surface.cachedAt);
  } catch (err) {
    row.error = err?.message ?? 'no data';
  } finally {
    state.loaded++;
    render();
  }
}

/** One climatology, from the peak in the middle of the range, for dates beyond the forecast. */
async function loadClimate() {
  const reference = MOUNTAINS.find((m) => m.id === 'areskutan') ?? MOUNTAINS[0];
  try {
    const { data } = await fetchClimate(reference);
    const summary = data.raw ? summarise(data.raw) : data;
    if (!summary) return;
    if (data.raw) keepClimate(reference.id, summary);
    state.climate = { ...summary, weeks: weekly(summary), mtn: reference };
    render();
  } catch { /* the itinerary still works, it just stops at the horizon */ }
}

async function loadAll() {
  render();
  await Promise.all([
    pool(state.rows, 3, loadRow),
    loadClimate(),
  ]);
  render();
}

/* The status pill lives in markup that applyTranslations() rewrites on every
   render, so it is painted last rather than at the moment the state changes. */
function status() {
  if (state.loaded < state.rows.length) return setStatus('working', t('status.scoring', { n: state.rows.length }));
  if (state.rows.every((r) => r.error)) return setStatus('error', t('status.noData'));
  setStatus('live', t('status.live', { age: ago(state.cachedAt) }));
}

/* ---------- the search ---------- */

/**
 * Best (peak, sport, window) combinations for one date.
 * Every peak is scored for every sport it supports, then the list is thinned so
 * three suggestions mean three different things to do rather than one mountain
 * three times.
 */
function optionsFor(date) {
  const found = [];
  for (const row of state.rows) {
    if (!row.model) continue;
    for (const activity of activitiesFor(row.mtn)) {
      const days = dailySummaries(row.model, activity.id, { fromIndex: row.nowIndex });
      const day = days.find((d) => d.date === date);
      if (!day || !Number.isFinite(day.best.score)) continue;
      found.push({ row, activity, day });
    }
  }
  found.sort((a, b) => b.day.best.score - a.day.best.score);

  const picks = [];
  const seenActivity = new Set();
  for (const option of found) {
    if (seenActivity.has(option.activity.id)) continue;
    seenActivity.add(option.activity.id);
    picks.push(option);
    if (picks.length === 3) break;
  }
  return { picks, all: found };
}

/* ---------- packing, derived from the window ---------- */
const PACK_RULES = [
  { id: 'faceProtection', test: (x) => x.minFeels <= -15 },
  { id: 'insulation', test: (x) => x.minFeels <= -5 },
  { id: 'windShell', test: (x) => x.maxWind >= 15 },
  { id: 'rainShell', test: (x) => x.maxRain >= 4 },
  { id: 'spareSocks', test: (x) => x.wetDays >= 2 },
  { id: 'goggles', test: (x) => x.maxWind >= 12 && x.snowDays >= 1 },
  { id: 'avalancheKit', test: (x) => x.maxNewSnow >= 10 && x.snowCover },
  { id: 'skiCrampons', test: (x) => x.freezeThaw && x.snowCover },
  { id: 'headlamp', test: (x) => x.minDaylight <= 8 },
  { id: 'sunglasses', test: (x) => x.snowCover && x.maxDaylight >= 10 },
  { id: 'traction', test: (x) => x.freezeThaw && !x.snowCover },
  { id: 'thunder', test: (x) => x.thunder },
];

function packingFacts(dates) {
  const facts = {
    minFeels: Infinity, maxWind: 0, maxRain: 0, maxNewSnow: 0,
    wetDays: 0, snowDays: 0, snowCover: false, freezeThaw: false, thunder: false,
    minDaylight: 24, maxDaylight: 0, days: 0,
  };
  for (const date of dates) {
    const row = state.rows.find((r) => r.model);
    if (!row) continue;
    const hours = row.model.hours.filter((h) => h.iso.slice(0, 10) === date);
    if (!hours.length) continue;
    facts.days++;
    const feels = hours.map((h) => h.summit.feels).filter(Number.isFinite);
    const winds = hours.map((h) => h.summit.gust).filter(Number.isFinite);
    const rain = hours.reduce((a, h) => a + (h.summit.rain || 0), 0);
    const snow = hours.reduce((a, h) => a + (h.summit.snowCm || 0), 0);
    const temps = hours.map((h) => h.summit.temp).filter(Number.isFinite);
    if (feels.length) facts.minFeels = Math.min(facts.minFeels, ...feels);
    if (winds.length) facts.maxWind = Math.max(facts.maxWind, ...winds);
    facts.maxRain = Math.max(facts.maxRain, rain);
    facts.maxNewSnow = Math.max(facts.maxNewSnow, snow);
    if (rain >= 1) facts.wetDays++;
    if (snow >= 1) facts.snowDays++;
    if (hours.some((h) => Number.isFinite(h.snowDepth) && h.snowDepth > 0.1)) facts.snowCover = true;
    if (temps.length && Math.min(...temps) < 0 && Math.max(...temps) > 0) facts.freezeThaw = true;
    if (hours.some((h) => Number.isFinite(h.cape) && h.cape > 700)) facts.thunder = true;
    const light = hours.filter((h) => h.daylight).length;
    facts.minDaylight = Math.min(facts.minDaylight, light);
    facts.maxDaylight = Math.max(facts.maxDaylight, light);
  }
  if (!Number.isFinite(facts.minFeels)) facts.minFeels = 0;
  return facts;
}

/* ---------- rendering ---------- */
function render() {
  applyTranslations();
  status();
  renderPresets();
  const from = state.from ?? today();
  const to = state.to ?? addDays(from, 4);
  $('#trip-from').value = from;
  $('#trip-to').value = to;

  const dates = datesIn(from, to);
  const summary = $('#trip-summary');
  summary.textContent = '';
  if (!dates.length || nights(from, to) < 0) {
    el('p', { class: 'sub', text: t('trip.badRange') }, summary);
    return;
  }
  el('p', { class: 'trip-count', html: t('trip.range', { nights: Math.max(0, nights(from, to)), days: dates.length, from: fmtDayMonth(new Date(`${from}T12:00:00`)), to: fmtDayMonth(new Date(`${to}T12:00:00`)) }) }, summary);

  renderPacking(dates);
  renderItinerary(dates);
}

function renderPresets() {
  const node = $('#trip-presets');
  node.textContent = '';
  const options = [
    { id: 'weekend', from: 0, nights: 2 },
    { id: 'week', from: 0, nights: 6 },
    { id: 'next', from: 7, nights: 6 },
  ];
  for (const option of options) {
    const b = el('button', { type: 'button', class: 'preset', text: t(`trip.preset.${option.id}`) }, node);
    b.addEventListener('click', () => {
      const from = addDays(today(), option.from);
      setRange(from, addDays(from, option.nights));
    });
  }
}

function setRange(from, to) {
  state.from = from;
  state.to = to;
  store.set(`${NS}.tripFrom`, from);
  store.set(`${NS}.tripTo`, to);
  render();
}

function renderPacking(dates) {
  const node = $('#packing');
  node.textContent = '';
  const inRange = dates.filter((d) => state.rows.some((r) => r.model?.hours.some((h) => h.iso.startsWith(d))));
  if (!inRange.length) {
    el('p', { class: 'sub', text: t('trip.packBeyond') }, node);
    return;
  }
  const facts = packingFacts(inRange);
  const hits = PACK_RULES.filter((rule) => rule.test(facts));

  const stats = el('div', { class: 'intel-grid' }, node);
  const stat = (k, v, d) => {
    const c = el('div', { class: 'intel' }, stats);
    el('div', { class: 'k', text: k }, c);
    el('div', { class: 'v', html: v }, c);
    el('div', { class: 'd', text: d }, c);
  };
  stat(t('trip.coldest'), `${dec(facts.minFeels, 0)}<small>°</small>`, t('trip.coldestSub'));
  stat(t('trip.windiest'), `${dec(facts.maxWind, 0)}<small> m/s</small>`, t('trip.windiestSub'));
  stat(t('trip.wettest'), `${dec(facts.maxRain, 1)}<small> mm</small>`, t('trip.wettestSub'));
  stat(t('trip.snowiest'), `${dec(facts.maxNewSnow, 1)}<small> cm</small>`, t('trip.snowiestSub'));

  const list = el('ul', { class: 'pack-list' }, node);
  if (!hits.length) {
    el('li', { text: t('pack.nothingSpecial') }, list);
  } else {
    for (const rule of hits) {
      const li = el('li', {}, list);
      li.innerHTML = `<b>${t(`pack.${rule.id}`)}</b> — ${t(`pack.${rule.id}.why`)}`;
    }
  }
  el('p', { class: 'ml-note', style: 'margin-top:12px', text: t('trip.packNote', { days: facts.days }) }, node);
}

function renderItinerary(dates) {
  const root = $('#itinerary');
  root.textContent = '';
  for (const date of dates) {
    const section = el('section', { class: 'card trip-day' }, root);
    const head = el('div', { class: 'card-head' }, section);
    const headText = el('div', {}, head);
    const dateObj = new Date(`${date}T12:00:00`);
    el('h2', { text: fmtDay(dateObj) }, headText);

    const { picks } = optionsFor(date);
    if (picks.length) {
      el('p', { class: 'sub', text: t('trip.dayForecast') }, headText);
      const grid = el('div', { class: 'picks' }, section);
      picks.forEach((option, i) => {
        const tone = scoreColor(option.day.best.score);
        const card = el('a', { class: 'pick', href: `./#${option.row.mtn.id}` }, grid);
        card.style.setProperty('--tone', tone);
        el('div', { class: 'rank', text: i === 0 ? t('trip.bestOfDay') : tr(option.activity.short) }, card);
        el('div', { class: 'name', text: option.row.mtn.name }, card);
        el('div', { class: 'when', text: `${tr(option.activity.name)} · ${fmtClock(option.day.best.startTime)}–${fmtClock(option.day.best.endTime)}` }, card);
        const score = el('div', { class: 'score', text: Math.round(option.day.best.score) }, card);
        score.style.color = tone;
        const why = el('div', { class: 'why' }, card);
        why.innerHTML = `<b>${t(option.day.best.labelKey)}</b> — ${option.day.best.why.length
          ? t('compare.limitedBy', { factors: option.day.best.why.map(tr).join(', ') })
          : t('compare.nothingHolding')}. ${dec(option.day.tMax, 0)}° / ${dec(option.day.tMin, 0)}°, `
          + `${t('compare.tip.wind').toLowerCase()} ${dec(option.day.windMax, 1)} m/s.`;
      });
    } else if (state.climate) {
      el('p', { class: 'sub', text: t('trip.dayClimate') }, headText);
      renderClimateDay(section, date);
    } else {
      el('p', { class: 'sub', text: t('trip.dayUnknown') }, headText);
    }
  }
}

function renderClimateDay(section, date) {
  const doy = dayOfYear(date);
  const norm = state.climate.days[doy];
  if (!norm) return;
  const grid = el('div', { class: 'intel-grid' }, section);
  const stat = (k, v, d) => {
    const c = el('div', { class: 'intel' }, grid);
    el('div', { class: 'k', text: k }, c);
    el('div', { class: 'v', html: v }, c);
    if (d) el('div', { class: 'd', text: d }, c);
  };
  stat(t('trip.normalDay'), `${dec(norm.tmaxP50, 0)}<small>°</small>`, t('trip.normalRange', { lo: dec(norm.tmaxP10, 0), hi: dec(norm.tmaxP90, 0) }));
  stat(t('trip.normalNight'), `${dec(norm.tminP50, 0)}<small>°</small>`, '');
  stat(t('trip.normalWind'), `${dec(norm.windP50, 0)}<small> m/s</small>`, t('trip.normalWindSub', { n: dec(norm.windP90, 0) }));
  stat(t('trip.wetOdds'), `${Math.round((norm.wetShare ?? 0) * 100)}<small>%</small>`, t('trip.wetOddsSub'));
  stat(t('trip.snowOdds'), `${Math.round((norm.snowShare ?? 0) * 100)}<small>%</small>`, t('trip.snowOddsSub'));
  el('p', { class: 'ml-note', style: 'margin-top:12px', text: t('trip.climateNote', { years: state.climate.years, mtn: state.climate.mtn.name }) }, section);
}

/* ---------- events ---------- */
$('#trip-from').addEventListener('change', (e) => {
  const from = e.target.value || today();
  const to = state.to && state.to >= from ? state.to : addDays(from, 4);
  setRange(from, to);
});
$('#trip-to').addEventListener('change', (e) => {
  const to = e.target.value || addDays(state.from ?? today(), 4);
  setRange(state.from ?? today(), to);
});
$('#status-pill').addEventListener('click', () => location.reload());

const start = state.from && state.from >= today() ? state.from : today();
state.from = start;
state.to = state.to && state.to >= start ? state.to : addDays(start, 4);
$('#trip-from').min = today();
$('#trip-to').min = today();

render();
renderLangToggle($('#lang-toggle'), render);
loadAll();

if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
