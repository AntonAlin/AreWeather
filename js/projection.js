/* How long does winter have left?
 *
 * This module turns daily climate-model output into the handful of numbers a
 * skier or a runner actually asks about: how many days the mountain is frozen,
 * how many midwinter days now thaw, how many nights are still cold enough to
 * make snow, and how long a snowpack deep enough to ski on lasts.
 *
 * Three things are worth being clear about before reading any of it.
 *
 * First, resolution. The models here are 20-50 km globally, downscaled to
 * 10 km. That cannot resolve one peak from another anywhere in the Åre massif,
 * so everything is read at a single point and elevation is applied afterwards
 * with the same lapse rate the forecast uses. The honest unit of analysis is
 * "the massif at height z", not "Ottfjället".
 *
 * Second, the snowpack. The climate API carries snowfall but not snow depth, so
 * anything about a season length or a 30 cm cover comes from a degree-day model
 * written here — accumulate what falls as snow, melt it back at a fixed rate per
 * degree above freezing. It is the simplest thing that works, and it is the
 * weakest link on the page: no wind redistribution, no snowmaking, no rain
 * percolating and refreezing, no shading by aspect. Numbers derived from it are
 * kept separate from numbers that come straight out of the models, and the page
 * labels which is which.
 *
 * Third, the scenario. HighResMIP's future runs are forced by SSP5-8.5, a
 * high-emissions pathway, and that is the only scenario available here. Out to
 * 2050 the pathways barely separate — the emissions already committed dominate
 * that far ahead — so this is a defensible read of the next twenty-five years.
 * It would not be for 2090, which is exactly why nothing here is extrapolated
 * past the end of the data.
 */

import { WARMING, PHYS } from './config.js';
import { wetBulb, snowRatio } from './physics.js';
import { mean, quantile } from './util.js';

/** Water equivalent (mm) that counts as a skiable cover at the settled density. */
export const reliableWaterEquivalent = () => (WARMING.reliableDepth / 100) * WARMING.packDensity;

/** Depth in cm from water equivalent in mm, at the settled density. */
export const depthFromWater = (mm) => (mm / WARMING.packDensity) * 100;

const monthOf = (iso) => Number(iso.slice(5, 7));
const yearOf = (iso) => Number(iso.slice(0, 4));

/** The winter a date belongs to, labelled by the year it starts in. */
export function winterYear(iso) {
  return monthOf(iso) >= WARMING.yearStartMonth ? yearOf(iso) : yearOf(iso) - 1;
}

/** Is this month inside a window that may wrap around new year? */
function inWindow(month, { fromMonth, toMonth }) {
  return fromMonth <= toMonth
    ? month >= fromMonth && month <= toMonth
    : month >= fromMonth || month <= toMonth;
}

/* ---------- shaping the response ---------- */

/**
 * Pull one model's daily series out of a climate-API response.
 * Multi-model requests suffix every variable with the model key; single-model
 * ones do not, so both shapes are accepted.
 */
export function extract(raw, modelKey) {
  const daily = raw?.daily;
  if (!daily?.time?.length) return null;
  const pick = (name) => daily[modelKey ? `${name}_${modelKey}` : name] ?? daily[name] ?? null;
  const tmax = pick('temperature_2m_max');
  const tmin = pick('temperature_2m_min');
  if (!tmax || !tmin) return null;
  return {
    elevation: Number.isFinite(raw.elevation) ? raw.elevation : NaN,
    time: daily.time,
    tmax,
    tmin,
    precip: pick('precipitation_sum') ?? daily.time.map(() => 0),
    rh: pick('relative_humidity_2m_mean') ?? daily.time.map(() => 85),
  };
}

/* ---------- the winter, one year at a time ---------- */

/**
 * Reduce a daily series to one record per winter, at one elevation.
 *
 * Temperatures are lapsed from the model's own grid elevation to the band, and
 * the precipitation phase is then re-decided at that height from the wet-bulb
 * temperature — the model's own snowfall figure is only valid at its own
 * elevation, so using it directly would put the snow line in the wrong place.
 */
