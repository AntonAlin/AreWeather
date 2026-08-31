/* SMHI station observations: what the mountains are actually doing, as against
   what six models believe they are doing.

   This layer is deliberately kept *out* of the forecast. Nothing here is blended
   into a prediction — a station 15 km away at valley height cannot correct a
   summit forecast, and pretending otherwise would be worse than not showing it.
   What it can do is tell you, right now, whether the model is running warm, and
   keep a running tally of that over time. */

import { SMHI, APP } from './config.js';
import { temperatureAt, windAt } from './physics.js';
import { store, mean } from './util.js';

const NS = `areweather.${APP.version}`;
const R_EARTH = 6371;

/** Great-circle distance in kilometres. */
export function distanceKm(aLat, aLon, bLat, bLon) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Flatten a station-set response into station records.
 * Handles both shapes SMHI returns: readings nested per station, and a flat
 * `value` array keyed by station.
 */
export function parseStationSet(payload) {
  const out = new Map();
  const stations = payload?.station ?? [];
  for (const s of stations) {
    const readings = s.value ?? [];
    const latest = readings.length ? readings[readings.length - 1] : null;
    const value = latest ? Number(latest.value) : NaN;
    out.set(String(s.key), {
      key: String(s.key),
      name: s.name ?? 'unnamed',
      lat: Number(s.latitude),
      lon: Number(s.longitude),
      height: Number(s.height),
      value: Number.isFinite(value) ? value : NaN,
      at: latest ? Number(latest.date) : NaN,
      quality: latest?.quality ?? null,
    });
  }
  return out;
}

/**
 * Rank stations for a mountain: distance first, with a cost for being at a very
 * different elevation. Returns the closest `limit`, nearest first.
 */
export function nearestStations(mtn, stations, { limit = SMHI.show, radiusKm = SMHI.radiusKm } = {}) {
  const scored = [];
  for (const st of stations.values()) {
    if (!Number.isFinite(st.lat) || !Number.isFinite(st.lon)) continue;
    const km = distanceKm(mtn.lat, mtn.lon, st.lat, st.lon);
    if (km > radiusKm) continue;
    const dz = Number.isFinite(st.height) ? Math.abs(st.height - mtn.summit) : 600;
    scored.push({ ...st, km, dz, cost: km + dz / SMHI.metresPerKm });
  }
  scored.sort((a, b) => a.cost - b.cost);
  return scored.slice(0, limit);
}

/** Merge one station's readings across every parameter that answered. */
export function collectStation(key, sets) {
  const merged = {};
  for (const { key: name } of SMHI.parameters) {
    const station = sets[name]?.get(key);
    if (station && Number.isFinite(station.value)) {
      merged[name] = { value: station.value, at: station.at, quality: station.quality };
    }
  }
  return merged;
}

/**
 * What the forecast claims at that station's height and hour, so the two can be
 * put side by side. The horizontal distance is not corrected for — a station is
 * a different place, not a different altitude of the same place — which is why
 * the interface always shows how far away it is.
 */
export function compareWithModel(model, station, readings) {
  const at = readings.temp?.at ?? readings.wind?.at;
  if (!Number.isFinite(at)) return null;
  const observedHour = new Date(at);
  observedHour.setMinutes(0, 0, 0);
  const hour = model.hours.find((h) => Math.abs(h.time - observedHour) < 30 * 60e3);
  if (!hour) return null;

  const z = Number.isFinite(station.height) ? station.height : model.mtn.base;
  const modelled = {};

  if (Number.isFinite(readings.temp?.value)) {
    const t = temperatureAt(hour.sounding, z, model.anchorZ, hour.anchorT);
    modelled.temp = { model: t, observed: readings.temp.value, delta: Number.isFinite(t) ? t - readings.temp.value : NaN };
  }
  if (Number.isFinite(readings.wind?.value)) {
    const w = windAt(hour.sounding, z, { z: model.anchorZ, speed: hour.anchorW, dir: hour.dir, gustRatio: 1.45 }, model.mtn);
    modelled.wind = { model: w.speed, observed: readings.wind.value, delta: Number.isFinite(w.speed) ? w.speed - readings.wind.value : NaN };
    if (Number.isFinite(readings.dir?.value) && Number.isFinite(w.dir)) {
      let diff = ((w.dir - readings.dir.value + 540) % 360) - 180;
      modelled.dir = { model: w.dir, observed: readings.dir.value, delta: diff };
    }
  }
  const ageMin = (Date.now() - at) / 60e3;
  return {
    hour,
    at,
    ageMin,
    stale: ageMin > SMHI.maxAgeMinutes,
    elevation: z,
    modelled,
  };
}

/* ---------- rolling verification log ----------
   Every comparison the app makes is recorded, deduplicated by station and hour.
   Over a couple of weeks this becomes a real, if small, record of how this
   forecast has actually performed — measured against thermometers rather than
   against a reanalysis grid. It lives in this browser and goes nowhere. */

const logKey = (mtnId) => `${NS}.verify.${mtnId}`;

export function recordVerification(mtnId, stationKey, comparison) {
  const t = comparison?.modelled?.temp;
  if (!t || !Number.isFinite(t.delta)) return null;
  const log = store.get(logKey(mtnId)) ?? [];
  const stamp = `${stationKey}:${Math.round(comparison.at / 36e5)}`;
  if (log.some((e) => e.id === stamp)) return summariseLog(log);
  log.push({ id: stamp, t: comparison.at, d: Math.round(t.delta * 100) / 100, w: Number.isFinite(comparison.modelled.wind?.delta) ? Math.round(comparison.modelled.wind.delta * 100) / 100 : null });
  while (log.length > SMHI.logLimit) log.shift();
  store.set(logKey(mtnId), log);
  return summariseLog(log);
}

export function readVerification(mtnId) {
  return summariseLog(store.get(logKey(mtnId)) ?? []);
}

function summariseLog(log) {
  if (!log.length) return { n: 0 };
  const temps = log.map((e) => e.d).filter(Number.isFinite);
  const winds = log.map((e) => e.w).filter(Number.isFinite);
  const span = (log[log.length - 1].t - log[0].t) / 864e5;
  return {
    n: temps.length,
    days: Math.max(0, span),
    bias: mean(temps),
    mae: mean(temps.map(Math.abs)),
    windBias: winds.length ? mean(winds) : NaN,
    since: log[0].t,
  };
}

/** Everything the observations card needs, or null if nothing usable came back. */
export function buildObservations(model, sets) {
  const primary = sets.temp ?? Object.values(sets).find(Boolean);
  if (!primary || !primary.size) return null;
  const near = nearestStations(model.mtn, primary);
  if (!near.length) return null;

  const stations = near.map((station) => {
    const readings = collectStation(station.key, sets);
    return { station, readings, comparison: compareWithModel(model, station, readings) };
  }).filter((s) => Object.keys(s.readings).length);

  if (!stations.length) return null;
  const best = stations.find((s) => s.comparison?.modelled?.temp) ?? stations[0];
  const verification = best.comparison
    ? recordVerification(model.mtn.id, best.station.key, best.comparison)
    : readVerification(model.mtn.id);

  return { stations, reference: best, verification };
}
