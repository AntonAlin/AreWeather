/* Assembly: turn four raw API payloads plus the learned parameters into one
   view model that the UI can render without doing any meteorology of its own. */

import { APP, SCORING } from './config.js';
import { series, members } from './api.js';
import {
  buildSounding, temperatureAt, humidityAt, windAt, precipAt,
  wetBulb, dewPoint, feelsLike, phase, snowRatio, snowLine, lclHeight,
  driftIndex, toUV, fromUV, lapseRate,
} from './physics.js';
import { modelWeights, correctTemperature, correctWind, precipProbability } from './ml.js';
import { clamp, mean, quantile, parseLocal } from './util.js';

/** Elevation bands from valley floor to summit, rounded to the band step. */
export function bandsFor(mtn) {
  const step = APP.bandStep;
  const lo = Math.round(mtn.base / step) * step;
  const out = [];
  for (let z = lo; z < mtn.summit; z += step) out.push(z);
  // Avoid a cosmetic sliver of a band right under the summit.
  if (out.length && mtn.summit - out[out.length - 1] < step * 0.5) out.pop();
  out.push(mtn.summit);
  return out;
}

const dayOfYear = (d) => Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 864e5);

/**
 * @param {object} mtn
 * @param {{surface:object, profile:object|null, ensemble:object|null, ml:object|null}} raw
 */
