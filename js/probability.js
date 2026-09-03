/* Probabilities, counted rather than inferred.
 *
 * The rest of the site answers "what will it be?". This module answers "how
 * often, out of everything that could happen?" — which for anyone deciding
 * whether to drive four hours is the more useful question.
 *
 * The method is member counting. An ensemble is thirty-odd complete, internally
 * consistent forecasts, each one a whole possible week. Reducing them to p10,
 * p50 and p90 per variable throws away exactly the thing that makes them worth
 * having: whether the *same* run that gives you 20 cm also gives you the wind
 * that strips it. So each member is carried through to its own daily totals,
 * and an event probability is the share of members whose own day satisfies it.
 * Three of thirty is 10 %, and it means three specific futures, not a number
 * squeezed out of a spread.
 *
 * Two honest limits, stated here because they bound everything below.
 *
 * An ensemble is not a probability distribution over reality. It is a sample of
 * one modelling system's uncertainty, and it is systematically overconfident —
 * the truth falls outside the members more often than the member count implies,
 * especially for precipitation and beyond about day five. Where the site has a
 * measured calibration for an event, it is applied and labelled; where it has
 * none, the raw member frequency is shown as what it is.
 *
 * And the members arrive at one elevation. Moving them to another band applies
 * the same lapse rate the forecast uses and re-decides rain against snow at
 * that height, which is the dominant effect and not the only one.
 */

import { OUTLOOK, PHYS } from './config.js';
import { snowRatio } from './physics.js';
import { quantile, mean, parseLocal } from './util.js';

/* ---------- shaping ---------- */

/** Every member series for one variable, or [] when the run did not carry it. */
export function memberSeries(hourly, name) {
  if (!hourly) return [];
  const re = new RegExp(`^${name}_member\\d+$`);
  const keys = Object.keys(hourly).filter((k) => re.test(k));
  /* member01, member02 … sort as strings, but a run with a hundred members
     would not, so sort on the number itself */
  keys.sort((a, b) => Number(a.match(/(\d+)$/)[1]) - Number(b.match(/(\d+)$/)[1]));
  return keys.map((k) => hourly[k]);
}

const localDate = (iso) => iso.slice(0, 10);
const hourOf = (iso) => Number(iso.slice(11, 13));

/**
 * Turn an ensemble response into one record per (member, day) at one elevation.
 *
 * Temperatures are lapsed from the run's own anchor height to the band, and the
 * precipitation phase is then decided again at that height — a member's own
 * snowfall figure belongs to the elevation it was produced at, so reusing it
 * directly would put the snow line in the wrong place on every other band.
 */
export function memberDays(ensemble, { elevation, anchor, lapse = PHYS.fallbackLapse } = {}) {
  const hourly = ensemble?.hourly;
  const times = hourly?.time;
  if (!times?.length) return [];

  const temp = memberSeries(hourly, 'temperature_2m');
  if (!temp.length) return [];
  const precip = memberSeries(hourly, 'precipitation');
  const wind = memberSeries(hourly, 'wind_speed_10m');
  const cloud = memberSeries(hourly, 'cloud_cover');

  const anchorZ = Number.isFinite(anchor) ? anchor
    : (Number.isFinite(ensemble.elevation) ? ensemble.elevation : NaN);
  const drop = Number.isFinite(anchorZ) && Number.isFinite(elevation)
    ? ((elevation - anchorZ) / 100) * lapse
    : 0;

  const out = [];
  for (let m = 0; m < temp.length; m++) {
    const byDay = new Map();
    for (let i = 0; i < times.length; i++) {
      const t = temp[m]?.[i];
      if (!Number.isFinite(t)) continue;
      const tz = t - drop;
      const date = localDate(times[i]);
      const hour = hourOf(times[i]);
      if (!byDay.has(date)) {
        byDay.set(date, {
          member: m, date, hours: 0,
          tmin: Infinity, tmax: -Infinity, temps: [],
          precip: 0, snow: 0, rain: 0,
          windMax: 0, winds: [], clouds: [],
        });
      }
      const d = byDay.get(date);
      d.hours++;
      d.temps.push(tz);
      if (tz < d.tmin) d.tmin = tz;
      if (tz > d.tmax) d.tmax = tz;

      const mm = Math.max(0, precip[m]?.[i] ?? 0);
      d.precip += mm;
      /* No per-member humidity, so phase falls back to air temperature at the
         band. The wet-bulb threshold the rest of the site uses needs a humidity
         the ensemble does not carry, and inventing one would be worse. */
      if (mm > 0) {
        if (tz <= PHYS.snowBelow) d.snow += (mm * snowRatio(tz)) / 10;
        else if (tz >= PHYS.rainAbove) d.rain += mm;
        else {
          /* in the sleet band, split it rather than pretending it is one or the other */
          const f = (tz - PHYS.snowBelow) / (PHYS.rainAbove - PHYS.snowBelow);
          d.snow += ((mm * (1 - f)) * snowRatio(tz)) / 10;
          d.rain += mm * f;
        }
      }

      const w = wind[m]?.[i];
      if (Number.isFinite(w)) { d.winds.push(w); if (w > d.windMax) d.windMax = w; }
      const c = cloud[m]?.[i];
      if (Number.isFinite(c) && hour >= OUTLOOK.day.from && hour <= OUTLOOK.day.to) d.clouds.push(c);
    }

    for (const d of byDay.values()) {
      /* A day the run only half covers cannot carry a daily total. */
      if (d.hours < 18) continue;
      out.push({
        ...d,
        tmean: mean(d.temps),
        windMean: d.winds.length ? mean(d.winds) : NaN,
        cloudDay: d.clouds.length ? mean(d.clouds) : NaN,
        wetHours: 0,
      });
    }
  }
  return out;
}

