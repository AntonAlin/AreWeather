/* Offline self-test for the forecast pipeline.

   The app has no build step and no network access in CI, so this harness feeds
   synthetic Open-Meteo-shaped payloads through the real physics, ML and
   assembly code and asserts the results make physical sense.

   Run: node tools/selftest.mjs */

import { MODELS, PRESSURE_LEVELS } from '../js/config.js';
import { assemble, bandsFor, scoreTrail, scoreSkimo } from '../js/forecast.js';
import { train, correctTemperature, modelWeights } from '../js/ml.js';
import { wetBulb, dewPoint, windChill, snowRatio, buildSounding, temperatureAt } from '../js/physics.js';

let failures = 0;
const ok = (cond, msg, detail = '') => {
  if (cond) console.log(`  ✓ ${msg}`);
  else { failures++; console.log(`  ✗ ${msg} ${detail}`); }
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

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

const MTN = { id: 'test', name: 'Testfjället', lat: 63.4, lon: 13.06, summit: 1420, base: 400, exposure: 1.3, tags: ['Trail running'] };

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
  ok(h.trail.score >= 0 && h.trail.score <= 100 && h.skimo.score >= 0 && h.skimo.score <= 100, 'activity scores are in range');
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

/* ---------- 7. degraded inputs ---------- */
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

  const scoreless = { summit: { temp: NaN, feels: NaN, wind: NaN, gust: NaN, precip: NaN, rain: NaN, phase: 'unknown', z: 1420 }, daylight: true, time: new Date(), newSnow24: 0, drift: 0, cloud: 0, freezingLevel: NaN };
  ok(Number.isFinite(scoreTrail(scoreless).score) && Number.isFinite(scoreSkimo(scoreless).score), 'scoring survives an all-NaN hour');
}

console.log(`\n${failures ? `${failures} FAILED` : 'all checks passed'}\n`);
process.exit(failures ? 1 : 0);