export function assemble(mtn, { surface, profile, ensemble, ml }) {
  const sh = surface.hourly;
  const times = sh.time.map(parseLocal);
  const modelKeys = (surface._models ?? []).filter((k) => series(sh, 'temperature_2m', k));
  const usableKeys = modelKeys.length ? modelKeys : ['best_match'];
  const weights = modelWeights(ml, usableKeys);
  const anchorZ = Number.isFinite(surface.elevation) ? surface.elevation : mtn.summit;

  /* --- align the auxiliary/pressure-level response to the surface clock --- */
  const ph = profile?.hourly ?? null;
  const pIndex = ph ? new Map(ph.time.map((t, i) => [t, i])) : null;
  const profModels = profile?._models ?? [];
  const auxMean = (name, i) => {
    if (!ph) return NaN;
    const j = pIndex.get(sh.time[i]);
    if (j === undefined) return NaN;
    const vals = profModels.map((m) => ph[`${name}_${m}`]?.[j]).filter(Number.isFinite);
    if (vals.length) return mean(vals);
    const plain = ph[name]?.[j];
    return Number.isFinite(plain) ? plain : NaN;
  };

  /* --- ensemble spread, aligned the same way --- */
  const eh = ensemble?.hourly ?? null;
  const eIndex = eh ? new Map(eh.time.map((t, i) => [t, i])) : null;
  const eTemp = eh ? members(eh, 'temperature_2m') : [];
  const ePrecip = eh ? members(eh, 'precipitation') : [];
  const eWind = eh ? members(eh, 'wind_speed_10m') : [];

  const bandHeights = bandsFor(mtn);
  const hours = [];

  for (let i = 0; i < times.length; i++) {
    /* ---- weighted deterministic ensemble at the anchor height ---- */
    const per = {};
    let tNum = 0, tDen = 0, uNum = 0, vNum = 0, wDen = 0;
    let pNum = 0, pDen = 0, gNum = 0, gDen = 0, cNum = 0, cDen = 0, rNum = 0, rDen = 0;
    const temps = [], winds = [], precs = [];
    for (const k of usableKeys) {
      const w = weights[k] ?? 0;
      const t = series(sh, 'temperature_2m', k)?.[i];
      const ws = series(sh, 'wind_speed_10m', k)?.[i];
      const wd = series(sh, 'wind_direction_10m', k)?.[i];
      const gu = series(sh, 'wind_gusts_10m', k)?.[i];
      const pr = series(sh, 'precipitation', k)?.[i];
      const cc = series(sh, 'cloud_cover', k)?.[i];
      const rh = series(sh, 'relative_humidity_2m', k)?.[i];
      per[k] = { t, ws, wd, gust: gu, precip: pr, cloud: cc };
      if (Number.isFinite(t)) { tNum += w * t; tDen += w; temps.push(t); }
      if (Number.isFinite(ws) && Number.isFinite(wd)) {
        const { u, v } = toUV(ws, wd);
        uNum += w * u; vNum += w * v; wDen += w; winds.push(ws);
      }
      if (Number.isFinite(gu)) { gNum += w * gu; gDen += w; }
      if (Number.isFinite(pr)) { pNum += w * pr; pDen += w; precs.push(pr); }
      if (Number.isFinite(cc)) { cNum += w * cc; cDen += w; }
      if (Number.isFinite(rh)) { rNum += w * rh; rDen += w; }
    }

    const spreadT = temps.length > 1 ? Math.max(...temps) - Math.min(...temps) : 0;
    const wind0 = wDen > 0 ? fromUV(uNum / wDen, vNum / wDen) : { speed: NaN, dir: NaN };
    const rh0 = rDen > 0 ? rNum / rDen : auxMean('relative_humidity_2m', i);
    const cloud0 = cDen > 0 ? cNum / cDen : NaN;
    const precip0 = pDen > 0 ? pNum / pDen : 0;
    const gust0 = gDen > 0 ? gNum / gDen : NaN;
    const doy = dayOfYear(times[i]);
    const hour = times[i].getHours();

    /* ---- learned corrections at the anchor ---- */
    const tRaw = tDen > 0 ? tNum / tDen : NaN;
    const dT = correctTemperature(ml, { ens: tRaw, spread: spreadT, rh: rh0, cloud: cloud0, wind: wind0.speed, hour, doy });
    const dW = correctWind(ml, { ens: wind0.speed, spread: winds.length > 1 ? Math.max(...winds) - Math.min(...winds) : 0, rh: rh0, cloud: cloud0, temp: tRaw, hour, doy });
    const anchorT = Number.isFinite(tRaw) ? tRaw + dT : NaN;
    const anchorW = Number.isFinite(wind0.speed) ? Math.max(0, wind0.speed + dW) : NaN;

    /* ---- sounding ---- */
    const sounding = ph ? buildSounding(ph, profModels.length ? profModels : [''], PRESSURE_LEVELS_SAFE, pIndex.get(sh.time[i]) ?? -1) : [];
    const haveSounding = sounding.length >= 3;

    const anchor = {
      z: anchorZ,
      speed: anchorW,
      dir: wind0.dir,
      gustRatio: Number.isFinite(gust0) && Number.isFinite(wind0.speed) && wind0.speed > 0.5 ? gust0 / wind0.speed : 1.45,
    };

    /* ---- every elevation band ---- */
    const bands = bandHeights.map((z) => {
      const t = temperatureAt(sounding, z, anchorZ, anchorT);
      const rh = clamp(humidityAt(sounding, z, anchorZ, rh0), 1, 100);
      const w = windAt(sounding, z, anchor, mtn);
      const tw = wetBulb(t, rh);
      const mm = precipAt(precip0, z, anchorZ);
      const ph_ = phase(tw);
      const liquid = ph_ === 'snow' ? 0 : ph_ === 'mix' ? mm * 0.5 : mm;
      const solid = mm - liquid;
      return {
        z,
        temp: t,
        rh,
        dewPoint: dewPoint(t, rh),
        wetBulb: tw,
        wind: w.speed,
        gust: w.gust,
        dir: w.dir,
        feels: feelsLike(t, rh, w.speed),
        precip: mm,
        rain: liquid,
        snowMm: solid,
        snowCm: (solid * snowRatio(t)) / 10,
        phase: ph_,
      };
    });

    const valley = bands[0];
    const summit = bands[bands.length - 1];
    const cloudBase = Number.isFinite(valley.temp)
      ? valley.z + lclHeight(valley.temp, dewPoint(valley.temp, valley.rh))
      : NaN;
    let freezing = auxMean('freezing_level_height', i);
    if (!Number.isFinite(freezing) && haveSounding) freezing = zeroCrossing(sounding, anchorZ, anchorT);

    hours.push({
      i,
      time: times[i],
      iso: sh.time[i],
      hour,
      per,
      weights,
      anchorT, anchorW, tRaw, dT, dW,
      spreadT,
      dir: wind0.dir,
      gust: gust0,
      cloud: cloud0,
      cloudLow: auxMean('cloud_cover_low', i),
      cloudMid: auxMean('cloud_cover_mid', i),
      cloudHigh: auxMean('cloud_cover_high', i),
      visibility: auxMean('visibility', i),
      cape: auxMean('cape', i),
      snowDepth: auxMean('snow_depth', i),
      pressure: auxMean('surface_pressure', i),
      weatherCode: series(sh, 'weather_code', usableKeys[0])?.[i],
      precip0,
      bands,
      summit,
      valley,
      sounding,
      haveSounding,
      lapse: haveSounding ? lapseRate(sounding, mtn.base, mtn.summit) : NaN,
      inversion: haveSounding && Number.isFinite(lapseRate(sounding, mtn.base, Math.min(mtn.summit, mtn.base + 600)))
        && lapseRate(sounding, mtn.base, Math.min(mtn.summit, mtn.base + 600)) < -0.1,
      cloudBase,
      freezingLevel: freezing,
      snowLine: snowLine(bands),
      summitInCloud: summit.rh > 92 || (Number.isFinite(cloudBase) && cloudBase < summit.z && (cloud0 ?? 0) > 40),
      ens: ensembleStats(eIndex, sh.time[i], eTemp, ePrecip, eWind),
    });
  }

  /* ---- second pass: accumulations and hazard indices need history ---- */
  for (let i = 0; i < hours.length; i++) {
    const h = hours[i];
    const win = (n, pick) => {
      let s = 0;
      for (let k = Math.max(0, i - n + 1); k <= i; k++) s += pick(hours[k]) || 0;
      return s;
    };
    h.newSnow6 = win(6, (x) => x.summit.snowCm);
    h.newSnow24 = win(24, (x) => x.summit.snowCm);
    h.rain24 = win(24, (x) => x.summit.rain);
    h.precip24 = win(24, (x) => x.summit.precip);
    h.drift = driftIndex(h.newSnow6 + h.newSnow24 * 0.25, h.summit.wind, h.summit.temp);
    h.pop = precipProbability(ml, {
      ensP: h.precip0,
      wetFrac: fractionWet(h.per),
      rh: h.summit.rh,
      cloud: h.cloud,
    }) ?? (h.ens?.pop ?? fractionWet(h.per));
  }

  const daily = buildDaily(surface, hours);
  for (const h of hours) {
    h.daylight = isDaylight(h.time, daily);
    h.trail = scoreTrail(h);
    h.skimo = scoreSkimo(h);
  }

  return {
    mtn,
    bandHeights,
    anchorZ,
    hours,
    daily,
    times,
    modelKeys: usableKeys,
    weights,
    ml,
    ensembleModel: ensemble?._model ?? null,
    profileModels: profModels,
    haveProfile: !!ph,
  };
}