export function winters(series, elevation, { lapse = PHYS.fallbackLapse } = {}) {
  if (!series?.time?.length) return [];
  const drop = Number.isFinite(series.elevation) ? ((elevation - series.elevation) / 100) * lapse : 0;
  const out = new Map();

  /* snowpack state, carried across the year boundary */
  let pack = 0;
  const reliable = reliableWaterEquivalent();

  for (let i = 0; i < series.time.length; i++) {
    const iso = series.time[i];
    const month = monthOf(iso);
    const tmax = series.tmax[i] - drop;
    const tmin = series.tmin[i] - drop;
    if (!Number.isFinite(tmax) || !Number.isFinite(tmin)) continue;
    const tmean = (tmax + tmin) / 2;
    const rh = series.rh[i];
    const precip = Math.max(0, series.precip[i] ?? 0);

    const wy = winterYear(iso);
    if (!out.has(wy)) {
      out.set(wy, {
        winter: wy, days: 0, freezeDays: 0, thawDays: 0, snowmakingNights: 0,
        snowfall: 0, snowWater: 0, precip: 0, coverDays: 0,
        firstCover: null, lastCover: null, maxDepth: 0, tmeanWinter: [],
      });
    }
    const w = out.get(wy);
    w.days++;
    w.precip += precip;

    if (tmean < 0) w.freezeDays++;
    if (inWindow(month, WARMING.coreWinter)) {
      w.tmeanWinter.push(tmean);
      if (tmax > WARMING.thawAbove) w.thawDays++;
    }
    /* Guns run at night, so the cold end of the day is the one that matters. */
    if (inWindow(month, WARMING.makingSeason) && wetBulb(tmin, rh) <= WARMING.snowmakingWetBulb) {
      w.snowmakingNights++;
    }

    /* phase, then the degree-day pack */
    const tw = wetBulb(tmean, rh);
    const isSnow = Number.isFinite(tw) ? tw <= PHYS.snowBelow : tmean <= 0;
    if (isSnow && precip > 0) {
      pack += precip;
      w.snowWater += precip;
      w.snowfall += precip * snowRatio(tmean) / 10;   // mm water → cm of new snow
    }
    const melt = Math.max(0, tmean) * WARMING.meltFactor;
    pack = Math.max(0, pack - melt);

    const depth = depthFromWater(pack);
    if (depth > w.maxDepth) w.maxDepth = depth;
    if (pack >= reliable) {
      w.coverDays++;
      if (!w.firstCover) w.firstCover = iso;
      w.lastCover = iso;
    }
  }

  return [...out.values()]
    /* The first and last winters in a series are half-winters — the record
       starts in January and ends in December — and reporting them beside full
       ones would drag every average down. 240 days clears those (they run to
       about 181) while still tolerating a series with weeks of gaps in it. */
    .filter((w) => w.days >= 240)
    .map((w) => ({
      ...w,
      tmeanWinter: w.tmeanWinter.length ? mean(w.tmeanWinter) : NaN,
      snowShare: w.precip > 0 ? w.snowWater / w.precip : NaN,
      reliable: w.coverDays >= WARMING.reliableDays,
    }))
    .sort((a, b) => a.winter - b.winter);
}

/* ---------- across models ---------- */

const METRICS = ['coverDays', 'freezeDays', 'thawDays', 'snowmakingNights', 'snowfall', 'snowShare', 'tmeanWinter', 'maxDepth'];

/**
 * Combine several models into one series: the median, and the spread across
 * models. The spread is the honest headline — a single model's line implies a
 * precision that seven disagreeing models do not have.
 */
