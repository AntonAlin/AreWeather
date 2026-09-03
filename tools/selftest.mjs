/* Offline self-test for the forecast pipeline.

   The app has no build step and no network access in CI, so this harness feeds
   synthetic Open-Meteo-shaped payloads through the real physics, ML and
   assembly code and asserts the results make physical sense.

   Run: node tools/selftest.mjs */

import { MODELS, PRESSURE_LEVELS, ACTIVITIES, SOURCES, activitiesFor, activityById } from '../js/config.js';
import { assemble, bandsFor, scoreActivity, dailySummaries, bestWindow } from '../js/forecast.js';
import { train, correctTemperature, modelWeights } from '../js/ml.js';
import { distanceKm, parseStationSet, nearestStations, collectStation, compareWithModel, buildObservations } from '../js/observations.js';
import { wetBulb, dewPoint, windChill, snowRatio, buildSounding, temperatureAt, solarPosition, aspectAnalysis, aspectAdvice, angleBetween, ASPECTS } from '../js/physics.js';
import { summarise, percentileOf, contextFor, unusualness, weekly, dayOfYear } from '../js/climate.js';
import { STRINGS, LANGS } from '../js/i18n.js';
import { WARMING, CLIMATE_MODELS, OUTLOOK } from '../js/config.js';
import { memberDays, daily, probabilityOf, trajectories, fan, agreement, headline, memberSeries } from '../js/probability.js';
import { extract, winters, ensemble, overPeriod, trend, staircase, verdict, reliabilityLine, winterYear, depthFromWater, reliableWaterEquivalent, pack, unpack, STORED_METRICS } from '../js/projection.js';
import { round, mean } from '../js/util.js';
import fs from 'node:fs';