/* Pressure levels we actually attempt to read back out of a response. Kept in
   sync with config but tolerant: missing levels are simply skipped. */
const PRESSURE_LEVELS_SAFE = [1000, 975, 950, 925, 900, 850, 800, 700, 600, 500];

function zeroCrossing(sounding, anchorZ, anchorT) {
  for (let z = 0; z < 4000; z += 50) {
    const a = temperatureAt(sounding, z, anchorZ, anchorT);
    const b = temperatureAt(sounding, z + 50, anchorZ, anchorT);
    if (Number.isFinite(a) && Number.isFinite(b) && a >= 0 && b < 0) {
      return z + 50 * (a / (a - b));
    }
  }
  return NaN;
}

function fractionWet(per) {
  const vals = Object.values(per).map((p) => p.precip).filter(Number.isFinite);
  return vals.length ? vals.filter((p) => p >= 0.1).length / vals.length : 0;
}

function ensembleStats(index, iso, temps, precips, winds) {
  if (!index) return null;
  const j = index.get(iso);
  if (j === undefined) return null;
  const t = temps.map((m) => m[j]).filter(Number.isFinite);
  const p = precips.map((m) => m[j]).filter(Number.isFinite);
  const w = winds.map((m) => m[j]).filter(Number.isFinite);
  if (!t.length && !p.length) return null;
  return {
    n: Math.max(t.length, p.length),
    t10: quantile(t, 0.1), t50: quantile(t, 0.5), t90: quantile(t, 0.9),
    w50: quantile(w, 0.5), w90: quantile(w, 0.9),
    pop: p.length ? p.filter((x) => x >= 0.1).length / p.length : null,
    p90: quantile(p, 0.9),
  };
}