export function ensemble(perModel) {
  const runs = perModel.filter((r) => r?.length);
  if (!runs.length) return [];
  const years = [...new Set(runs.flat().map((w) => w.winter))].sort((a, b) => a - b);
  return years.map((winter) => {
    const row = { winter, n: 0 };
    const found = runs.map((r) => r.find((w) => w.winter === winter)).filter(Boolean);
    row.n = found.length;
    for (const m of METRICS) {
      const vals = found.map((w) => w[m]).filter(Number.isFinite);
      row[m] = vals.length ? quantile(vals, 0.5) : NaN;
      row[`${m}Lo`] = vals.length ? Math.min(...vals) : NaN;
      row[`${m}Hi`] = vals.length ? Math.max(...vals) : NaN;
    }
    return row;
  });
}

/** Centred running mean, to see the trend through the year-to-year noise. */
export function smooth(rows, metric, window = 15) {
  const half = Math.floor(window / 2);
  return rows.map((row, i) => {
    const slice = rows.slice(Math.max(0, i - half), i + half + 1).map((r) => r[metric]).filter(Number.isFinite);
    return { winter: row.winter, value: slice.length >= half ? mean(slice) : NaN };
  });
}

/** Average a metric over one of the named periods. */
export function overPeriod(rows, metric, period) {
  const vals = rows.filter((r) => r.winter >= period.from && r.winter <= period.to)
    .map((r) => r[metric]).filter(Number.isFinite);
  return vals.length ? mean(vals) : NaN;
}

/** Ordinary least squares slope per decade, and the total change over the span. */
export function trend(rows, metric) {
  const pts = rows.filter((r) => Number.isFinite(r[metric])).map((r) => [r.winter, r[metric]]);
  if (pts.length < 10) return null;
  const mx = mean(pts.map((p) => p[0]));
  const my = mean(pts.map((p) => p[1]));
  let num = 0, den = 0;
  for (const [x, y] of pts) { num += (x - mx) * (y - my); den += (x - mx) ** 2; }
  if (!den) return null;
  const slope = num / den;
  return {
    perDecade: slope * 10,
    from: pts[0][0],
    to: pts[pts.length - 1][0],
    total: slope * (pts[pts.length - 1][0] - pts[0][0]),
  };
}

/**
 * The elevation staircase: every band, every period, one metric.
 * This is the shape of the whole answer — the village and the summit are not on
 * the same timetable, and a single number for "Åre" hides that completely.
 */
export function staircase(perModelByBand, metric) {
  return WARMING.bands.map((z) => {
    const rows = perModelByBand.get(z) ?? [];
    return {
      z,
      periods: WARMING.periods.map((p) => ({ id: p.id, ...p, value: overPeriod(rows, metric, p) })),
      rows,
    };
  });
}

/**
 * The last band that still clears the snow-reliability test in a given period —
 * the height the answer to "is there still a winter here" flips at.
 */
export function reliabilityLine(bands, period) {
  const passing = bands.filter((b) => {
    const p = b.periods.find((x) => x.id === period);
    return p && Number.isFinite(p.value) && p.value >= WARMING.reliableDays;
  });
  if (!passing.length) return { z: null, all: false };
  const lowest = Math.min(...passing.map((b) => b.z));
  return { z: lowest, all: lowest <= bands[0].z };
}

/**
 * How much of the winter is left, as a sentence's worth of numbers.
 * `lost` is deliberately expressed as a share of the present-day season rather
 * than as an absolute, because "three weeks" means something different at the
 * village than at the summit.
 */
export function verdict(bands, metric = 'coverDays') {
  return bands.map((b) => {
    const present = b.periods.find((p) => p.id === 'present')?.value;
    const future = b.periods.find((p) => p.id === 'future')?.value;
    const past = b.periods.find((p) => p.id === 'past')?.value;
    const lost = Number.isFinite(present) && Number.isFinite(future) ? future - present : NaN;
    return {
      z: b.z,
      past, present, future,
      lost,
      share: Number.isFinite(lost) && present > 0 ? lost / present : NaN,
      reliableNow: Number.isFinite(present) && present >= WARMING.reliableDays,
      reliableLater: Number.isFinite(future) && future >= WARMING.reliableDays,
    };
  });
}
