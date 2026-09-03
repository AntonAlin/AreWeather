/* Network layer for Open-Meteo.

   Three rules here:
   1. Every request degrades gracefully. If a variable or a model is not
      available for this point the request is retried with a smaller ask
      rather than failing the page.
   2. Everything is cached in localStorage so the app still shows the last
      known forecast at a trailhead with one bar of signal.
   3. Units are pinned explicitly (m/s, mm, °C) — the API default for wind is
      km/h and silently inheriting that would be a real bug. */

import { APP, ENDPOINTS, MODELS, PROFILE_MODELS, PRESSURE_LEVELS, ENSEMBLE_MODELS, SMHI, WARMING } from './config.js';
import { store, isoDate, daysAgo } from './util.js';

const NS = `areweather.${APP.version}`;
const TTL = { forecast: 30 * 60e3, ensemble: 3 * 3600e3, training: 24 * 3600e3, observations: 20 * 60e3, climate: 30 * 864e5, projection: 180 * 864e5 };

export class ApiError extends Error {}

async function getJSON(url, timeout = 25000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    const body = await res.json().catch(() => null);
    if (!res.ok || (body && body.error)) {
      throw new ApiError(body?.reason || `HTTP ${res.status}`);
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

const qs = (params) => Object.entries(params)
  .filter(([, v]) => v !== undefined && v !== null && v !== '')
  .map(([k, v]) => `${k}=${encodeURIComponent(Array.isArray(v) ? v.join(',') : v)}`)
  .join('&');

/** Try progressively smaller requests until one answers. */
async function tryVariants(endpoint, variants, timeout) {
  let last;
  for (const params of variants) {
    try {
      return { data: await getJSON(`${endpoint}?${qs(params)}`, timeout), params };
    } catch (err) {
      last = err;
    }
  }
  throw last ?? new ApiError('no variant succeeded');
}

/* ---------- cache ---------- */
function cached(key, ttl) {
  const hit = store.get(`${NS}.${key}`);
  if (!hit) return null;
  const age = Date.now() - hit.t;
  return { ...hit, age, fresh: age < ttl };
}
function keep(key, data) {
  return store.set(`${NS}.${key}`, { t: Date.now(), data });
}

/**
 * Run `fn`, falling back to cache. Returns { data, cachedAt, stale }.
 * A fresh cache entry short-circuits the network entirely.
 */
async function withCache(key, ttl, fn, { force = false } = {}) {
  const hit = cached(key, ttl);
  if (hit && hit.fresh && !force) return { data: hit.data, cachedAt: hit.t, stale: false };
  try {
    const data = await fn();
    keep(key, data);
    return { data, cachedAt: Date.now(), stale: false };
  } catch (err) {
    if (hit) return { data: hit.data, cachedAt: hit.t, stale: true, error: err };
    throw err;
  }
}

/* ---------- variable sets ---------- */
const SURFACE_CORE = [
  'temperature_2m', 'relative_humidity_2m', 'precipitation', 'weather_code',
  'cloud_cover', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m',
];
const SURFACE_MIN = ['temperature_2m', 'relative_humidity_2m', 'precipitation', 'wind_speed_10m', 'wind_direction_10m'];

const AUX_VARS = [
  'freezing_level_height', 'cloud_cover_low', 'cloud_cover_mid', 'cloud_cover_high',
  'visibility', 'cape', 'snow_depth', 'precipitation_probability', 'surface_pressure',
];

const profileVars = (levels) => levels.flatMap((l) => [
  `temperature_${l}hPa`, `geopotential_height_${l}hPa`,
  `relative_humidity_${l}hPa`, `wind_speed_${l}hPa`, `wind_direction_${l}hPa`,
]);

const COMMON = {
  timezone: APP.timezone,
  wind_speed_unit: 'ms',
  temperature_unit: 'celsius',
  precipitation_unit: 'mm',
};

/* ---------- public API ---------- */

/** Deterministic multi-model surface forecast, anchored to the summit height. */
export function fetchSurface(mtn, opts) {
  const base = { ...COMMON, latitude: mtn.lat, longitude: mtn.lon, elevation: mtn.summit, forecast_days: APP.forecastDays };
  const all = MODELS.map((m) => m.key);
  return withCache(`surface.${mtn.id}`, TTL.forecast, async () => {
    const { data, params } = await tryVariants(ENDPOINTS.forecast, [
      { ...base, hourly: SURFACE_CORE, models: all, daily: ['sunrise', 'sunset', 'uv_index_max'] },
      { ...base, hourly: SURFACE_CORE, models: all },
      { ...base, hourly: SURFACE_MIN, models: all },
      { ...base, hourly: SURFACE_CORE, models: all.slice(0, 4) },
      { ...base, hourly: SURFACE_CORE },
    ]);
    return { ...data, _models: params.models ? String(params.models).split(',') : ['best_match'] };
  }, opts);
}

/** Pressure-level sounding + the extras only the high-res models carry. */
export function fetchProfile(mtn, opts) {
  const base = { ...COMMON, latitude: mtn.lat, longitude: mtn.lon, forecast_days: APP.forecastDays };
  const lite = PRESSURE_LEVELS.filter((l) => [1000, 925, 850, 800, 700, 500].includes(l));
  return withCache(`profile.${mtn.id}`, TTL.forecast, async () => {
    const { data, params } = await tryVariants(ENDPOINTS.forecast, [
      { ...base, hourly: [...profileVars(PRESSURE_LEVELS), ...AUX_VARS], models: PROFILE_MODELS },
      { ...base, hourly: [...profileVars(PRESSURE_LEVELS), 'freezing_level_height'], models: PROFILE_MODELS },
      { ...base, hourly: [...profileVars(lite), 'freezing_level_height'], models: PROFILE_MODELS },
      { ...base, hourly: profileVars(lite), models: ['gfs_seamless'] },
      { ...base, hourly: profileVars(lite) },
    ]);
    return { ...data, _models: params.models ? String(params.models).split(',') : ['best_match'] };
  }, opts);
}

/**
 * The handful of extra fields the overview needs but the surface request cannot
 * carry: snow depth and freezing level exist only on the high-resolution models,
 * and asking all six for them would fail the whole request.
 *
 * Deliberately tiny — the comparison view issues this for every peak, so it has
 * to stay cheap. The response has the same shape as the profile response, which
 * is why `assemble` accepts it in the same slot.
 */
export function fetchAux(mtn, opts) {
  const base = { ...COMMON, latitude: mtn.lat, longitude: mtn.lon, forecast_days: APP.forecastDays };
  return withCache(`aux.${mtn.id}`, TTL.forecast, async () => {
    const { data, params } = await tryVariants(ENDPOINTS.forecast, [
      { ...base, hourly: ['snow_depth', 'freezing_level_height', 'cloud_cover_low'], models: PROFILE_MODELS },
      { ...base, hourly: ['snow_depth', 'freezing_level_height'], models: PROFILE_MODELS },
      { ...base, hourly: ['freezing_level_height'], models: ['gfs_seamless'] },
    ], 20000);
    return { ...data, _models: params.models ? String(params.models).split(',') : ['best_match'] };
  }, opts);
}

/** Ensemble members for probabilistic spread. First system that answers wins. */
export function fetchEnsemble(mtn, opts) {
  const base = {
    ...COMMON, latitude: mtn.lat, longitude: mtn.lon, elevation: mtn.summit, forecast_days: APP.forecastDays,
  };
  return withCache(`ensemble.${mtn.id}.v2`, TTL.ensemble, async () => {
    /* Cloud cover is only wanted by the outlook page, and only some ensemble
       systems carry it, so it leads the ladder and is the first thing dropped. */
    const variants = ENSEMBLE_MODELS.flatMap((m) => [
      { ...base, hourly: ['temperature_2m', 'precipitation', 'wind_speed_10m', 'snowfall', 'cloud_cover'], models: m },
      { ...base, hourly: ['temperature_2m', 'precipitation', 'wind_speed_10m', 'snowfall'], models: m },
      { ...base, hourly: ['temperature_2m', 'precipitation'], models: m },
    ]);
    const { data, params } = await tryVariants(ENDPOINTS.ensemble, variants, 30000);
    return { ...data, _model: params.models, _vars: params.hourly };
  }, opts);
}

/**
 * Training set for the in-browser bias model: what every model predicted over
 * the past weeks, and what ERA5-Land says actually happened.
 */
export function fetchTraining(mtn, opts) {
  const end = daysAgo(6);
  const start = daysAgo(6 + APP.trainingDays);
  const range = { start_date: isoDate(start), end_date: isoDate(end) };
  const vars = ['temperature_2m', 'wind_speed_10m', 'precipitation', 'relative_humidity_2m', 'cloud_cover'];
  const truthVars = ['temperature_2m', 'wind_speed_10m', 'precipitation'];

  return withCache(`training.${mtn.id}.${range.end_date}`, TTL.training, async () => {
    const base = { ...COMMON, latitude: mtn.lat, longitude: mtn.lon, elevation: mtn.summit, ...range };
    const models = MODELS.map((m) => m.key);
    const [forecasts, truth] = await Promise.all([
      tryVariants(ENDPOINTS.history, [
        { ...base, hourly: vars, models },
        { ...base, hourly: ['temperature_2m', 'wind_speed_10m', 'precipitation'], models },
        { ...base, hourly: ['temperature_2m', 'wind_speed_10m', 'precipitation'], models: models.slice(0, 3) },
      ], 35000),
      tryVariants(ENDPOINTS.archive, [
        { ...base, hourly: truthVars, models: 'era5_land' },
        { ...base, hourly: truthVars, models: 'era5' },
        { ...base, hourly: truthVars },
      ], 35000),
    ]);
    return {
      forecasts: forecasts.data,
      truth: truth.data,
      truthModel: String(truth.params.models ?? 'era5'),
      models: String(forecasts.params.models).split(','),
      range,
    };
  }, opts);
}

/**
 * The latest hour of one observed parameter for every station in Sweden.
 *
 * One request per parameter serves every mountain and both pages — SMHI's terms
 * ask specifically that you not fetch per location or repeat the same fetch, and
 * this is the documented resource for exactly that. Cached for 20 minutes; the
 * stations themselves only report hourly.
 */
export function fetchObservations(parameter, opts) {
  const url = `${SMHI.base}/parameter/${parameter}/station-set/all/period/latest-hour/data.json`;
  return withCache(`obs.${parameter}`, TTL.observations, () => getJSON(url, 25000), opts);
}

/**
 * Thirty years of daily ERA5 for one peak, for the climatology.
 *
 * This is the largest request the app makes by a wide margin, so it is done
 * once per mountain and only the derived statistics are kept — the raw decade
 * of numbers is summarised and thrown away rather than parked in localStorage,
 * where it would not fit anyway. A climatology does not change, so the cache
 * lasts a month.
 */
export async function fetchClimate(mtn, { force = false, years = 30 } = {}) {
  const key = `climate.${mtn.id}.v2`;
  const hit = cached(key, TTL.climate);
  if (hit && hit.fresh && !force) return { data: hit.data, cachedAt: hit.t, stale: false };

  const end = daysAgo(7);
  const start = new Date(end);
  start.setFullYear(start.getFullYear() - years);
  const params = {
    ...COMMON,
    latitude: mtn.lat,
    longitude: mtn.lon,
    elevation: mtn.summit,
    start_date: isoDate(start),
    end_date: isoDate(end),
    daily: ['temperature_2m_max', 'temperature_2m_min', 'precipitation_sum', 'snowfall_sum', 'wind_speed_10m_max'],
    models: 'era5',
  };
  try {
    const raw = await getJSON(`${ENDPOINTS.archive}?${qs(params)}`, 60000);
    return { data: { raw, years, from: params.start_date, to: params.end_date }, cachedAt: Date.now(), stale: false };
  } catch (err) {
    if (hit) return { data: hit.data, cachedAt: hit.t, stale: true, error: err };
    throw err;
  }
}

/* ---------- climate projections ---------- */

/** Daily variables the warming page needs, in the order they are given up. */
const CLIMATE_VARS = ['temperature_2m_max', 'temperature_2m_min', 'precipitation_sum', 'relative_humidity_2m_mean'];
const CLIMATE_CORE = ['temperature_2m_max', 'temperature_2m_min', 'precipitation_sum'];

/** Concatenate several daily responses, in order, into one. */
function mergeDaily(parts) {
  const good = parts.filter((p) => p?.daily?.time?.length);
  if (!good.length) return null;
  const keys = [...new Set(good.flatMap((p) => Object.keys(p.daily)))];
  const daily = Object.fromEntries(keys.map((k) => [k, []]));
  for (const part of good) {
    const n = part.daily.time.length;
    for (const k of keys) {
      const col = part.daily[k];
      /* a slice missing a column is padded, so every column stays aligned
         with `time` rather than silently shifting by a few years */
      daily[k].push(...(Array.isArray(col) && col.length === n ? col : new Array(n).fill(null)));
    }
  }
  return { ...good[0], daily };
}

/**
 * Once the API says we are over a limit, stop asking.
 *
 * The free tier this site runs on is a courtesy, and seven models × five
 * fallback variants is exactly the sort of retry storm that gets an anonymous
 * caller blocked. One refusal of this kind ends the run for the whole page.
 */
let rateLimited = null;
const LIMIT_HINT = /limit|quota|too many|429/i;
export const climateLimit = () => rateLimited;
export function clearClimateLimit() { rateLimited = null; }

/** [from, to] year ranges covering a span, `years` at a time. */
function slices(from, to, years) {
  const out = [];
  for (let y = from; y <= to; y += years) out.push([y, Math.min(to, y + years - 1)]);
  return out;
}

/**
 * A long daily series, fetched in slices and stitched back together.
 *
 * A century of daily values in one request is a large ask, and a request that
 * is refused for its size is refused identically however many times it is
 * retried. Splitting the span is the one fallback that changes the shape of
 * the question rather than just asking it again more quietly.
 */
async function fetchSpanInSlices(endpoint, base, vars, from, to, years, timeout) {
  const parts = [];
  for (const [a, b] of slices(from, to, years)) {
    const params = { ...base, daily: vars, start_date: `${a}-01-01`, end_date: `${b}-12-31` };
    parts.push(await getJSON(`${endpoint}?${qs(params)}`, timeout));
  }
  const merged = mergeDaily(parts);
  if (!merged) throw new ApiError('no slice returned any data');
  return merged;
}

/**
 * Try a long daily request several genuinely different ways.
 *
 * The ladder matters: dropping a variable and slicing the span fail for
 * different reasons, so a ladder that only ever drops variables would retry the
 * same rejection three times. The last error is kept and handed back, because a
 * page that cannot say why it is empty is no better than a blank one.
 */
async function fetchLongDaily(endpoint, base, { from, to, timeout = 90000 }) {
  /* `small` marks an attempt whose requests are modest. A limit error on one of
     those means we really are over the allowance and should stop; the same error
     on the full-span request only means the request was too big, and slicing is
     the answer rather than giving up. */
  const attempts = [
    { small: false, run: () => getJSON(`${endpoint}?${qs({ ...base, daily: CLIMATE_VARS, start_date: `${from}-01-01`, end_date: `${to}-12-31` })}`, timeout) },
    { small: false, run: () => getJSON(`${endpoint}?${qs({ ...base, daily: CLIMATE_CORE, start_date: `${from}-01-01`, end_date: `${to}-12-31` })}`, timeout) },
    { small: true, run: () => fetchSpanInSlices(endpoint, base, CLIMATE_VARS, from, to, 20, timeout) },
    { small: true, run: () => fetchSpanInSlices(endpoint, base, CLIMATE_CORE, from, to, 20, timeout) },
    { small: true, run: () => fetchSpanInSlices(endpoint, base, CLIMATE_CORE, from, to, 10, timeout) },
  ];
  if (rateLimited) throw new ApiError(rateLimited);
  let last;
  for (const attempt of attempts) {
    try {
      const data = await attempt.run();
      if (data?.daily?.time?.length) return data;
      last = new ApiError('empty response');
    } catch (err) {
      last = err;
      if (attempt.small && LIMIT_HINT.test(err?.message ?? '')) {
        rateLimited = err.message;
        throw err;
      }
    }
  }
  throw last ?? new ApiError('no variant succeeded');
}

/**
 * One CMIP6 model, a century of daily values, for the massif anchor point.
 *
 * The caller summarises the response and calls `keepProjection` with the few
 * hundred numbers that survive, so the raw century is never written to storage.
 * A projection of 1950-2050 does not change from week to week, so the summary
 * is treated as good for half a year.
 */
export async function fetchProjection(modelKey, { force = false } = {}) {
  const key = `projection.${modelKey}.v2`;
  const hit = cached(key, TTL.projection);
  if (hit && hit.fresh && !force) return { data: hit.data, cachedAt: hit.t, stale: false };

  const base = {
    latitude: WARMING.anchor.lat,
    longitude: WARMING.anchor.lon,
    temperature_unit: 'celsius',
    precipitation_unit: 'mm',
    models: modelKey,
  };
  try {
    const raw = await fetchLongDaily(ENDPOINTS.climate, base, { from: WARMING.from, to: WARMING.to });
    return { data: { raw, model: modelKey }, cachedAt: Date.now(), stale: false };
  } catch (err) {
    if (hit) return { data: hit.data, cachedAt: hit.t, stale: true, error: err };
    throw err;
  }
}

/** Store the summarised projection, so the raw century never has to be kept. */
export function keepProjection(modelKey, summary) {
  return keep(`projection.${modelKey}.v2`, summary);
}

/**
 * The observed record for the same point, from ERA5 — what has already happened,
 * against which the models' own historical runs can be read.
 */
export async function fetchObserved({ force = false } = {}) {
  const key = 'projection.observed.v2';
  const hit = cached(key, TTL.projection);
  if (hit && hit.fresh && !force) return { data: hit.data, cachedAt: hit.t, stale: false };

  const base = {
    ...COMMON,
    latitude: WARMING.anchor.lat,
    longitude: WARMING.anchor.lon,
    models: 'era5',
  };
  /* ERA5 only reaches the day before yesterday, so the span stops at last year
     rather than asking the archive for a year it cannot finish. */
  const to = new Date().getFullYear() - 1;
  try {
    const raw = await fetchLongDaily(ENDPOINTS.archive, base, { from: WARMING.from, to });
    return { data: { raw, model: 'era5' }, cachedAt: Date.now(), stale: false };
  } catch (err) {
    if (hit) return { data: hit.data, cachedAt: hit.t, stale: true, error: err };
    throw err;
  }
}

/** Store the summarised observed record. */
export function keepObserved(summary) {
  return keep('projection.observed.v2', summary);
}

/**
 * Drop the first-generation projection cache.
 *
 * The v1 entries stored the full winter records, which were large enough that
 * writing them usually failed outright — but any that did land are dead weight
 * against the same quota v2 needs, and nothing will ever read them again.
 */
export function forgetOldProjections() {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(`${NS}.projection.`) && key.endsWith('.v1')) localStorage.removeItem(key);
    }
  } catch { /* private mode, or no storage at all */ }
}

/** Store the derived climatology, so the raw response never has to be kept. */
export function keepClimate(mtnId, summary) {
  keep(`climate.${mtnId}.v2`, summary);
}

/* ---------- response helpers ---------- */

/** Pull a series out of a (possibly multi-model) hourly block. */
export function series(hourly, name, model) {
  if (!hourly) return null;
  if (model && hourly[`${name}_${model}`]) return hourly[`${name}_${model}`];
  return hourly[name] ?? null;
}

/** Every `_memberNN` series for a variable in an ensemble response. */
export function members(hourly, name) {
  if (!hourly) return [];
  const re = new RegExp(`^${name}_member\\d+$`);
  return Object.keys(hourly).filter((k) => re.test(k)).map((k) => hourly[k]);
}

export function purgeCache() {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k && k.startsWith(NS)) store.del(k);
  }
}
