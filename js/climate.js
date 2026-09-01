/* Climatology: is this normal, and when should I come?
 *
 * A visitor from Hamburg has no baseline. "−12 °C and 18 m/s" is a number;
 * "colder than nine Marches in ten" is a decision. Thirty years of ERA5 daily
 * data per peak, reduced to a day-of-year distribution, answers both that and
 * the question people ask before they book — what is this place normally like
 * in week nine.
 *
 * The raw archive is summarised once and discarded: what gets cached is 366
 * days of statistics, a few kilobytes, not a decade of numbers.
 */

import { mean, quantile, parseLocal } from './util.js';

/** Day of year, 1–366, from a "YYYY-MM-DD" string. */
export function dayOfYear(iso) {
  const d = parseLocal(iso);
  if (!d) return NaN;
  return Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 864e5);
}

const FIELDS = [
  ['tmax', 'temperature_2m_max'],
  ['tmin', 'temperature_2m_min'],
  ['precip', 'precipitation_sum'],
  ['snow', 'snowfall_sum'],
  ['wind', 'wind_speed_10m_max'],
];

/**
 * Reduce the archive to one distribution per day of the year.
 *
 * Each day pools a ±`window`-day band around it across every year, so a single
 * freak 3 March does not become the climate of 3 March. That is the same
 * smoothing a published climate normal uses, for the same reason.
 */
export function summarise(raw, { window = 5 } = {}) {
  const daily = raw?.daily;
  if (!daily?.time?.length) return null;

  const buckets = Array.from({ length: 367 }, () => ({ tmax: [], tmin: [], precip: [], snow: [], wind: [] }));
  const years = new Set();

  for (let i = 0; i < daily.time.length; i++) {
    const doy = dayOfYear(daily.time[i]);
    if (!Number.isFinite(doy)) continue;
    years.add(daily.time[i].slice(0, 4));
    for (let offset = -window; offset <= window; offset++) {
      const slot = ((doy + offset - 1 + 366) % 366) + 1;
      for (const [key, field] of FIELDS) {
        const v = daily[field]?.[i];
        if (Number.isFinite(v)) buckets[slot][key].push(v);
      }
    }
  }

  const days = buckets.map((b, doy) => {
    if (!b.tmax.length) return null;
    return {
      doy,
      n: b.tmax.length,
      tmaxP10: quantile(b.tmax, 0.1),
      tmaxP50: quantile(b.tmax, 0.5),
      tmaxP90: quantile(b.tmax, 0.9),
      tminP10: quantile(b.tmin, 0.1),
      tminP50: quantile(b.tmin, 0.5),
      windP50: quantile(b.wind, 0.5),
      windP90: quantile(b.wind, 0.9),
      precipMean: mean(b.precip),
      snowMean: mean(b.snow),
      /** share of days in the band with measurable precipitation */
      wetShare: b.precip.length ? b.precip.filter((v) => v >= 1).length / b.precip.length : NaN,
      snowShare: b.snow.length ? b.snow.filter((v) => v >= 1).length / b.snow.length : NaN,
      samples: { tmax: b.tmax, wind: b.wind, precip: b.precip },
    };
  });

  return {
    years: years.size,
    from: raw.daily.time[0],
    to: raw.daily.time[raw.daily.time.length - 1],
    /** the heavy per-day sample arrays are only needed for percentile lookups */
    days: days.map((d) => (d ? { ...d, samples: undefined } : null)),
    percentiles: days.map((d) => (d ? d.samples : null)),
  };
}

/** Where a value sits in a sample, 0–1. */
export function percentileOf(value, samples) {
  if (!Number.isFinite(value) || !samples?.length) return NaN;
  let below = 0;
  for (const s of samples) if (s < value) below++;
  return below / samples.length;
}

const ORDINAL = (p) => Math.round(p * 100);

/**
 * How today compares with the same date across the archive.
 * Returns nulls rather than guesses when the archive did not cover the day.
 */
export function contextFor(climate, { date, tmax, wind, precip }) {
  if (!climate?.percentiles) return null;
  const doy = dayOfYear(date);
  const samples = climate.percentiles[doy];
  const norm = climate.days[doy];
  if (!samples || !norm) return null;

  const tempP = percentileOf(tmax, samples.tmax);
  const windP = percentileOf(wind, samples.wind);
  return {
    doy,
    norm,
    years: climate.years,
    temp: Number.isFinite(tempP) ? { value: tmax, percentile: tempP, pct: ORDINAL(tempP), normal: norm.tmaxP50, anomaly: tmax - norm.tmaxP50 } : null,
    wind: Number.isFinite(windP) ? { value: wind, percentile: windP, pct: ORDINAL(windP), normal: norm.windP50 } : null,
    precip: Number.isFinite(precip) ? { value: precip, normal: norm.precipMean, wetShare: norm.wetShare } : null,
  };
}

/**
 * A verdict word for how unusual a day is. Deliberately conservative: the
 * middle 60 % of a distribution is simply "normal", because it is.
 */
export function unusualness(percentile) {
  if (!Number.isFinite(percentile)) return null;
  if (percentile >= 0.95) return 'far-above';
  if (percentile >= 0.8) return 'above';
  if (percentile <= 0.05) return 'far-below';
  if (percentile <= 0.2) return 'below';
  return 'normal';
}

/** 52 weekly means, for the year-at-a-glance strip. */
export function weekly(climate) {
  if (!climate?.days) return [];
  const weeks = [];
  for (let w = 0; w < 52; w++) {
    const slice = [];
    for (let d = w * 7 + 1; d <= w * 7 + 7; d++) {
      const day = climate.days[d];
      if (day) slice.push(day);
    }
    if (!slice.length) { weeks.push(null); continue; }
    weeks.push({
      week: w + 1,
      doy: w * 7 + 4,
      tmax: mean(slice.map((d) => d.tmaxP50)),
      tmin: mean(slice.map((d) => d.tminP50)),
      tmaxP90: mean(slice.map((d) => d.tmaxP90)),
      tminP10: mean(slice.map((d) => d.tminP10)),
      wind: mean(slice.map((d) => d.windP50)),
      precip: mean(slice.map((d) => d.precipMean)) * 7,
      snow: mean(slice.map((d) => d.snowMean)) * 7,
      wetShare: mean(slice.map((d) => d.wetShare)),
      snowShare: mean(slice.map((d) => d.snowShare)),
    });
  }
  return weeks;
}