/* ---------- per-day summaries ---------- */

const pick = (rows, key) => rows.map((r) => r[key]).filter(Number.isFinite);

/**
 * One summary per day: the distribution of every variable, and the share of
 * members satisfying each event.
 *
 * `calibrate` is given the raw wet-member fraction and may return a corrected
 * probability; when it returns nothing the raw fraction stands and the day is
 * marked as uncalibrated, so the page never implies a skill it has not measured.
 */
export function daily(rows, { events = OUTLOOK.events, calibrate = null } = {}) {
  const byDate = new Map();
  for (const r of rows) {
    if (!byDate.has(r.date)) byDate.set(r.date, []);
    byDate.get(r.date).push(r);
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, day]) => {
      const t = pick(day, 'tmax');
      const tn = pick(day, 'tmin');
      const w = pick(day, 'windMax');
      const s = pick(day, 'snow');
      const p = pick(day, 'precip');
      const c = pick(day, 'cloudDay');
      const wetFrac = p.length ? p.filter((v) => v >= OUTLOOK.wetHour).length / p.length : NaN;
      const calibrated = calibrate ? calibrate({
        date, wetFrac, ensP: p.length ? mean(p) : NaN, cloud: c.length ? mean(c) : NaN,
      }) : null;

      return {
        date,
        when: parseLocal(`${date}T12:00`),
        members: day.length,
        tmax: { p10: quantile(t, 0.1), p50: quantile(t, 0.5), p90: quantile(t, 0.9) },
        tmin: { p10: quantile(tn, 0.1), p50: quantile(tn, 0.5), p90: quantile(tn, 0.9) },
        wind: { p50: quantile(w, 0.5), p90: quantile(w, 0.9) },
        snow: { p50: quantile(s, 0.5), p90: quantile(s, 0.9), mean: s.length ? mean(s) : NaN },
        precip: { p50: quantile(p, 0.5), p90: quantile(p, 0.9) },
        cloud: c.length ? mean(c) : NaN,
        wetFrac,
        pop: Number.isFinite(calibrated) ? calibrated : wetFrac,
        popCalibrated: Number.isFinite(calibrated),
        spread: Number.isFinite(quantile(t, 0.9)) ? quantile(t, 0.9) - quantile(t, 0.1) : NaN,
        events: Object.fromEntries(events.map((e) => [e.id, probabilityOf(day, e)])),
      };
    });
}

/**
 * The share of members whose own day satisfies an event.
 * An event that needs a variable the run did not carry returns null rather than
 * a zero, because "never" and "cannot say" are different answers.
 */
export function probabilityOf(day, event) {
  const usable = event.needs === 'cloud' ? day.filter((d) => Number.isFinite(d.cloudDay)) : day;
  if (!usable.length) return null;
  return usable.filter((d) => event.test(d)).length / usable.length;
}

/** How tightly the members agree about a day, as a word the page can use. */
export function agreement(spread) {
  if (!Number.isFinite(spread)) return null;
  if (spread <= OUTLOOK.agreement.tight) return 'tight';
  if (spread >= OUTLOOK.agreement.loose) return 'loose';
  return 'fair';
}

/**
 * Members as trajectories for the fan chart: one row per member, one value per
 * day, so the spaghetti drawn on screen is the same data the counts came from.
 */
export function trajectories(rows, metric = 'tmax') {
  const dates = [...new Set(rows.map((r) => r.date))].sort();
  const byMember = new Map();
  for (const r of rows) {
    if (!byMember.has(r.member)) byMember.set(r.member, new Map());
    byMember.get(r.member).set(r.date, r[metric]);
  }
  return {
    dates,
    lines: [...byMember.entries()]
      .sort(([a], [b]) => a - b)
      .map(([member, byDate]) => ({ member, values: dates.map((d) => byDate.get(d) ?? NaN) })),
  };
}

/** Quantile bands across the period, for the shaded fan behind the spaghetti. */
export function fan(rows, metric = 'tmax', qs = [0.1, 0.25, 0.5, 0.75, 0.9]) {
  const { dates } = trajectories(rows, metric);
  return dates.map((date) => {
    const vals = rows.filter((r) => r.date === date).map((r) => r[metric]).filter(Number.isFinite);
    return { date, q: Object.fromEntries(qs.map((q) => [q, quantile(vals, q)])), n: vals.length };
  });
}

/**
 * The one line a reader wants: the most likely thing about the period.
 * Picks the strongest event across all days, ignoring anything under a fifth,
 * so a week with nothing in it says nothing rather than reaching.
 */
export function headline(days, { events = OUTLOOK.events, floor = 0.2 } = {}) {
  let best = null;
  for (const day of days) {
    for (const e of events) {
      const p = day.events[e.id];
      if (!Number.isFinite(p) || p < floor) continue;
      if (!best || p > best.p) best = { event: e, p, day };
    }
  }
  return best;
}