function buildDaily(surface, hours) {
  const d = surface.daily;
  const out = [];
  if (d?.time) {
    for (let i = 0; i < d.time.length; i++) {
      out.push({
        date: d.time[i],
        sunrise: parseLocal(d.sunrise?.[i]),
        sunset: parseLocal(d.sunset?.[i]),
        uv: d.uv_index_max?.[i],
      });
    }
  }
  // Aggregate the hourly summit series per calendar day for the day cards.
  const byDate = new Map();
  for (const h of hours) {
    const key = h.iso.slice(0, 10);
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key).push(h);
  }
  for (const day of out) {
    const hs = byDate.get(day.date) ?? [];
    const safeMax = (vals) => (vals.length ? Math.max(...vals) : NaN);
    const safeMin = (vals) => (vals.length ? Math.min(...vals) : NaN);
    day.tMax = safeMax(hs.map((h) => h.summit.temp).filter(Number.isFinite));
    day.tMin = safeMin(hs.map((h) => h.summit.temp).filter(Number.isFinite));
    day.wind = safeMax(hs.map((h) => h.summit.wind).filter(Number.isFinite));
    day.precip = hs.reduce((a, h) => a + (h.summit.precip || 0), 0);
    day.snow = hs.reduce((a, h) => a + (h.summit.snowCm || 0), 0);
  }
  return out;
}

function isDaylight(t, daily) {
  const key = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  const day = daily.find((d) => d.date === key);
  if (!day?.sunrise || !day?.sunset) return t.getHours() >= 7 && t.getHours() <= 19;
  return t >= day.sunrise && t <= day.sunset;
}

/* ---------- activity scoring ----------
   The rules themselves live in SCORING in config.js so that the method page
   can print exactly what ran. This is only the machinery that applies them. */

const NO_DATA = { score: 0, label: 'No data', why: ['forecast data missing for this hour'] };
const OUT_OF_SEASON = { score: 3, label: 'Out of season', why: ['no snow cover'] };

/** Values a scoring rule can ramp against. */
const METRICS = {
  precip: (h, b) => b.precip,
  rain: (h, b) => b.rain,
  wind: (h, b) => b.wind,
  gust: (h, b) => b.gust,
  temp: (h, b) => b.temp,
  feels: (h, b) => b.feels,
  /** how far below freezing it feels — ramps the other way from `feels` */
  chill: (h, b) => -b.feels,
  snowDepth: (h) => h.snowDepth,
  coverDeficit: (h) => (Number.isFinite(h.snowDepth) ? 0.3 - h.snowDepth : NaN),
  coverSurplus: (h) => (Number.isFinite(h.snowDepth) ? h.snowDepth - 0.3 : NaN),
  newSnow24: (h) => h.newSnow24,
  drift: (h) => h.drift,
};