let failures = 0;
const ok = (cond, msg, detail = '') => {
  if (cond) console.log(`  ✓ ${msg}`);
  else { failures++; console.log(`  ✗ ${msg} ${detail}`); }
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const pct = (p) => (Number.isFinite(p) ? `${Math.round(p * 100)}%` : '-');

/* ---------- synthetic data ---------- */
const STD = { 1000: 110, 975: 320, 950: 540, 925: 760, 900: 990, 850: 1460, 800: 1950, 700: 3010, 600: 4200, 500: 5570 };
const pad = (n) => String(n).padStart(2, '0');

/** Local wall-clock hour strings, exactly the shape Open-Meteo returns. */
function makeTimes(n, start = new Date(2026, 0, 10, 0, 0)) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(start.getTime() + i * 3600e3);
    out.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`);
  }
  return out;
}

/** Surface response for 6 models at a given anchor elevation. */
function makeSurface(times, { baseTemp = -4, wind = 9, precip = 0.4, elevation = 1420 } = {}) {
  const hourly = { time: times };
  MODELS.forEach((m, k) => {
    const off = (k - 2.5) * 0.6;               // each model has its own bias
    hourly[`temperature_2m_${m.key}`] = times.map((t, i) => baseTemp + off + 3 * Math.sin((i / 24) * 2 * Math.PI));
    hourly[`relative_humidity_2m_${m.key}`] = times.map(() => 88);
    hourly[`dew_point_2m_${m.key}`] = times.map((t, i) => baseTemp + off - 2);
    hourly[`wind_speed_10m_${m.key}`] = times.map((t, i) => wind + (k % 3) + 2 * Math.sin(i / 7));
    hourly[`wind_direction_10m_${m.key}`] = times.map(() => 270 + k);
    hourly[`wind_gusts_10m_${m.key}`] = times.map((t, i) => (wind + 4) * 1.5);
    hourly[`precipitation_${m.key}`] = times.map((t, i) => (i % 6 === 0 ? precip * 3 : precip));
    hourly[`snowfall_${m.key}`] = times.map(() => 0.3);
    hourly[`cloud_cover_${m.key}`] = times.map(() => 78);
    hourly[`weather_code_${m.key}`] = times.map(() => 71);
  });
  return {
    elevation,
    hourly,
    daily: {
      time: [...new Set(times.map((t) => t.slice(0, 10)))],
      sunrise: [...new Set(times.map((t) => t.slice(0, 10)))].map((d) => `${d}T08:30`),
      sunset: [...new Set(times.map((t) => t.slice(0, 10)))].map((d) => `${d}T15:20`),
      uv_index_max: [...new Set(times.map((t) => t.slice(0, 10)))].map(() => 1.2),
    },
    _models: MODELS.map((m) => m.key),
  };
}

/** Pressure-level response. `inversion` warms the lowest 600 m instead of cooling it. */
function makeProfile(times, { surfaceTemp = -4, lapse = 0.62, inversion = false } = {}) {
  const models = ['icon_seamless', 'gfs_seamless'];
  const hourly = { time: times };
  for (const m of models) {
    for (const p of PRESSURE_LEVELS) {
      const z = STD[p];
      const t = inversion && z < 900
        ? surfaceTemp - 8 + (z / 900) * 8            // cold pool below 900 m
        : surfaceTemp - ((z - 400) / 100) * lapse;
      hourly[`geopotential_height_${p}hPa_${m}`] = times.map(() => z);
      hourly[`temperature_${p}hPa_${m}`] = times.map((x, i) => t + 2 * Math.sin((i / 24) * 2 * Math.PI));
      hourly[`relative_humidity_${p}hPa_${m}`] = times.map(() => (z < 1600 ? 92 : 60));
      hourly[`wind_speed_${p}hPa_${m}`] = times.map(() => 8 + z / 250);
      hourly[`wind_direction_${p}hPa_${m}`] = times.map(() => 275);
    }
    hourly[`freezing_level_height_${m}`] = times.map(() => 600);
    hourly[`cloud_cover_low_${m}`] = times.map(() => 70);
    hourly[`visibility_${m}`] = times.map(() => 8000);
    hourly[`snow_depth_${m}`] = times.map(() => 0.85);
    hourly[`cape_${m}`] = times.map(() => 12);
  }
  return { hourly, _models: models };
}

function makeEnsemble(times, { baseTemp = -4 } = {}) {
  const hourly = { time: times };
  for (let m = 1; m <= 20; m++) {
    const tag = `member${pad(m)}`;
    hourly[`temperature_2m_${tag}`] = times.map((t, i) => baseTemp + (m - 10) * 0.28 + 3 * Math.sin((i / 24) * 2 * Math.PI));
    hourly[`precipitation_${tag}`] = times.map((t, i) => (m % 3 === 0 ? 0.6 : 0.02));
    hourly[`wind_speed_10m_${tag}`] = times.map(() => 9 + (m % 5));
  }
  return { hourly, _model: 'icon_eu' };
}

const MTN = { id: 'test', name: 'Testfjället', lat: 63.4, lon: 13.06, summit: 1420, base: 400, exposure: 1.3, tags: ['Trail running'], features: ['lift', 'plateau'] };

/* ---------- 1. thermodynamics ---------- */
console.log('\nThermodynamics');
ok(near(dewPoint(10, 100), 10, 0.3), 'dew point equals temperature at 100 % RH', `got ${dewPoint(10, 100).toFixed(2)}`);
ok(dewPoint(10, 50) < 10, 'dew point below temperature at 50 % RH');
ok(near(wetBulb(20, 50), 13.7, 0.6), 'wet bulb matches the textbook 20 °C / 50 % case', `got ${wetBulb(20, 50).toFixed(2)}`);
ok(wetBulb(1.5, 60) < 1.5, 'wet bulb is depressed below air temperature in dry air');
ok(windChill(-10, 10) < -10, 'wind chill is colder than air temperature');
ok(near(windChill(-10, 0.5), -10, 0.01), 'wind chill is a no-op in calm air');
ok(snowRatio(-12) > snowRatio(0.5), 'cold snow is fluffier than warm snow');

/* ---------- 2. soundings and downscaling ---------- */
console.log('\nSounding interpolation');
{
  const times = makeTimes(48);
  const prof = makeProfile(times, { surfaceTemp: 0, lapse: 0.6 });
  const s = buildSounding(prof.hourly, prof._models, PRESSURE_LEVELS, 0);
  ok(s.length >= 8, `sounding has ${s.length} levels`);
  ok(s.every((a, i) => i === 0 || a.z > s[i - 1].z), 'sounding is sorted by height');
  const t1000 = temperatureAt(s, 1000, 1420, NaN);
  const t400 = temperatureAt(s, 400, 1420, NaN);
  ok(t400 > t1000, 'valley is warmer than mid-mountain in a normal lapse', `${t400.toFixed(1)} vs ${t1000.toFixed(1)}`);
  ok(near((t400 - t1000) / 6, 0.6, 0.15), 'recovered lapse rate is close to the one we injected', `${((t400 - t1000) / 6).toFixed(2)}`);
  const anchored = temperatureAt(s, 1420, 1420, -7);
  ok(near(anchored, -7, 0.01), 'anchor value is reproduced exactly at anchor height', `${anchored.toFixed(2)}`);
}

/* ---------- 3. full assembly ---------- */
console.log('\nAssembly');
{
  const times = makeTimes(72);
  const model = assemble(MTN, {
    surface: makeSurface(times, { baseTemp: -4 }),
    profile: makeProfile(times, { surfaceTemp: -4 }),
    ensemble: makeEnsemble(times, { baseTemp: -4 }),
    ml: null,
  });
  ok(model.hours.length === 72, `72 hours assembled (${model.hours.length})`);
  ok(bandsFor(MTN).length === 11, `11 elevation bands 400→1420 m (${bandsFor(MTN).join(', ')})`);
  const h = model.hours[12];
  ok(h.bands.every((b) => Number.isFinite(b.temp)), 'every band has a temperature');
  ok(h.valley.temp > h.summit.temp, 'valley warmer than summit under a normal lapse');
  ok(h.summit.wind > h.valley.wind, 'summit windier than the valley (exposure factor)');
  ok(h.summit.gust >= h.summit.wind, 'gusts are never below the sustained wind');
  ok(h.bands.every((b) => b.rh >= 1 && b.rh <= 100), 'humidity stays physical');
  ok(Number.isFinite(h.ens?.t10) && h.ens.t10 < h.ens.t90, 'ensemble percentiles are ordered');
  ok(h.pop >= 0 && h.pop <= 1, 'precipitation probability is a probability');
  ok(h.newSnow24 >= 0 && h.precip24 >= 0, 'accumulations are non-negative');
  ok(Object.values(h.scores).every((v) => v.score >= 0 && v.score <= 100), `all ${Object.keys(h.scores).length} activity scores are in range`);
  ok(model.hours.every((x) => x.bands.length === bandsFor(MTN).length), 'band count is stable across all hours');
}

/* ---------- 4. inversion ---------- */
console.log('\nInversion detection');
{
  const times = makeTimes(24);
  const model = assemble(MTN, {
    surface: makeSurface(times, { baseTemp: 1 }),
    profile: makeProfile(times, { surfaceTemp: 1, inversion: true }),
    ensemble: null,
    ml: null,
  });
  const h = model.hours[6];
  ok(h.inversion, 'inversion flagged when the low levels are warming with height');
  ok(h.valley.temp < h.summit.temp, 'valley is colder than the summit in the inversion case', `${h.valley.temp.toFixed(1)} vs ${h.summit.temp.toFixed(1)}`);
}

/* ---------- 5. snow line ---------- */
console.log('\nSnow line');
{
  const times = makeTimes(24);
  const model = assemble(MTN, {
    surface: makeSurface(times, { baseTemp: -2, precip: 1.2 }),   // summit at -2 °C
    profile: makeProfile(times, { surfaceTemp: -2 }),
    ensemble: null,
    ml: null,
  });
  const h = model.hours[6];
  ok(Number.isFinite(h.snowLine) && h.snowLine > MTN.base && h.snowLine < MTN.summit,
    `snow line lands inside the mountain (${Math.round(h.snowLine)} m)`);
  ok(h.summit.phase === 'snow', 'summit is getting snow');
  ok(h.valley.phase !== 'snow', 'valley is getting something wetter');
  ok(h.summit.snowCm > 0, 'snow accumulates at the summit');
  ok(h.valley.snowCm === 0 || h.valley.snowCm < h.summit.snowCm, 'less snow accumulates in the valley');
}

/* ---------- 6. machine learning ---------- */
console.log('\nMachine learning');
{
  const times = makeTimes(24 * 40);
  const BIAS = 1.6;                       // every model runs this much too warm
  const fh = { time: times };
  const truthT = times.map((t, i) => -3 + 4 * Math.sin((i / 24) * 2 * Math.PI) + Math.sin(i / 97) * 2);
  for (const m of MODELS) {
    fh[`temperature_2m_${m.key}`] = truthT.map((t, i) => t + BIAS + (Math.sin(i * 12.9898 + m.key.length) * 0.7));
    fh[`wind_speed_10m_${m.key}`] = times.map((t, i) => 7 + 2 * Math.sin(i / 11));
    fh[`precipitation_${m.key}`] = times.map((t, i) => (i % 5 === 0 ? 0.8 : 0));
    fh[`relative_humidity_2m_${m.key}`] = times.map(() => 85);
    fh[`cloud_cover_${m.key}`] = times.map(() => 70);
  }
  const training = {
    forecasts: { hourly: fh },
    truth: {
      hourly: {
        time: times,
        temperature_2m: truthT,
        wind_speed_10m: times.map((t, i) => 6.4 + 2 * Math.sin(i / 11)),
        precipitation: times.map((t, i) => (i % 5 === 0 ? 0.9 : 0)),
      },
    },
    truthModel: 'era5_land',
    models: MODELS.map((m) => m.key),
    range: { start_date: '2026-01-01', end_date: '2026-02-09' },
  };

  const ml = train(training);
  ok(ml && !ml.insufficient, `training produced a model from ${ml?.n} rows`);
  ok(ml.skill.length === MODELS.length, `all ${MODELS.length} models scored`);
  ok(near(ml.skill.reduce((a, s) => a + s.weight, 0), 1, 1e-9), 'skill weights sum to 1');
  ok(ml.scores.maeBaseT > 1, `uncorrected ensemble carries the injected bias (MAE ${ml.scores.maeBaseT.toFixed(2)} °C)`);
  ok(ml.temp?.use === true, 'the correction earned its place on the hold-out block');
  ok(ml.scores.maeMlT < ml.scores.maeBaseT * 0.5,
    `correction removes most of the bias (${ml.scores.maeBaseT.toFixed(2)} → ${ml.scores.maeMlT.toFixed(2)} °C)`);
  const dT = correctTemperature(ml, { ens: 0, spread: 0.8, rh: 85, cloud: 70, wind: 7, hour: 12, doy: 20 });
  ok(near(dT, -BIAS, 0.6), `learned correction is close to −${BIAS} °C (got ${dT.toFixed(2)})`);

  const w = modelWeights(ml, MODELS.map((m) => m.key));
  ok(near(Object.values(w).reduce((a, b) => a + b, 0), 1, 1e-9), 'inference-time weights also sum to 1');

  // ...and the corrected assembly should sit close to truth.
  const times2 = makeTimes(24);
  const before = assemble(MTN, { surface: makeSurface(times2, { baseTemp: 0 }), profile: makeProfile(times2, { surfaceTemp: 0 }), ensemble: null, ml: null });
  const after = assemble(MTN, { surface: makeSurface(times2, { baseTemp: 0 }), profile: makeProfile(times2, { surfaceTemp: 0 }), ensemble: null, ml });
  ok(after.hours[5].summit.temp < before.hours[5].summit.temp, 'the learned warm bias is subtracted in the live forecast',
    `${before.hours[5].summit.temp.toFixed(2)} → ${after.hours[5].summit.temp.toFixed(2)}`);
}

/* ---------- 7. daily summaries (the comparison view) ---------- */
console.log('\nDaily summaries');
{
  const times = makeTimes(24 * 5);
  const model = assemble(MTN, {
    surface: makeSurface(times), profile: makeProfile(times), ensemble: null, ml: null,
  });
  const days = dailySummaries(model, 'trail');
  ok(days.length === 5 || days.length === 6, `one summary per calendar day (${days.length})`);
  ok(days.every((d) => Number.isFinite(d.best.score)), 'every day has a scored best window');
  ok(days.every((d) => d.best.endTime >= d.best.startTime), 'windows do not run backwards');
  ok(days.every((d) => d.best.score >= Math.min(...d.hours.map((h) => h.scores.trail.score)) - 0.01), 'best window is not worse than the worst hour');
  ok(days.every((d) => d.best.score <= Math.max(...d.hours.map((h) => h.scores.trail.score)) + 0.01), 'best window is not better than the best hour');
  ok(days.every((d) => d.precip >= 0 && d.newSnow >= 0), 'daily accumulations are non-negative');
  ok(days.every((d) => !Number.isFinite(d.tMax) || d.tMax >= d.tMin), 'daily maximum is not below the minimum');

  // Windows must be contiguous hours, not a stitched-together best-of.
  const spans = days.map((d) => (d.best.endTime - d.best.startTime) / 3.6e6);
  ok(spans.every((s2) => s2 === 2 || s2 === 0), `3-hour windows span exactly 2 hours end to end (${[...new Set(spans)].join(', ')})`);
  const long = dailySummaries(model, 'thru');
  const longSpans = long.map((d) => (d.best.endTime - d.best.startTime) / 3.6e6);
  ok(longSpans.every((s2) => s2 === 7 || s2 === 0), `hut-to-hut uses its own 8-hour window (${[...new Set(longSpans)].join(', ')})`);

  // Hours already past must not win today a recommendation.
  const late = dailySummaries(model, 'trail', { fromIndex: 20 });
  ok(late[0].hours.every((h) => h.i >= 20), 'fromIndex excludes hours that have already happened');
  ok(late[0].partial === true, 'a part-day is flagged as partial');

  const ski = dailySummaries(model, 'skimo');
  ok(ski.length === days.length && ski.every((d) => Number.isFinite(d.best.score)), 'the same works for ski mountaineering');
}

/* ---------- 8. SMHI observations ---------- */
console.log('\nObservations');
{
  const hourAgo = Date.now() - 40 * 60e3;
  const set = (stations) => ({ station: stations.map(([key, name, lat, lon, height, value]) => ({
    key, name, latitude: lat, longitude: lon, height,
    value: [{ date: hourAgo, value: String(value), quality: 'G' }],
  })) });

  const temps = parseStationSet(set([
    ['1', 'Åre valley', 63.40, 13.08, 380, -2.4],
    ['2', 'High ridge', 63.33, 13.10, 1400, -8.1],
    ['3', 'Östersund', 63.18, 14.63, 370, 1.2],
    ['4', 'Far away', 60.00, 15.00, 100, 5.0],
  ]));
  ok(temps.size === 4, `parsed ${temps.size} stations from a station-set payload`);
  ok(temps.get('1').value === -2.4 && temps.get('1').quality === 'G', 'latest value and quality flag are read');
  ok(Number.isFinite(temps.get('2').at), 'observation timestamp is parsed');

  const d = distanceKm(63.4262, 13.0665, 63.1792, 14.6357);
  ok(near(d, 82, 12), `Åreskutan to Östersund is about 82 km (got ${Math.round(d)})`);
  ok(near(distanceKm(63.4, 13.0, 63.4, 13.0), 0, 0.001), 'distance to itself is zero');

  const near1 = nearestStations(MTN, temps);
  ok(near1.length === 2, `only the stations inside the radius are returned (${near1.length})`);
  ok(!near1.some((s2) => s2.name === 'Far away' || s2.name === 'Östersund'),
    'stations beyond the 60 km radius are excluded, Östersund at 83 km included');
  ok(near1[0].name === 'High ridge',
    `a ridge station at summit height beats a closer valley station (${near1.map((s2) => s2.name).join(' < ')})`);
  ok(near1.every((s2, i, arr) => i === 0 || arr[i - 1].cost <= s2.cost), 'ranking is ordered by cost');

  const sets = {
    temp: temps,
    wind: parseStationSet(set([['2', 'High ridge', 63.33, 13.10, 1400, 12.5]])),
    dir: parseStationSet(set([['2', 'High ridge', 63.33, 13.10, 1400, 270]])),
  };
  const merged = collectStation('2', sets);
  ok(merged.temp.value === -8.1 && merged.wind.value === 12.5, 'readings merge across parameters for one station');
  ok(collectStation('999', sets).temp === undefined, 'an unknown station yields nothing rather than throwing');

  // Compare against a forecast whose summit is deliberately 3 degrees warm.
  const times = makeTimes(48, new Date(Date.now() - 24 * 3600e3));
  const model = assemble(MTN, {
    surface: makeSurface(times, { baseTemp: -5.1 }), profile: makeProfile(times, { surfaceTemp: -5.1 }),
    ensemble: null, ml: null,
  });
  const cmp = compareWithModel(model, near1[0], merged);
  ok(cmp !== null, 'a comparison is produced for a recent observation');
  ok(Number.isFinite(cmp.modelled.temp.delta), `temperature delta computed (${round(cmp.modelled.temp.delta, 2)}°)`);
  ok(near(cmp.modelled.temp.delta, cmp.modelled.temp.model - (-8.1), 0.001), 'delta is model minus observed');
  ok(cmp.elevation === 1400, 'the model is evaluated at the station elevation, not the summit');
  ok(Number.isFinite(cmp.modelled.wind.delta), 'wind delta computed');
  ok(Math.abs(cmp.modelled.dir.delta) <= 180, 'direction difference wraps to ±180°');

  const stale = compareWithModel(model, near1[0], { temp: { value: 0, at: Date.now() - 9 * 3600e3 } });
  ok(stale === null || stale.stale === true, 'an old reading is either unmatched or flagged stale');

  const built = buildObservations(model, sets);
  ok(built && built.stations.length >= 1, 'buildObservations assembles a card payload');
  ok(built.reference.station.name === 'High ridge', 'the reference station is the best-ranked one that can be compared');
  ok(buildObservations(model, { temp: new Map() }) === null, 'no stations at all yields null rather than an empty card');
}

/* ---------- 9. configuration integrity ---------- */
console.log('\nConfiguration');
{
  const times = makeTimes(24);
  const model = assemble(MTN, { surface: makeSurface(times), profile: makeProfile(times), ensemble: null, ml: null });
  const h = model.hours[8];

  const metrics = new Set(), flags = new Set();
  for (const a of ACTIVITIES) {
    for (const r of a.rules) (r.kind === 'flag' ? flags : metrics).add(r.kind === 'flag' ? r.flag : r.metric);
  }

  // A rule naming a metric or flag nobody implements would silently never fire.
  const probe = { ...h, snowDepth: 0.5, cape: 900, cloud: 95, summitInCloud: false, daylight: false, moon: 0.2 };
  const scored = ACTIVITIES.map((a) => [a.id, scoreActivity(a, probe)]);
  ok(scored.every(([, v]) => Number.isFinite(v.score)), `all ${ACTIVITIES.length} activities score a fully-populated hour`);
  ok(scored.every(([, v]) => v.score >= 0 && v.score <= 100), 'every score stays inside 0–100');
  ok(ACTIVITIES.every((a) => a.rules.every((r) => (r.kind === 'flag' ? r.amount > 0 : r.cap > 0) && r.label && r.why)),
    `all ${ACTIVITIES.reduce((n, a) => n + a.rules.length, 0)} rules carry a cap, a label and a reason`);
  ok(new Set(ACTIVITIES.map((a) => a.id)).size === ACTIVITIES.length, 'activity ids are unique');
  ok(ACTIVITIES.every((a) => a.window >= 1 && a.base > 0 && a.short && a.name), 'every activity has a window, a base and both names');

  // Aurora is the one activity that wants darkness; it must not be recommended at noon.
  const noon = { ...h, daylight: true, cloud: 0, moon: 0 };
  const night = { ...h, daylight: false, cloud: 0, moon: 0 };
  ok(scoreActivity(activityById('aurora'), night).score > scoreActivity(activityById('aurora'), noon).score + 40,
    `aurora scores far better at night (${scoreActivity(activityById('aurora'), night).score} vs ${scoreActivity(activityById('aurora'), noon).score})`);
  const dark = dailySummaries(model, 'aurora')[0];
  ok(dark.best.dark === true, 'the aurora window is picked after dark rather than in daylight');

  // Snowkiting is the one activity that wants wind.
  const kite = activityById('kite');
  const calm = { ...h, snowDepth: 0.6, summit: { ...h.summit, wind: 2, gust: 3 } };
  const breezy = { ...h, snowDepth: 0.6, summit: { ...h.summit, wind: 11, gust: 13 } };
  const storm = { ...h, snowDepth: 0.6, summit: { ...h.summit, wind: 26, gust: 34 } };
  ok(scoreActivity(kite, breezy).score > scoreActivity(kite, calm).score, 'snowkiting scores wind as a good thing');
  ok(scoreActivity(kite, breezy).score > scoreActivity(kite, storm).score, 'but not an unlimited amount of it');
  // The same two winds, on bare ground, where trail running is actually in season.
  const bareBreezy = { ...breezy, snowDepth: 0 };
  const bareStorm = { ...storm, snowDepth: 0 };
  ok(scoreActivity(activityById('trail'), bareBreezy).score > scoreActivity(activityById('trail'), bareStorm).score,
    'while running prefers the calmer of the same two winds');
  ok(scoreActivity(activityById('trail'), { ...bareBreezy, snowDepth: 0.6 }).labelKey === 'verdict.outOfSeason',
    'and running is out of season under deep snow, rather than merely scoring badly');

  // Seasons gate rather than score.
  const summer = { ...h, snowDepth: 0, time: new Date(2026, 6, 15, 12) };
  const winter = { ...h, snowDepth: 0.8, time: new Date(2026, 0, 15, 12) };
  ok(scoreActivity(activityById('skimo'), summer).labelKey === 'verdict.outOfSeason', 'no ski touring without snow');
  ok(scoreActivity(activityById('bike'), winter).labelKey === 'verdict.outOfSeason', 'no bike park under 80 cm of snow');
  ok(scoreActivity(activityById('bike'), summer).labelKey !== 'verdict.outOfSeason', 'the bike park runs on bare ground');
  ok(scoreActivity(activityById('skimo'), winter).labelKey !== 'verdict.outOfSeason', 'and ski touring runs on snow');

  // Terrain gating.
  const liftless = { ...MTN, features: ['plateau'] };
  ok(!activitiesFor(liftless).some((a) => a.requires === 'lift'), 'lift-served activities are hidden without a lift');
  ok(activitiesFor(liftless).some((a) => a.id === 'kite'), 'but plateau activities are offered');
  ok(activitiesFor({ ...MTN, features: [] }).every((a) => !a.requires), 'a featureless peak offers only universal activities');
  ok(model.activities.length === activitiesFor(MTN).length, 'the assembled model carries its own activity list');

  ok(SOURCES.providers.length === MODELS.length, `every model has a provenance entry (${SOURCES.providers.length}/${MODELS.length})`);
  ok(MODELS.every((m) => SOURCES.providers.some((p) => p.key === m.key)), 'provenance keys match model keys');
  ok(SOURCES.providers.every((p) => p.licence && p.credit && p.licenceUrl), 'every provider has a licence, a credit line and a licence link');
  ok(Number.isFinite(bestWindow(model.hours, 'hike')?.score), 'bestWindow works for a newly added activity');
  ok(metrics.size >= 10 && flags.size >= 5, `${metrics.size} metrics and ${flags.size} flags in use across the registry`);
}

/* ---------- 10. degraded inputs ---------- */
console.log('\nGraceful degradation');
{
  const times = makeTimes(24);
  const noProfile = assemble(MTN, { surface: makeSurface(times), profile: null, ensemble: null, ml: null });
  ok(noProfile.hours.every((h) => h.bands.every((b) => Number.isFinite(b.temp))), 'still produces temperatures with no sounding at all');
  ok(!noProfile.hours[0].haveSounding, 'and admits it has no sounding');
  ok(near(noProfile.hours[0].valley.temp - noProfile.hours[0].summit.temp, ((MTN.summit - 400) / 100) * 0.65, 0.4), 'falls back to the constant lapse rate');

  const sparse = makeSurface(times);
  for (const m of MODELS.slice(1)) delete sparse.hourly[`temperature_2m_${m.key}`];
  const oneModel = assemble(MTN, { surface: sparse, profile: null, ensemble: null, ml: null });
  ok(Number.isFinite(oneModel.hours[0].summit.temp), 'survives when only one model returns temperature');

  const scoreless = { summit: { temp: NaN, feels: NaN, wind: NaN, gust: NaN, precip: NaN, rain: NaN, phase: 'unknown', z: 1420 }, daylight: true, time: new Date(), newSnow24: 0, drift: 0, cloud: 0, freezingLevel: NaN, moon: 0.5 };
  ok(ACTIVITIES.every((a) => Number.isFinite(scoreActivity(a, scoreless).score)), 'every activity survives an all-NaN hour');
}

/* ---------- 11. climatology ---------- */
console.log('\nClimatology');
{
  /* Thirty synthetic years with a clean seasonal cycle: coldest at new year,
     warmest in July, plus a repeatable pseudo-random year-to-year wobble. */
  const time = [], tmax = [], tmin = [], precip = [], snow = [], wind = [];
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let y = 1995; y < 2025; y++) {
    for (let doy = 1; doy <= 365; doy++) {
      const d = new Date(Date.UTC(y, 0, doy));
      time.push(d.toISOString().slice(0, 10));
      const season = -8 + 14 * Math.sin(((doy - 105) / 365) * 2 * Math.PI);
      const noise = (rnd() - 0.5) * 6;
      tmax.push(round(season + noise, 2));
      tmin.push(round(season + noise - 6, 2));
      precip.push(round(rnd() * 8, 2));
      snow.push(season < 0 ? round(rnd() * 4, 2) : 0);
      wind.push(round(6 + rnd() * 12, 2));
    }
  }
  const climate = summarise({ daily: { time, temperature_2m_max: tmax, temperature_2m_min: tmin, precipitation_sum: precip, snowfall_sum: snow, wind_speed_10m_max: wind } });

  ok(climate.years === 30, 'counts the years in the archive', `got ${climate?.years}`);
  ok(climate.days[15].n === 30 * 11, 'pools a ±5-day band across every year', `got ${climate.days[15].n}`);
  ok(climate.days.filter(Boolean).length >= 365, 'covers every day of the year');
  ok(climate.percentiles[15].tmax.length === climate.days[15].n, 'keeps one sample per pooled day for percentiles');

  const jan = climate.days[dayOfYear('2026-01-15')];
  const jul = climate.days[dayOfYear('2026-07-15')];
  ok(jul.tmaxP50 > jan.tmaxP50 + 15, 'July is warmer than January in the normals', `${round(jan.tmaxP50, 1)} vs ${round(jul.tmaxP50, 1)}`);
  ok(jan.tmaxP10 < jan.tmaxP50 && jan.tmaxP50 < jan.tmaxP90, 'the percentiles are ordered');
  ok(jan.snowMean > jul.snowMean, 'snow falls in the winter half of the record');

  ok(near(percentileOf(5, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), 0.4, 1e-9), 'percentileOf ranks a value inside its sample');
  ok(Number.isNaN(percentileOf(5, [])), 'and refuses an empty sample');

  const cold = contextFor(climate, { date: '2026-01-15', tmax: jan.tmaxP10 - 4, wind: jan.windP50, precip: 0 });
  const warm = contextFor(climate, { date: '2026-01-15', tmax: jan.tmaxP90 + 4, wind: jan.windP50, precip: 0 });
  ok(cold.temp.percentile < 0.1, 'a cold day lands in the bottom tenth', `${cold.temp.pct}%`);
  ok(warm.temp.percentile > 0.9, 'a warm day lands in the top tenth', `${warm.temp.pct}%`);
  ok(cold.temp.anomaly < 0 && warm.temp.anomaly > 0, 'the anomaly carries the right sign');
  ok(near(warm.wind.percentile, 0.5, 0.1), 'a median wind reads as median');
  ok(contextFor(null, { date: '2026-01-15', tmax: 0, wind: 0, precip: 0 }) === null, 'returns nothing rather than guessing without an archive');

  ok(unusualness(0.5) === 'normal', 'the middle of the distribution is simply normal', unusualness(0.5));
  ok(unusualness(0.02) === 'far-below' && unusualness(0.98) === 'far-above', 'and the tails are called on both sides');
  ok(unusualness(0.15) === 'below' && unusualness(0.85) === 'above', 'with a softer word just inside them');
  ok(unusualness(NaN) === null, 'and nothing at all without a percentile');

  const wk = weekly(climate);
  ok(wk.length === 52, 'the year strip has 52 weeks', `got ${wk.length}`);
  ok(wk.every((w) => w && Number.isFinite(w.tmax) && Number.isFinite(w.tmin) && w.tmax > w.tmin), 'every week has a temperature band the right way up');
  const warmest = wk.reduce((a, b) => (b.tmax > a.tmax ? b : a));
  ok(warmest.week >= 24 && warmest.week <= 33, 'the warmest week falls in high summer', `week ${warmest.week}`);
}

/* ---------- 12. sun and aspect ---------- */
console.log('\nSun position and aspect');
{
  const LAT = 63.4305, LON = 13.0800;
  /* Solar noon at midwinter and midsummer, at Åreskutan's latitude. */
  const winter = solarPosition(Date.UTC(2025, 11, 21, 11, 12), LAT, LON);
  const summer = solarPosition(Date.UTC(2026, 5, 21, 11, 12), LAT, LON);
  ok(near(winter.elevation, 3.1, 1.0), 'midwinter noon sun is barely 3° up', `${round(winter.elevation, 1)}°`);
  ok(near(summer.elevation, 50.1, 1.0), 'midsummer noon sun reaches 50°', `${round(summer.elevation, 1)}°`);
  ok(near(winter.azimuth, 180, 6) && near(summer.azimuth, 180, 6), 'and both are due south at local noon');
  const morning = solarPosition(Date.UTC(2026, 5, 21, 4, 0), LAT, LON);
  const evening = solarPosition(Date.UTC(2026, 5, 21, 18, 0), LAT, LON);
  ok(morning.azimuth < 120, 'the summer sun is in the east in the morning', `${round(morning.azimuth)}°`);
  ok(evening.azimuth > 240, 'and in the west in the evening', `${round(evening.azimuth)}°`);
  const night = solarPosition(Date.UTC(2025, 11, 21, 23, 0), LAT, LON);
  ok(night.elevation < 0, 'midwinter midnight is below the horizon');

  ok(near(angleBetween(350, 10), 20, 1e-9), 'angles wrap around north');
  ok(near(angleBetween(0, 180), 180, 1e-9), 'and top out at 180°');

  /* A steady 20 m/s from the west, 12 cm of new snow already moving (the drift
     index runs 0-100), with the sun in the south. */
  const hour = { summit: { wind: 20, gust: 28, dir: 270, temp: -6 }, newSnow24: 12, drift: 70, daylight: true };
  const sun = { elevation: 20, azimuth: 180 };
  const aspects = aspectAnalysis(hour, { summit: 1420, base: 400 }, sun);
  ok(aspects.length === ASPECTS.length, 'one reading per compass sector');
  const by = Object.fromEntries(aspects.map((a) => [a.bearing, a]));
  ok(by[270].wind > by[90].wind, 'the windward face sees more wind than the lee', `${round(by[270].wind, 1)} vs ${round(by[90].wind, 1)}`);
  ok(by[90].leeness > by[270].leeness, 'and the lee face is the loaded one');
  ok(aspects.every((a) => a.wind > 0 && a.wind <= hour.summit.wind + 1e-9), 'no sector is windier than the free-air wind');
  ok(by[180].sun > by[0].sun, 'a south face takes more sun than a north face at 20° elevation');

  const advice = aspectAdvice(aspects);
  ok(advice.sheltered.every((b2) => angleBetween(b2, 90) <= 46), 'the shelter is called on the east side', advice.sheltered.join('/'));
  ok(advice.exposed.every((b2) => angleBetween(b2, 270) <= 46), 'and the exposure on the west side', advice.exposed.join('/'));
  ok(advice.loaded.length > 0 && advice.loaded.every((b2) => angleBetween(b2, 90) <= 91), 'wind loading is called on the lee side', advice.loaded.join('/'));
  ok(advice.sunny.every((b2) => angleBetween(b2, 180) <= 46), 'and the sun on the south side', advice.sunny.join('/'));
  ok(advice.maxLoading > 0, 'and it reports how strong that loading is');

  const calm = aspectAnalysis({ summit: { wind: 1, gust: 2, dir: 270, temp: 2 }, newSnow24: 0, drift: 0, daylight: true }, { summit: 1420, base: 400 }, sun);
  ok(aspectAdvice(calm).maxLoading < advice.maxLoading, 'a calm, snowless hour loads nothing');
  const dark = aspectAnalysis(hour, { summit: 1420, base: 400 }, { elevation: -6, azimuth: 10 });
  ok(dark.every((a) => a.sun === 0), 'nothing is sunny when the sun is down');
}

/* ---------- 13. translations ---------- */
console.log('\nTranslations');
{
  const keys = Object.keys(STRINGS);
  const ids = LANGS.map((l) => l.id);
  const missing = keys.filter((k) => ids.some((id) => typeof STRINGS[k][id] !== 'string' || !STRINGS[k][id].length));
  ok(missing.length === 0, `every one of the ${keys.length} strings exists in ${ids.join(' and ')}`, missing.slice(0, 6).join(', '));

  const untranslated = keys.filter((k) => STRINGS[k].en === STRINGS[k].sv && /[a-z]{4} [a-z]{4}/i.test(STRINGS[k].en));
  ok(untranslated.length === 0, 'no multi-word string is identical in both languages', untranslated.slice(0, 4).join(', '));

  const placeholders = (s2) => (s2.match(/\{[a-zA-Z]+\}/g) ?? []).sort().join(',');
  const mismatched = keys.filter((k) => placeholders(STRINGS[k].en) !== placeholders(STRINGS[k].sv));
  ok(mismatched.length === 0, 'both languages interpolate the same placeholders', mismatched.slice(0, 4).join(', '));

  /* A dropped </a> in one language only shows up as a broken page in that
     language, which is exactly the bug nobody notices. */
  const tags = (s2) => (s2.match(/<\/?[a-z]+/g) ?? []).sort().join(',');
  const tagged = keys.filter((k) => tags(STRINGS[k].en) !== tags(STRINGS[k].sv));
  ok(tagged.length === 0, 'and carry the same inline markup', tagged.slice(0, 4).join(', '));

  /* Every key the markup and the modules ask for has to exist, or the page
     renders the key itself. */
  const files = fs.readdirSync(new URL('../js/', import.meta.url)).filter((f) => f.endsWith('.js'));
  const pages = fs.readdirSync(new URL('../', import.meta.url)).filter((f) => f.endsWith('.html'));
  const asked = new Set();
  for (const f of pages) {
    const html = fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    for (const m of html.matchAll(/data-i18n(?:-html|-title|-label|-content)?="([^"]+)"/g)) asked.add(m[1]);
  }
  for (const f of files) {
    const js = fs.readFileSync(new URL(`../js/${f}`, import.meta.url), 'utf8');
    for (const m of js.matchAll(/\bt\('([a-z][\w.]+)'/g)) asked.add(m[1]);
  }
  const unknown = [...asked].filter((k) => !STRINGS[k]);
  ok(unknown.length === 0, `all ${asked.size} keys used by the pages and modules are defined`, unknown.slice(0, 8).join(', '));

  const activityStrings = ACTIVITIES.flatMap((a) => [a.name, a.blurb, ...a.rules.map((r) => r.label)]);
  ok(activityStrings.every((v) => v && typeof v.en === 'string' && typeof v.sv === 'string'), 'every activity name, blurb and rule is bilingual');
}

/* ---------- 14. climate projections ---------- */
console.log('\nClimate projections');
{
  /* A synthetic century at 700 m: a clean seasonal cycle, a warming trend of
     0.4 °C per decade, and enough precipitation to build a pack. */
  function century({ warmPerDecade = 0.4, base = -1.5, elevation = 700, wet = 3.2 } = {}) {
    const time = [], tmax = [], tmin = [], precipitation_sum = [], relative_humidity_2m_mean = [];
    let seed = 11;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let y = 1950; y <= 2050; y++) {
      for (let doy = 1; doy <= 365; doy++) {
        const d = new Date(Date.UTC(y, 0, doy));
        time.push(d.toISOString().slice(0, 10));
        const season = base + 13 * Math.sin(((doy - 105) / 365) * 2 * Math.PI);
        const warming = ((y - 1950) / 10) * warmPerDecade;
        const noise = (rnd() - 0.5) * 4;
        const mid = season + warming + noise;
        tmax.push(round(mid + 3, 2));
        tmin.push(round(mid - 3, 2));
        precipitation_sum.push(round(rnd() * wet * 2, 2));
        relative_humidity_2m_mean.push(round(72 + rnd() * 20, 1));
      }
    }
    return { elevation, daily: { time, temperature_2m_max: tmax, temperature_2m_min: tmin, precipitation_sum, relative_humidity_2m_mean } };
  }

  ok(winterYear('2026-11-14') === 2026 && winterYear('2026-02-14') === 2025, 'a winter is labelled by the year it starts in');
  ok(near(depthFromWater(reliableWaterEquivalent()), WARMING.reliableDepth, 1e-9), 'the depth threshold round-trips through water equivalent');

  const raw = century();
  const series = extract(raw, null);
  ok(series && series.time.length > 36000, 'a single-model response is read without a model suffix', `${series?.time?.length}`);

  /* the same payload, suffixed the way a multi-model request comes back */
  const suffixed = { elevation: raw.elevation, daily: Object.fromEntries(Object.entries(raw.daily).map(([k, v]) => [k === 'time' ? k : `${k}_EC_Earth3P_HR`, v])) };
  const s2 = extract(suffixed, 'EC_Earth3P_HR');
  ok(s2 && s2.time.length === series.time.length, 'and with one when the request asked for a named model');
  ok(extract({ daily: { time: [] } }, null) === null, 'an empty response yields nothing rather than throwing');

  const low = winters(series, 400);
  const high = winters(series, 1400);
  ok(low.length > 95 && high.length > 95, 'a century in gives about a century of winters out', `${low.length}`);
  ok(low.every((w) => w.days > 300), 'and the half-winters at each end are dropped');

  const meanOf = (rows, k) => mean(rows.map((r) => r[k]).filter(Number.isFinite));
  ok(meanOf(high, 'freezeDays') > meanOf(low, 'freezeDays') + 20, 'the summit freezes for longer than the valley',
    `${round(meanOf(low, 'freezeDays'))} vs ${round(meanOf(high, 'freezeDays'))}`);
  ok(meanOf(high, 'coverDays') > meanOf(low, 'coverDays'), 'and holds a cover for longer');
  ok(meanOf(high, 'thawDays') < meanOf(low, 'thawDays'), 'while thawing in midwinter less often');
  ok(meanOf(high, 'snowShare') > meanOf(low, 'snowShare'), 'and taking more of its precipitation as snow');
  ok(high.every((w) => w.snowShare >= 0 && w.snowShare <= 1), 'the snow share is a share');

  /* the trend has to survive the round trip */
  const early = overPeriod(low, 'coverDays', { from: 1961, to: 1990 });
  const late = overPeriod(low, 'coverDays', { from: 2031, to: 2050 });
  ok(late < early, 'a warming century shortens the season', `${round(early)} → ${round(late)}`);
  const tTrend = trend(low, 'tmeanWinter');
  ok(tTrend && near(tTrend.perDecade, 0.4, 0.12), 'and the injected warming rate is recovered', `${round(tTrend?.perDecade, 2)} °C/decade`);
  ok(trend(low.slice(0, 4), 'coverDays') === null, 'a trend is refused on too few winters');

  const flat = winters(extract(century({ warmPerDecade: 0 }), null), 700);
  const flatTrend = trend(flat, 'coverDays');
  ok(flatTrend && Math.abs(flatTrend.perDecade) < 3, 'a century with no warming trends nowhere', `${round(flatTrend?.perDecade, 2)}`);

  /* ensembling */
  const runs = [0.2, 0.4, 0.7].map((r) => winters(extract(century({ warmPerDecade: r }), null), 700));
  const ens = ensemble(runs);
  ok(ens.length > 95, 'the ensemble spans every winter the models share');
  ok(ens.every((r) => r.n === 3), 'and knows how many models stand behind each one');
  ok(ens.every((r) => !Number.isFinite(r.coverDays) || (r.coverDaysLo <= r.coverDays && r.coverDays <= r.coverDaysHi)),
    'the median always sits inside the spread');
  const lateEns = ens.filter((r) => r.winter >= 2040);
  ok(lateEns.some((r) => r.coverDaysHi > r.coverDaysLo), 'and the models disagree more than not');
  ok(ensemble([]).length === 0, 'no models means no ensemble, not a crash');

  /* the staircase */
  const byBand = new Map(WARMING.bands.map((z) => [z, ensemble([winters(series, z)])]));
  const bands = staircase(byBand, 'coverDays');
  ok(bands.length === WARMING.bands.length, 'the staircase has one step per band');
  ok(bands.every((b) => b.periods.length === WARMING.periods.length), 'and one value per period on each step');
  const stairValues = bands.map((b) => b.periods.find((p) => p.id === 'present').value);
  ok(stairValues.every((v, i) => i === 0 || v >= stairValues[i - 1] - 1), 'the season never gets shorter as you climb', stairValues.map((v) => round(v)).join(' → '));

  const now = reliabilityLine(bands, 'present');
  const later = reliabilityLine(bands, 'future');
  ok(now.z === null || WARMING.bands.includes(now.z), 'the reliability line lands on a real band');
  ok(later.z === null || now.z === null || later.z >= now.z, 'and never walks downhill as the climate warms', `${now.z} → ${later.z}`);

  const v = verdict(bands);
  ok(v.length === bands.length, 'a verdict per band');
  ok(v.every((r) => !Number.isFinite(r.lost) || near(r.lost, r.future - r.present, 1e-9)), 'the change is future minus present');
  ok(v.every((r) => !r.reliableLater || r.reliableNow), 'nothing gains reliability it did not already have');

  /* degraded inputs */
  ok(winters(null, 700).length === 0, 'no series, no winters');
  const holes = extract(century(), null);
  for (let i = 0; i < holes.tmax.length; i++) if (i % 365 < 40) holes.tmax[i] = NaN;
  const holed = winters(holes, 700);
  ok(holed.length > 90, 'a series missing weeks at a time still produces winters', `${holed.length}`);
  ok(holed.every((w) => w.days >= 240), 'and every one it reports has most of a year behind it');
  const shortSeries = extract({ elevation: 700, daily: { time: ['2020-01-01', '2020-01-02'], temperature_2m_max: [1, 2], temperature_2m_min: [-1, 0], precipitation_sum: [0, 0], relative_humidity_2m_mean: [80, 80] } }, null);
  ok(winters(shortSeries, 700).length === 0, 'and two days is never reported as a winter');

  /* storage: the full record is far too big for localStorage, so only what the
     page reads is kept, and it has to survive the round trip intact */
  const byBandFull = {};
  for (const z of WARMING.bands) byBandFull[z] = winters(series, z);
  const summary = { elevation: series.elevation, byBand: byBandFull };
  const packed = pack(summary);
  const fullBytes = JSON.stringify(summary).length;
  const packedBytes = JSON.stringify(packed).length;
  ok(packedBytes * 8 < 900e3, 'eight packed sources fit inside a localStorage quota', `${round(packedBytes * 8 / 1024)} KB`);
  ok(packedBytes < fullBytes / 5, 'packing is at least five times smaller than the full record', `${round(fullBytes / 1024)} → ${round(packedBytes / 1024)} KB`);

  const back = unpack(packed);
  ok(back && Object.keys(back.byBand).length === WARMING.bands.length, 'every band survives the round trip');
  const before = summary.byBand[1000];
  const after = back.byBand[1000];
  ok(before.length === after.length, 'and every winter with it');
  ok(before.every((w, i) => w.winter === after[i].winter), 'in the same order');
  ok(STORED_METRICS.every((m) => before.every((w, i) => !Number.isFinite(w[m]) || near(w[m], after[i][m], 0.01))),
    'with every stored metric intact to two decimals');
  ok(unpack(null) === null && unpack({ v: 1 }) === null, 'a cache entry from an older shape is rejected rather than misread');

  ok(CLIMATE_MODELS.length === 7 && new Set(CLIMATE_MODELS.map((m) => m.key)).size === 7, 'seven distinct climate models are configured');
  ok(WARMING.bands.every((z, i) => i === 0 || z > WARMING.bands[i - 1]), 'the bands are in order');
  ok(WARMING.periods.every((p) => p.to > p.from), 'and every period runs forwards');
}

/* ---------- 15. probabilities ---------- */
console.log('\nEnsemble probabilities');
{
  /* A synthetic ensemble: `spec` gives each member a fixed daily character, so
     the probability of any event is known exactly before it is computed. */
  function ensembleOf(spec, { days = 4, elevation = 1420 } = {}) {
    const hourly = { time: [] };
    for (let d = 0; d < days; d++) {
      for (let h = 0; h < 24; h++) hourly.time.push(`2026-02-${pad(10 + d)}T${pad(h)}:00`);
    }
    spec.forEach((member, m) => {
      const id = `member${pad(m + 1)}`;
      const T = [], P = [], W = [], C = [];
      for (let d = 0; d < days; d++) {
        const day = member[Math.min(d, member.length - 1)];
        for (let h = 0; h < 24; h++) {
          T.push(day.temp);
          P.push(day.mmPerHour ?? 0);
          W.push(h === 12 ? (day.gust ?? day.wind ?? 0) : (day.wind ?? 0));
          C.push(day.cloud ?? 50);
        }
      }
      hourly[`temperature_2m_${id}`] = T;
      hourly[`precipitation_${id}`] = P;
      hourly[`wind_speed_10m_${id}`] = W;
      if (member.every((x) => x.cloud !== null)) hourly[`cloud_cover_${id}`] = C;
    });
    return { elevation, hourly };
  }

  const cold = { temp: -8, mmPerHour: 0.5, wind: 4, cloud: 90 };      // 12 mm/day as snow
  const calm = { temp: -6, mmPerHour: 0, wind: 3, cloud: 10 };        // bluebird
  const gale = { temp: -3, mmPerHour: 0.4, wind: 22, cloud: 95 };     // storm
  const wet = { temp: 4, mmPerHour: 0.3, wind: 6, cloud: 95 };        // rain
  const deep = { temp: -25, mmPerHour: 0, wind: 2, cloud: 20 };       // hard freeze

  const spec = [
    ...Array(4).fill([cold]), ...Array(3).fill([calm]),
    ...Array(2).fill([gale]), [wet],
  ];
  const rows = memberDays(ensembleOf(spec), { elevation: 1420, anchor: 1420 });
  ok(rows.length === 10 * 4, 'one record per member per day', `${rows.length}`);
  ok(new Set(rows.map((r) => r.member)).size === 10, 'and one member per member');

  const days = daily(rows);
  ok(days.length === 4, 'four days in, four days out');
  const d0 = days[0];
  ok(d0.members === 10, 'every member reaches every day');
  /* Six, not four: the two gale members drop 9.6 mm at -3 °C, which at a ratio
     of 11 is 10.6 cm — a storm day is very often a powder day too, and counting
     members is what makes that visible instead of hiding it in two averages. */
  ok(near(d0.events.powder, 0.6, 1e-9), 'the powder share is counted, not estimated', `${d0.events.powder}`);
  ok(near(d0.events.powder + d0.events.bluebird + d0.events.rain, 1, 1e-9), 'and storms are counted in both places they belong');
  ok(near(d0.events.bluebird, 0.3, 1e-9), 'and so is the bluebird share', `${d0.events.bluebird}`);
  ok(near(d0.events.storm, 0.2, 1e-9), 'and the storm share', `${d0.events.storm}`);
  ok(near(d0.events.rain, 0.1, 1e-9), 'and the rain share', `${d0.events.rain}`);
  ok(d0.events.hardFreeze === 0, 'an event no member delivers is zero, not missing');
  const arctic = daily(memberDays(ensembleOf([[deep], [deep], [calm], [calm]]), { elevation: 1420, anchor: 1420 }))[0];
  ok(near(arctic.events.hardFreeze, 0.5, 1e-9), 'and one that half of them do is a half', `${arctic.events.hardFreeze}`);
  ok(near(probabilityOf(
    memberDays(ensembleOf([[deep], [deep], [calm], [calm]]), { elevation: 1420, anchor: 1420 }).filter((r) => r.date === arctic.date),
    OUTLOOK.events.find((e) => e.id === 'hardFreeze'),
  ), 0.5, 1e-9), 'counted the same way when asked for one event alone');
  ok(near(d0.wetFrac, 0.7, 1e-9), 'the wet fraction counts members with measurable precipitation', `${d0.wetFrac}`);
  ok(d0.pop === d0.wetFrac && d0.popCalibrated === false, 'and stands uncalibrated when nothing calibrates it');

  /* the property the whole module exists for: joint conditions */
  const jointSpec = [
    ...Array(5).fill([{ temp: -8, mmPerHour: 0.5, wind: 4, cloud: 90 }]),     // snow, calm
    ...Array(5).fill([{ temp: -8, mmPerHour: 0.5, wind: 25, cloud: 90 }]),    // snow, gale
  ];
  const joint = daily(memberDays(ensembleOf(jointSpec), { elevation: 1420, anchor: 1420 }))[0];
  ok(near(joint.events.powder, 1, 1e-9), 'every member can deliver the snow');
  ok(near(joint.events.storm, 0.5, 1e-9), 'while half of them blow it away');
  const bothInSame = memberDays(ensembleOf(jointSpec), { elevation: 1420, anchor: 1420 })
    .filter((r) => r.date === joint.date && r.snow >= 10 && r.windMax >= 20).length;
  ok(bothInSame === 5, 'and the pairing survives per member — which marginals could not tell you', `${bothInSame}`);

  /* elevation moves the snow line, and nothing else has to change */
  /* Freezing at the summit, well above it at the valley once the lapse rate
     has been applied — the same precipitation, two different surfaces. */
  const mild = [...Array(6).fill([{ temp: 0, mmPerHour: 0.6, wind: 5, cloud: 90 }])];
  const atSummit = daily(memberDays(ensembleOf(mild), { elevation: 1420, anchor: 1420 }))[0];
  const atValley = daily(memberDays(ensembleOf(mild), { elevation: 400, anchor: 1420 }))[0];
  ok(atSummit.events.rain === 0 && atValley.events.rain === 1, 'the valley takes rain where the summit takes snow',
    `${pct(atSummit.events.rain)} vs ${pct(atValley.events.rain)}`);
  ok(atSummit.events.powder > atValley.events.powder, 'and only the summit banks it as new snow');
  ok(atValley.tmax.p50 > atSummit.tmax.p50, 'and the valley is warmer for it');

  /* an unavailable variable is unanswerable, not zero */
  const noCloud = ensembleOf([[{ temp: -6, mmPerHour: 0, wind: 3, cloud: null }]]);
  const blind = daily(memberDays(noCloud, { elevation: 1420, anchor: 1420 }))[0];
  ok(blind.events.bluebird === null, 'an event needing a missing variable says so rather than saying never');
  ok(blind.events.storm === 0, 'while the events that can be answered still are');

  /* calibration is applied when offered and flagged when it is */
  const calibrated = daily(rows, { calibrate: () => 0.42 })[0];
  ok(near(calibrated.pop, 0.42, 1e-9) && calibrated.popCalibrated, 'a calibrated probability replaces the raw fraction');
  const declined = daily(rows, { calibrate: () => null })[0];
  ok(declined.pop === declined.wetFrac && !declined.popCalibrated, 'and a declined one leaves the count alone, marked raw');

  /* shapes for the chart come from the same rows as the counts */
  const traj = trajectories(rows, 'tmax');
  ok(traj.lines.length === 10 && traj.dates.length === 4, 'a trajectory per member across every day');
  ok(traj.lines.every((l) => l.values.length === traj.dates.length), 'each one as long as the period');
  const band = fan(rows, 'tmax');
  ok(band.length === 4 && band.every((b) => b.q[0.1] <= b.q[0.5] && b.q[0.5] <= b.q[0.9]), 'the fan quantiles are ordered');

  ok(memberSeries(ensembleOf(spec).hourly, 'temperature_2m').length === 10, 'members are found by name');
  ok(memberSeries(null, 'temperature_2m').length === 0, 'and nothing is found in nothing');
  ok(memberDays(null, { elevation: 1000 }).length === 0, 'no ensemble, no member days');
  ok(daily([]).length === 0, 'and no rows, no days');

  ok(agreement(1) === 'tight' && agreement(20) === 'loose' && agreement(5) === 'fair', 'agreement is graded from the spread');
  ok(agreement(NaN) === null, 'and withheld without a spread');

  const top = headline(days);
  ok(top && top.event.id === 'powder', 'the headline picks the strongest event in the period', top?.event?.id);
  ok(headline(days, { floor: 0.99 }) === null, 'and says nothing when nothing clears the floor');

  ok(OUTLOOK.events.every((e) => typeof e.test === 'function' && e.id && e.kind), 'every configured event is well formed');
  ok(OUTLOOK.bands.includes(OUTLOOK.defaultBand), 'the default band is one of the bands');
}

console.log(`\n${failures ? `${failures} FAILED` : 'all checks passed'}\n`);
process.exit(failures ? 1 : 0);
