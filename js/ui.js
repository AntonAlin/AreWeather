/* Panel rendering. Everything reads from the assembled forecast model; nothing
   here recomputes meteorology. */

import { el, $, fmtWind, windUnitLabel, compass, fmtClock, fmtWeekday, fmtDayMonth, scoreColor, rampCss, TEMP_STOPS, WIND_STOPS, ago, dec } from './util.js';
import { bestWindow } from './forecast.js';
import { solarPosition, utcFromWallClock, aspectAnalysis, aspectAdvice } from './physics.js';
import { renderAspectRose, renderClimateYear } from './charts.js';
import { APP } from './config.js';
import { MOUNTAINS } from './config.js';
import { t, tr, wmoLabel } from './i18n.js';

/* ---------- mountain rail ---------- */
export function renderRail(node, activeId, onPick) {
  node.textContent = '';
  for (const m of MOUNTAINS) {
    const b = el('button', {
      class: `mtn-chip${m.id === activeId ? ' on' : ''}`, type: 'button',
      'aria-pressed': m.id === activeId ? 'true' : 'false',
      'aria-label': t('rail.aria', { name: m.name, m: m.summit }),
    }, node);
    el('span', { class: 'n', text: m.name }, b);
    el('span', { class: 'e', text: `${dec(m.summit, 0)} m` }, b);
    b.addEventListener('click', () => onPick(m.id));
    if (m.id === activeId) {
      // Scroll the rail itself rather than calling scrollIntoView on the button:
      // scrollIntoView moves the browser's sequential-focus starting point onto
      // that element, which makes the first Tab press skip the entire header.
      requestAnimationFrame(() => {
        const target = b.offsetLeft - (node.clientWidth - b.offsetWidth) / 2;
        node.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
      });
    }
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
  el('span', { class: 'tag', text: wmoLabel(h.weatherCode) ?? tr(model.mtn.tags[0]) }, eyebrow);
  el('span', { text: '·' }, eyebrow);
  el('span', { text: state.selected === state.nowIndex ? t('time.now') : `${fmtClock(h.time)} ${fmtWeekday(h.time)}` }, eyebrow);
  el('span', { text: '·' }, eyebrow);
  el('span', { text: t('hero.models', { n: model.modelKeys.length }), title: model.modelKeys.join(', ') }, eyebrow);

  el('h1', { text: model.mtn.name }, main);
  const meta = el('p', { class: 'hero-meta' }, main);
  meta.innerHTML = `<span class="num">${dec(model.mtn.summit, 0)}&nbsp;m</span> ${t('hero.summit')} · `
    + `<span class="num">${dec(model.mtn.summit - model.mtn.base, 0)}&nbsp;m</span> ${t('hero.vertical')} · `
    + `<span class="num">${model.mtn.lat.toFixed(3)}°N ${model.mtn.lon.toFixed(3)}°E</span>`;

  const now = el('div', { class: 'hero-now' }, main);
  const temp = el('div', { class: 'big-temp' }, now);
  temp.innerHTML = `${dec(s.temp, 0)}<sup>°C</sup>`;
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
  fact(t('hero.feels'), `${dec(s.feels, 0)}°`);
  fact(t('hero.wind'), fmtWind(s.wind, unit), `${u} ${compass(s.dir)}`);
  fact(t('hero.gusts'), fmtWind(s.gust, unit), u);
  fact(t('hero.humidity'), `${dec(s.rh, 0)}`, '%');
  if (h.newSnow24 > 0.4) fact(t('hero.newSnow24'), `${dec(h.newSnow24, 1)}`, 'cm');
  else fact(t('hero.precip24'), `${dec(h.precip24, 1)}`, 'mm');

  el('p', { class: 'hero-summary', html: summaryLine(model, h, unit) }, main);

  /* the activity board */
  const side = el('div', { class: 'hero-side' }, grid);
  renderActivityBoard(side, model, state, h);
}

/**
 * Every activity this peak supports, ranked by how good it is right now.
 * Ranking rather than a fixed order is the point: the question is "what is this
 * mountain good for today", and in November that answer changes weekly.
 */
function renderActivityBoard(side, model, state, h) {
  const acts = model.activities;
  const head = el('div', { class: 'act-head' }, side);
  el('span', { text: t('hero.conditionsFor') }, head);
  el('span', { class: 'muted', text: t('hero.activityCount', { n: acts.length }) }, head);

  const ranked = [...acts].sort((a, b) => h.scores[b.id].score - h.scores[a.id].score);
  const board = el('div', { class: 'act-board' }, side);

  for (const activity of ranked) {
    const v = h.scores[activity.id];
    const focused = activity.id === state.activity;
    const row = el('button', {
      type: 'button', class: `act-row${focused ? ' on' : ''}`,
      'aria-pressed': focused ? 'true' : 'false',
      title: tr(activity.blurb),
    }, board);
    const top = el('div', { class: 'act-top' }, row);
    el('span', { class: 'act-name', text: tr(activity.name) }, top);
    const score = el('span', { class: 'act-score num', text: v.score }, top);
    score.style.color = scoreColor(v.score);
    const bar = el('div', { class: 'act-bar' }, row);
    const fill = el('i', {}, bar);
    fill.style.width = `${Math.max(2, v.score)}%`;
    fill.style.background = scoreColor(v.score);
    const verdict = t(v.labelKey);
    el('div', {
      class: 'act-why',
      text: v.why.length ? t('verdict.limitedBy', { label: verdict, factors: v.why.map(tr).join(', ') }) : verdict,
    }, row);
    row.addEventListener('click', () => state.onActivity?.(activity.id));
  }

  /* The focused activity gets the next 48 hours and its best window. */
  const activity = acts.find((a) => a.id === state.activity) ?? ranked[0];
  const detail = el('div', { class: 'act-detail' }, side);
  const win = bestWindow(model.hours.slice(state.nowIndex), activity.id, { within: 48 });
  const strip = el('div', { class: 'window-strip' }, detail);
  const pool = model.hours.slice(state.nowIndex, state.nowIndex + 48);
  const stepN = Math.max(1, Math.round(pool.length / 24));
  for (let i = 0; i < pool.length; i += stepN) {
    const chunk = pool.slice(i, i + stepN);
    const avg = chunk.reduce((a, x) => a + x.scores[activity.id].score, 0) / chunk.length;
    const cell = el('i', {}, strip);
    const inner = el('span', {}, cell);
    inner.style.background = scoreColor(avg);
    inner.style.opacity = chunk[0].daylight ? '.95' : '.4';
    cell.title = `${fmtClock(chunk[0].time)} — ${tr(activity.short)} ${Math.round(avg)}`;
  }
  const legend = el('div', { class: 'window-legend' }, detail);
  el('span', { text: t('hero.next48', { activity: tr(activity.short) }) }, legend);
  el('span', {
    text: win ? t('hero.bestWindow', {
      from: fmtClock(win.start), to: fmtClock(win.end),
      day: fmtWeekday(win.start), score: Math.round(win.score),
    }) : '',
  }, legend);
}

function summaryLine(model, h, unit) {
  const s = h.summit;
  const u = windUnitLabel(unit);
  const bits = [t('summary.headline', {
    temp: dec(s.temp, 0), wind: fmtWind(s.wind, unit), unit: u,
    dir: compass(s.dir), feels: dec(s.feels, 0),
  })];
  if (h.inversion) bits.push(t('summary.inversion'));
  else if (Number.isFinite(h.lapse)) bits.push(t('summary.lapse', { lapse: dec(h.lapse, 1), valley: dec(h.valley.temp, 0) }));
  if (Number.isFinite(h.snowLine)) bits.push(t('summary.snowLine', { z: dec(Math.round(h.snowLine / 10) * 10, 0) }));
  else if (h.precip24 > 1) bits.push(h.summit.phase === 'snow' ? t('summary.allSnow') : t('summary.allRain'));
  if (h.newSnow24 > 1) bits.push(t('summary.newSnow', { cm: dec(h.newSnow24, 1) }));
  if (h.summitInCloud) bits.push(t('summary.inCloud'));
  if (h.drift > 40) bits.push(t('summary.drift', { n: h.drift }));
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
  card(t('intel.freezing'), Number.isFinite(fl) ? `${dec(Math.round(fl / 10) * 10, 0)}<small> m</small>` : '–',
    Number.isFinite(fl)
      ? (fl < model.mtn.summit
        ? t('intel.freezing.below', { m: dec(model.mtn.summit - fl, 0) })
        : t('intel.freezing.above'))
      : t('intel.freezing.none'),
    Number.isFinite(fl) && fl < model.mtn.base ? 'good' : '');

  card(t('intel.snowLine'),
    Number.isFinite(h.snowLine) ? `${dec(Math.round(h.snowLine / 10) * 10, 0)}<small> m</small>` : (h.summit.phase === 'snow' ? t('intel.snowLine.below') : '–'),
    t('intel.snowLine.sub'));

  card(t('intel.cloudBase'), Number.isFinite(h.cloudBase) ? `${dec(Math.round(h.cloudBase / 10) * 10, 0)}<small> m</small>` : '–',
    h.summitInCloud ? t('intel.cloudBase.in') : t('intel.cloudBase.clear'),
    h.summitInCloud ? 'warn' : 'good');

  const chill = h.summit.feels;
  card(t('intel.chill'), Number.isFinite(chill) ? `${dec(chill, 0)}<small>°</small>` : '–',
    chill < -25 ? t('intel.chill.severe') : chill < -12 ? t('intel.chill.cold') : t('intel.chill.ok'),
    chill < -25 ? 'danger' : chill < -12 ? 'warn' : '');

  card(t('intel.wind'), `${fmtWind(h.summit.wind, unit)}<small> ${u}</small>`,
    t('intel.wind.sub', { gust: fmtWind(h.summit.gust, unit), unit: u, dir: compass(h.summit.dir) }),
    h.summit.gust > 25 ? 'danger' : h.summit.wind > 15 ? 'warn' : '');

  card(t('intel.drift'), `${h.drift}<small>/100</small>`,
    h.drift > 60 ? t('intel.drift.high') : h.drift > 25 ? t('intel.drift.some') : t('intel.drift.low'),
    h.drift > 60 ? 'danger' : h.drift > 25 ? 'warn' : '');

  card(t('intel.lapse'), Number.isFinite(h.lapse) ? `${dec(h.lapse, 1)}<small>°/100 m</small>` : '–',
    h.inversion ? t('intel.lapse.inversion') : h.haveSounding ? t('intel.lapse.sounding') : t('intel.lapse.fallback'),
    h.inversion ? 'warn' : '');

  card(t('intel.newSnow'), `${dec(h.newSnow24, 1)}<small> cm</small>`,
    t('intel.newSnow.sub', {
      mm: dec(h.precip24, 1),
      ratio: Math.round(h.newSnow24 > 0 ? (h.newSnow24 * 10) / Math.max(0.1, h.precip24) : 10),
    }),
    h.newSnow24 > 20 ? 'warn' : h.newSnow24 > 5 ? 'good' : '');

  card(t('intel.pop'), h.pop !== null && Number.isFinite(h.pop) ? `${dec(h.pop * 100, 0)}<small>%</small>` : '–',
    model.ml?.precip?.use ? t('intel.pop.calibrated') : t('intel.pop.raw'));

  if (Number.isFinite(h.visibility)) {
    card(t('intel.visibility'), h.visibility >= 20000 ? '20+<small> km</small>' : `${dec(h.visibility / 1000, 1)}<small> km</small>`,
      t('intel.visibility.sub'),
      h.visibility < 1000 ? 'danger' : h.visibility < 5000 ? 'warn' : 'good');
  }
  if (Number.isFinite(h.snowDepth)) {
    card(t('intel.snowDepth'), `${dec(h.snowDepth * 100, 0)}<small> cm</small>`, t('intel.snowDepth.sub'),
      h.snowDepth > 0.4 ? 'good' : h.snowDepth < 0.05 ? '' : 'warn');
  }
  card(t('intel.spread'), `±${dec(h.spreadT / 2, 1)}<small>°</small>`,
    h.spreadT < 1.5 ? t('intel.spread.tight') : h.spreadT < 3.5 ? t('intel.spread.normal') : t('intel.spread.wide'),
    h.spreadT > 3.5 ? 'warn' : h.spreadT < 1.5 ? 'good' : '');

  if (Number.isFinite(h.cape) && h.cape > 200) {
    card(t('intel.cape'), `${dec(h.cape, 0)}<small> J/kg</small>`,
      h.cape > 800 ? t('intel.cape.high') : t('intel.cape.some'), h.cape > 800 ? 'danger' : 'warn');
  }
  const day = model.daily.find((d) => d.date === h.iso.slice(0, 10));
  if (day?.sunrise && day?.sunset) {
    const hours = dec((day.sunset - day.sunrise) / 3.6e6, 1);
    card(t('intel.daylight'), `${fmtClock(day.sunrise)}<small>–${fmtClock(day.sunset)}</small>`,
      Number.isFinite(day.uv) ? t('intel.daylight.uv', { hours, uv: dec(day.uv, 1) }) : t('intel.daylight.sub', { hours }));
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
    name.innerHTML = `${r.meta?.name ?? r.key}<small>${r.meta?.org ?? ''}${r.meta?.res ? ` · ${r.meta.res}` : ''}${Number.isFinite(r.meta?.maeT) ? ` · MAE ${dec(r.meta.maeT, 2)}°` : ''}</small>`;
    el('div', { class: 'model-weight num', text: `${Math.round(r.weight * 100)}%` }, row);
    const track = el('div', { class: 'model-track' }, row);
    const bar = el('i', {}, track);
    bar.style.width = `${(r.weight / maxW) * 100}%`;
    const v = el('div', { class: 'model-val num' }, row);
    v.innerHTML = Number.isFinite(r.t)
      ? `${dec(r.t, 1)}° <small>${fmtWind(r.w, state.unit)}</small>`
      : `<small>${t('models.noData')}</small>`;
  }

  const foot = el('p', { class: 'ml-note' }, node);
  foot.style.marginTop = '12px';
  foot.innerHTML = model.ml?.skill?.length
    ? t('models.foot', {
      truth: model.ml.truthModel === 'era5_land' ? 'ERA5-Land' : 'ERA5',
      n: model.ml.n,
      hour: fmtClock(h.time),
    })
    : t('models.footPrior');
}

/* ---------- learning log ---------- */
export function renderML(node, model) {
  const ml = model.ml;
  node.textContent = '';
  const head = el('div', { class: 'ml-head' }, node);

  if (!ml) {
    el('span', { class: 'ml-badge', text: t('ml.training') }, head);
    el('p', { class: 'ml-note', text: t('ml.trainingNote') }, node);
    return;
  }
  if (ml.insufficient) {
    el('span', { class: 'ml-badge no', text: t('ml.insufficient') }, head);
    el('p', { class: 'ml-note', html: t('ml.insufficientNote', { n: ml.n }) }, node);
    return;
  }

  const improved = ml.temp?.use;
  el('span', { class: `ml-badge ${improved ? 'ok' : 'no'}`, text: improved ? t('ml.active') : t('ml.disabled') }, head);
  el('span', {
    class: 'ml-note',
    text: t('ml.meta', {
      n: ml.n, from: ml.range?.start_date, to: ml.range?.end_date,
      truth: ml.truthModel === 'era5_land' ? 'ERA5-Land 9 km' : 'ERA5',
    }),
  }, head);

  const grid = el('div', { class: 'ml-metrics' }, node);
  const metric = (k, v, tone) => {
    const m = el('div', { class: 'ml-metric' }, grid);
    el('div', { class: 'k', text: k }, m);
    const val = el('div', { class: 'v', html: v }, m);
    if (tone) val.style.color = tone;
  };
  const sc = ml.scores;
  metric(t('ml.rawMae'), `${dec(sc.rawMaeT, 2)}<small>°C</small>`);
  metric(t('ml.weightedMae'), `${dec(sc.maeBaseT, 2)}<small>°C</small>`, sc.maeBaseT < sc.rawMaeT ? '#a3e635' : undefined);
  metric(t('ml.correctedMae'), `${dec(sc.maeMlT, 2)}<small>°C</small>`, improved ? '#a3e635' : '#fbbf24');
  if (Number.isFinite(sc.maeBaseW)) {
    metric(t('ml.windMae'), `${dec(sc.maeBaseW, 2)} → ${Number.isFinite(sc.maeMlW) ? dec(sc.maeMlW, 2) : '–'}<small> m/s</small>`,
      ml.wind?.use ? '#a3e635' : undefined);
  }
  if (Number.isFinite(sc.brierBase)) {
    metric(t('ml.brier'), `${dec(sc.brierBase, 3)} → ${Number.isFinite(sc.brierMl) ? dec(sc.brierMl, 3) : '–'}`,
      ml.precip?.use ? '#a3e635' : undefined);
  }

  const top = ml.skill[0];
  const note = el('p', { class: 'ml-note' }, node);
  note.innerHTML = improved
    ? t('ml.gain', {
      n: ml.nHold,
      pct: dec(((sc.maeBaseT - sc.maeMlT) / sc.maeBaseT) * 100, 1),
      model: top.name, org: top.org, mae: dec(top.maeT, 2), weight: Math.round(top.weight * 100),
    })
    : t('ml.noGain', { ml: dec(sc.maeMlT, 2), base: dec(sc.maeBaseT, 2) });

  const note2 = el('p', { class: 'ml-note' }, node);
  note2.style.marginTop = '8px';
  note2.innerHTML = t('ml.caveat');
}

/* ---------- observations ---------- */
export function renderObservations(node, model, obs, state) {
  node.textContent = '';
  const u = windUnitLabel(state.unit);

  if (!obs) {
    el('div', { class: 'obs-empty', html: t('obs.none', { mtn: model.mtn.name }) }, node);
    return;
  }

  const ref = obs.reference;
  const cmp = ref.comparison;

  /* The headline: is the forecast running warm or cold right now? */
  const head = el('div', { class: 'obs-head' }, node);
  if (cmp?.modelled?.temp && Number.isFinite(cmp.modelled.temp.delta)) {
    const d = cmp.modelled.temp.delta;
    const big = el('div', { class: 'obs-delta' }, head);
    big.innerHTML = `<span class="num">${d > 0 ? '+' : '−'}${dec(Math.abs(d), 1)}°</span>`;
    big.style.color = Math.abs(d) < 1 ? 'var(--lime)' : Math.abs(d) < 2.5 ? 'var(--amber)' : 'var(--rose)';
    const state2 = Math.abs(d) < 0.5 ? t('obs.state.spot') : d > 0 ? t('obs.state.warm') : t('obs.state.cold');
    const txt = el('div', { class: 'obs-headline' }, head);
    txt.innerHTML = t('obs.headline', {
      state: state2, station: ref.station.name,
      km: dec(ref.station.km, 1), height: dec(ref.station.height, 0),
    }) + '<br><span class="muted">'
      + t(cmp.stale ? 'obs.detailStale' : 'obs.detail', {
        model: dec(cmp.modelled.temp.model, 1),
        observed: dec(cmp.modelled.temp.observed, 1),
        age: dec(cmp.ageMin, 0),
      })
      + '</span>';
  } else {
    el('div', { class: 'obs-headline', text: t('obs.noMatch') }, head);
  }

  /* Every nearby station, as raw readings. */
  const list = el('div', { class: 'obs-list' }, node);
  for (const s2 of obs.stations) {
    const row = el('div', { class: 'obs-row' }, list);
    const who = el('div', { class: 'obs-who' }, row);
    el('span', { class: 'n', text: s2.station.name }, who);
    el('span', { class: 'd', text: `${dec(s2.station.km, 1)} km · ${dec(s2.station.height, 0)} m` }, who);
    const vals = el('div', { class: 'obs-vals' }, row);
    const val = (v, unit2, label) => {
      const cell = el('div', { class: 'obs-val' }, vals);
      cell.innerHTML = `<span class="num">${v}</span><small>${unit2}</small><i>${label}</i>`;
    };
    val(Number.isFinite(s2.readings.temp?.value) ? dec(s2.readings.temp.value, 1) : '–', '°C', t('obs.col.temp'));
    val(Number.isFinite(s2.readings.wind?.value) ? fmtWind(s2.readings.wind.value, state.unit) : '–', u, t('obs.col.wind'));
    val(Number.isFinite(s2.readings.gust?.value) ? fmtWind(s2.readings.gust.value, state.unit) : '–', u, t('obs.col.gust'));
    val(Number.isFinite(s2.readings.dir?.value) ? compass(s2.readings.dir.value) : '–', '', t('obs.col.from'));
    val(Number.isFinite(s2.readings.rh?.value) ? Math.round(s2.readings.rh.value) : '–', '%', t('obs.col.hum'));
  }

  /* The running scoreboard. */
  const v = obs.verification;
  const foot = el('p', { class: 'ml-note', style: 'margin-top:14px' }, node);
  if (v?.n >= 3) {
    const word = Math.abs(v.bias) < 0.4
      ? t('obs.verify.none')
      : t(v.bias > 0 ? 'obs.verify.warm' : 'obs.verify.cold', { n: dec(Math.abs(v.bias), 1) });
    foot.innerHTML = t('obs.verify', {
      n: v.n, days: dec(v.days, 1), station: ref.station.name,
      bias: dec(v.bias, 2), word, mae: dec(v.mae, 2),
    });
  } else {
    foot.innerHTML = t('obs.verifyEmpty', { n: v?.n ?? 0 });
  }
  el('p', { class: 'ml-note', style: 'margin-top:8px', html: t('obs.caveat') }, node);
}

/* ---------- climate context ---------- */
export function renderClimate(node, model, climate, state) {
  node.textContent = '';
  if (!climate) {
    el('p', { class: 'sub', text: t('climate.loading') }, node);
    return;
  }
  if (climate.error) {
    el('div', { class: 'obs-empty', html: t('climate.failed') }, node);
    return;
  }

  const day = model.dailySummary?.[state.selectedDay ?? 0];
  const context = climate.context;
  const head = el('div', { class: 'obs-head' }, node);

  if (context?.temp) {
    const { temp } = context;
    const big = el('div', { class: 'obs-delta' }, head);
    const sign = temp.anomaly > 0 ? '+' : '−';
    big.innerHTML = `<span class="num">${sign}${dec(Math.abs(temp.anomaly), 1)}°</span>`;
    const band = unusualnessTone(temp.percentile);
    big.style.color = band.colour;
    const txt = el('div', { class: 'obs-headline' }, head);
    txt.innerHTML = t('climate.headline', {
      pct: temp.pct >= 50 ? temp.pct : 100 - temp.pct,
      word: t(temp.pct >= 50 ? 'climate.warmer' : 'climate.colder'),
      date: fmtDayMonth(day?.time ?? model.hours[0].time),
      years: context.years,
      normal: dec(temp.normal, 0),
    }) + '<br><span class="muted">' + t('climate.detail', {
      normalHigh: dec(context.norm.tmaxP50, 0),
      normalLow: dec(context.norm.tminP50, 0),
      wet: Math.round((context.norm.wetShare ?? 0) * 100),
      wind: dec(context.norm.windP50, 0),
    }) + '</span>';
  } else {
    el('div', { class: 'obs-headline', text: t('climate.noContext') }, head);
  }

  const chart = el('div', { id: 'climate-year' }, node);
  const width = Math.max(320, node.clientWidth || 700);
  renderClimateYear(chart, climate.weeks, {
    width,
    todayDoy: context?.doy,
    label: t('climate.aria', { mtn: model.mtn.name, years: climate.years }),
  });

  const key = el('div', { class: 'chart-key' }, node);
  const item = (colour, label, block) => {
    const span = el('span', {}, key);
    const swatch = el('i', { class: block ? 'block' : '' }, span);
    if (block) swatch.style.background = colour;
    else swatch.style.borderTopColor = colour;
    el('span', { text: label }, span);
  };
  item('#4fd1ff', t('climate.key.high'));
  item('#a78bfa', t('climate.key.low'));
  item('rgba(79,209,255,.3)', t('climate.key.band'), true);
  item('rgba(224,242,254,.5)', t('climate.key.snow'), true);

  el('p', {
    class: 'ml-note', style: 'margin-top:12px',
    html: t('climate.caveat', { years: climate.years, from: climate.from?.slice(0, 4), to: climate.to?.slice(0, 4) }),
  }, node);
}

function unusualnessTone(percentile) {
  if (percentile >= 0.95 || percentile <= 0.05) return { colour: 'var(--rose)' };
  if (percentile >= 0.8 || percentile <= 0.2) return { colour: 'var(--amber)' };
  return { colour: 'var(--lime)' };
}

/* ---------- aspect ---------- */
export function renderAspect(node, model, state) {
  const h = model.hours[state.selected] ?? model.hours[0];
  node.textContent = '';

  const sun = solarPosition(utcFromWallClock(h.time, APP.timezone), model.mtn.lat, model.mtn.lon);
  const aspects = aspectAnalysis(h, model.mtn, sun);
  const advice = aspectAdvice(aspects);

  const wrap = el('div', { class: 'aspect-wrap' }, node);
  const roseBox = el('div', { class: 'aspect-rose' }, wrap);
  renderAspectRose(roseBox, aspects, {
    lens: state.aspectLens ?? 'wind',
    unit: state.unit,
    wind: { speed: h.summit.wind, dir: h.summit.dir },
    sun,
  });

  const side = el('div', { class: 'aspect-side' }, wrap);
  const names = (list) => list.map((b) => compass(b)).join(' / ');

  if (advice) {
    const line = (k, value, tone) => {
      const row = el('div', { class: `aspect-line ${tone ?? ''}` }, side);
      el('span', { class: 'k', text: k }, row);
      el('span', { class: 'v', text: value }, row);
    };
    line(t('aspect.sheltered'), names(advice.sheltered), 'good');
    line(t('aspect.exposed'), names(advice.exposed), 'warn');
    if (advice.loaded.length) line(t('aspect.loaded'), names(advice.loaded), 'danger');
    if (advice.sunny.length) line(t('aspect.sunny'), names(advice.sunny));
    line(t('aspect.sun'), sun.elevation > 0
      ? t('aspect.sunUp', { deg: dec(sun.elevation, 0), dir: compass(sun.azimuth) })
      : t('aspect.sunDown'));

    const verdict = el('p', { class: 'ml-note', style: 'margin-top:12px' }, side);
    verdict.innerHTML = advice.loaded.length
      ? t('aspect.verdictLoaded', { sheltered: names(advice.sheltered), loaded: names(advice.loaded) })
      : t('aspect.verdictCalm', { sheltered: names(advice.sheltered) });
  }

  el('p', { class: 'ml-note', style: 'margin-top:12px', html: t('aspect.caveat') }, node);
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
    el('span', { text: t('legend.dry') }, scale);
    const bar = el('div', { class: 'bar' }, scale);
    bar.style.background = 'linear-gradient(90deg, rgba(255,255,255,.05), #164e63, #1d4ed8, #a21caf)';
    el('span', { text: t('legend.rain') }, scale);
    const bar2 = el('div', { class: 'bar' }, scale);
    bar2.style.background = 'linear-gradient(90deg, #1e3a5f, #e0f2fe)';
    el('span', { text: t('legend.snow') }, scale);
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
  key('#ffffff', t('legend.snowLine'), true);
  key('#fbbf24', t('legend.freezing'), true);
  key('rgba(0,0,0,.5)', t('legend.night'));
  el('span', { class: 'muted', text: t('legend.click') }, keys);
}

export function renderBandPicker(node, model, state, onPick) {
  node.textContent = '';
  const heights = [...model.bandHeights].reverse();
  for (const z of heights) {
    const summit = z === model.mtn.summit;
    const b = el('button', {
      type: 'button', class: z === state.bandZ ? 'on' : '',
      'aria-pressed': z === state.bandZ ? 'true' : 'false',
      'aria-label': t(summit ? 'band.ariaSummit' : 'band.aria', { z }),
      text: summit ? `${z} ${t('band.summitSuffix')}` : `${z}`,
    }, node);
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
  const phaseKey = band.phase === 'snow' ? 'tip.snow' : band.phase === 'mix' ? 'tip.sleet' : 'tip.rain';
  return `<b>${dec(band.z, 0)} m · ${fmtClock(h.time)} ${fmtWeekday(h.time)}</b>`
    + row(t('tip.temperature'), `${dec(band.temp, 1)}°`)
    + row(t('tip.feels'), `${dec(band.feels, 1)}°`)
    + row(t('tip.wetBulb'), `${dec(band.wetBulb, 1)}°`)
    + row(t('tip.wind'), `${fmtWind(band.wind, unit)} ${u} ${compass(band.dir)}`)
    + row(t('tip.gusts'), `${fmtWind(band.gust, unit)} ${u}`)
    + row(t('tip.humidity'), `${dec(band.rh, 0)}%`)
    + (band.precip >= 0.05
      ? row(t(phaseKey), band.phase === 'snow' ? `${dec(band.snowCm, 1)} cm` : `${dec(band.precip, 1)} mm`)
      : row(t('tip.precipitation'), t('tip.dry')));
}

/* ---------- status ---------- */
export function setStatus(kind, text) {
  const pill = $('#status-pill');
  pill.className = `status-pill ${kind}`;
  $('#status-text').textContent = text;
}
export const dataAge = (ts) => (ts ? `updated ${ago(ts)}` : 'live');