/** Conditions a flat-penalty rule can fire on. */
const FLAGS = {
  summitInCloud: (h) => !!h.summitInCloud,
  overcastOnly: (h) => !h.summitInCloud && (h.cloud ?? 0) > 85,
  night: (h) => !h.daylight,
  sleet: (h, b) => b.phase === 'mix',
  thunder: (h) => Number.isFinite(h.cape) && h.cape > 700,
};

const labelFor = (s) => (SCORING.labels.find(([min]) => s >= min) ?? [0, 'Poor'])[1];

function applyRules(spec, h, b) {
  let score = spec.base;
  const hits = [];
  for (const r of spec.rules) {
    let delta = 0;
    if (r.kind === 'flag') {
      delta = FLAGS[r.flag]?.(h, b) ? -r.amount : 0;
    } else {
      const v = METRICS[r.metric]?.(h, b);
      if (!Number.isFinite(v)) continue;
      const magnitude = clamp((v - r.from) * r.slope, 0, r.cap);
      delta = r.kind === 'bonus' ? magnitude : -magnitude;
    }
    if (!Number.isFinite(delta) || delta === 0) continue;
    score += delta;
    // Only penalties worth mentioning become the "limited by" list.
    if (delta < -3) hits.push([-delta, r.label]);
  }
  hits.sort((a, b2) => b2[0] - a[0]);
  return { score, hits };
}

const finish = (score, hits) => {
  const v = clamp(Math.round(score), 0, 100);
  return { score: v, label: labelFor(v), why: hits.slice(0, 3).map((x) => x[1]) };
};

export function scoreTrail(h) {
  const b = h.summit;
  if (!Number.isFinite(b.temp) || !Number.isFinite(b.wind)) return NO_DATA;
  const { score, hits } = applyRules(SCORING.trail, h, b);
  return finish(score, hits);
}

export function scoreSkimo(h) {
  const b = h.summit;
  if (!Number.isFinite(b.temp) || !Number.isFinite(b.wind)) return NO_DATA;

  const depth = Number.isFinite(h.snowDepth) ? h.snowDepth : null;
  if (depth !== null && depth < 0.05) return OUT_OF_SEASON;
  if (depth === null) {
    // No model reported snow depth. Fall back to a seasonal sanity check so the
    // app never promises a ski tour on a green August summit.
    const month = h.time.getMonth();
    const summery = month >= 5 && month <= 8 && b.temp > 6
      && Number.isFinite(h.freezingLevel) && h.freezingLevel > b.z + 400;
    if (summery) return { score: 5, label: 'Out of season', why: ['snow cover unknown, freezing level far above summit'] };
  }

  const { score, hits } = applyRules(SCORING.skimo, h, b);
  if (depth === null) hits.push([6, 'snow cover unknown']);
  return finish(depth === null ? score - 6 : score, hits);
}

/** Best contiguous daylight window of `len` hours for an activity.
 *  Returns Date objects, or null when there is nothing to choose from. */
export function bestWindow(hours, activity, { len = 4, within = 48 } = {}) {
  const pool = hours.slice(0, within);
  let best = null;
  for (let i = 0; i + len <= pool.length; i++) {
    const slice = pool.slice(i, i + len);
    if (!slice.every((h) => h.daylight)) continue;
    const avg = mean(slice.map((h) => h[activity].score));
    if (!best || avg > best.score) best = { start: slice[0].time, end: slice[len - 1].time, score: avg };
  }
  if (!best) {
    for (let i = 0; i + len <= pool.length; i++) {
      const slice = pool.slice(i, i + len);
      const avg = mean(slice.map((h) => h[activity].score));
      if (!best || avg > best.score) best = { start: slice[0].time, end: slice[len - 1].time, score: avg, dark: true };
    }
  }
  return best;
}
