/* Mountain meteorology.

   The point of this module is that nothing here uses a fixed lapse rate as a
   first resort. Where a model sounding exists we interpolate the real vertical
   structure — which is how you catch a valley inversion where the summit is
   +2 °C while the village sits at -8 °C, a situation a constant 0.65 °C/100 m
   gets backwards by ten degrees. */

import { PHYS } from './config.js';
import { clamp, lerp, mean } from './util.js';

/* ---------- thermodynamics ---------- */

/** Magnus-Tetens dew point. */
export function dewPoint(t, rh) {
  if (!Number.isFinite(t) || !Number.isFinite(rh)) return NaN;
  const r = clamp(rh, 1, 100);
  const g = Math.log(r / 100) + (17.625 * t) / (243.04 + t);
  return (243.04 * g) / (17.625 - g);
}

/** Relative humidity implied by a temperature/dew point pair. */
export function humidityFrom(t, td) {
  if (!Number.isFinite(t) || !Number.isFinite(td)) return NaN;
  const e = Math.exp((17.625 * td) / (243.04 + td));
  const es = Math.exp((17.625 * t) / (243.04 + t));
  return clamp((e / es) * 100, 1, 100);
}

/** Stull (2011) wet-bulb temperature — the variable that actually decides
 *  whether precipitation reaches you as snow or rain. */
export function wetBulb(t, rh) {
  if (!Number.isFinite(t) || !Number.isFinite(rh)) return NaN;
  const r = clamp(rh, 5, 100);
  return t * Math.atan(0.151977 * Math.sqrt(r + 8.313659))
    + Math.atan(t + r) - Math.atan(r - 1.676331)
    + 0.00391838 * r ** 1.5 * Math.atan(0.023101 * r)
    - 4.686035;
}

/** Environment Canada wind chill, in °C. Only defined for cold and windy. */
export function windChill(t, ms) {
  if (!Number.isFinite(t) || !Number.isFinite(ms)) return NaN;
  const kmh = ms * 3.6;
  if (t > 10 || kmh < 4.8) return t;
  const p = kmh ** 0.16;
  return 13.12 + 0.6215 * t - 11.37 * p + 0.3965 * t * p;
}

/** Humidex — the summer half of "feels like" for a runner. */
export function humidex(t, rh) {
  if (!Number.isFinite(t) || !Number.isFinite(rh)) return NaN;
  const td = dewPoint(t, rh);
  const e = 6.11 * Math.exp(5417.753 * (1 / 273.16 - 1 / (273.15 + td)));
  return t + 0.5555 * (e - 10);
}

/** One "feels like" number that switches regime at 10 °C. */
export function feelsLike(t, rh, ms) {
  if (!Number.isFinite(t)) return NaN;
  if (t <= 10) return windChill(t, ms);
  const h = humidex(t, rh);
  // Even in summer, 12 m/s on a ridge is worth a couple of degrees.
  return (Number.isFinite(h) ? Math.max(t, h) : t) - clamp((ms - 3) * 0.25, 0, 4);
}

/** Espy's rule: cloud base above the level the parcel starts from, in metres. */
export const lclHeight = (t, td) => (Number.isFinite(t) && Number.isFinite(td) ? Math.max(0, 125 * (t - td)) : NaN);

/** Fresh snow depth per millimetre of water, by temperature.
 *  Warm snow packs wet and dense; -12 °C is the classic cold-smoke peak. */
export function snowRatio(t) {
  if (!Number.isFinite(t)) return 10;
  if (t > 1) return 6;
  if (t > -1) return 8;
  if (t > -4) return 11;
  if (t > -8) return 14;
  if (t > -14) return 16;
  if (t > -20) return 13;
  return 10;
}

/** Precipitation phase from wet-bulb temperature. */
export function phase(tw) {
  if (!Number.isFinite(tw)) return 'unknown';
  if (tw <= PHYS.snowBelow) return 'snow';
  if (tw >= PHYS.rainAbove) return 'rain';
  return 'mix';
}

/* ---------- soundings ---------- */

/** Wind direction/speed → vector components (u eastward, v northward). */
export function toUV(speed, dirFrom) {
  if (!Number.isFinite(speed) || !Number.isFinite(dirFrom)) return { u: NaN, v: NaN };
  const r = (dirFrom * Math.PI) / 180;
  return { u: -speed * Math.sin(r), v: -speed * Math.cos(r) };
}
export function fromUV(u, v) {
  if (!Number.isFinite(u) || !Number.isFinite(v)) return { speed: NaN, dir: NaN };
  return { speed: Math.hypot(u, v), dir: ((Math.atan2(-u, -v) * 180) / Math.PI + 360) % 360 };
}

/**
 * Build one sounding (array of levels sorted by height) for a single hour,
 * averaging whichever profile models answered.
 * @returns {{z:number,t:number,rh:number,u:number,v:number,p:number}[]}
 */
export function buildSounding(profileHourly, models, levels, i) {
  const out = [];
  for (const p of levels) {
    const zs = [], ts = [], rhs = [], us = [], vs = [];
    for (const m of models) {
      const g = profileHourly[`geopotential_height_${p}hPa_${m}`] ?? profileHourly[`geopotential_height_${p}hPa`];
      const t = profileHourly[`temperature_${p}hPa_${m}`] ?? profileHourly[`temperature_${p}hPa`];
      const rh = profileHourly[`relative_humidity_${p}hPa_${m}`] ?? profileHourly[`relative_humidity_${p}hPa`];
      const ws = profileHourly[`wind_speed_${p}hPa_${m}`] ?? profileHourly[`wind_speed_${p}hPa`];
      const wd = profileHourly[`wind_direction_${p}hPa_${m}`] ?? profileHourly[`wind_direction_${p}hPa`];
      if (!g || !t) continue;
      if (!Number.isFinite(g[i]) || !Number.isFinite(t[i])) continue;
      zs.push(g[i]); ts.push(t[i]);
      if (rh && Number.isFinite(rh[i])) rhs.push(rh[i]);
      if (ws && wd && Number.isFinite(ws[i]) && Number.isFinite(wd[i])) {
        const { u, v } = toUV(ws[i], wd[i]);
        us.push(u); vs.push(v);
      }
    }
    if (!zs.length) continue;
    out.push({ p, z: mean(zs), t: mean(ts), rh: mean(rhs), u: mean(us), v: mean(vs) });
  }
  return out.sort((a, b) => a.z - b.z);
}

/** Linear interpolation in height through a sounding, with sane extrapolation. */
export function interpSounding(sounding, z, key) {
  const pts = sounding.filter((s) => Number.isFinite(s[key]) && Number.isFinite(s.z));
  if (pts.length === 0) return NaN;
  if (pts.length === 1) return pts[0][key];
  if (z <= pts[0].z) {
    const g = (pts[1][key] - pts[0][key]) / (pts[1].z - pts[0].z);
    return pts[0][key] + g * (z - pts[0].z);
  }
  const last = pts.length - 1;
  if (z >= pts[last].z) {
    const g = (pts[last][key] - pts[last - 1][key]) / (pts[last].z - pts[last - 1].z);
    return pts[last][key] + g * (z - pts[last].z);
  }
  for (let k = 1; k <= last; k++) {
    if (z <= pts[k].z) {
      const t = (z - pts[k - 1].z) / (pts[k].z - pts[k - 1].z);
      return lerp(pts[k - 1][key], pts[k][key], t);
    }
  }
  return NaN;
}

/** Environmental lapse rate across a layer, in °C per 100 m (positive = cooling up). */
export function lapseRate(sounding, z0, z1) {
  const t0 = interpSounding(sounding, z0, 't');
  const t1 = interpSounding(sounding, z1, 't');
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || z1 === z0) return NaN;
  return ((t0 - t1) / (z1 - z0)) * 100;
}

/* ---------- downscaling ---------- */

/**
 * Temperature at an arbitrary height.
 *
 * The sounding gives the shape of the atmosphere; the multi-model surface
 * ensemble gives the best estimate at the anchor height. We keep both: the
 * anchor offset is applied in full at the anchor and decays with distance so
 * that far above the mountain we trust the free atmosphere instead.
 */
export function temperatureAt(sounding, z, anchorZ, anchorT) {
  const raw = interpSounding(sounding, z, 't');
  if (!Number.isFinite(raw)) {
    // No sounding for this hour: fall back to a constant lapse rate.
    return Number.isFinite(anchorT) ? anchorT - ((z - anchorZ) / 100) * PHYS.fallbackLapse : NaN;
  }
  if (!Number.isFinite(anchorT)) return raw;
  const anchorRaw = interpSounding(sounding, anchorZ, 't');
  if (!Number.isFinite(anchorRaw)) return raw;
  const offset = anchorT - anchorRaw;
  return raw + offset * Math.exp(-Math.abs(z - anchorZ) / PHYS.anchorScale);
}

/** Humidity at height, anchored the same way but clamped to physical range. */
export function humidityAt(sounding, z, anchorZ, anchorRH) {
  const raw = interpSounding(sounding, z, 'rh');
  if (!Number.isFinite(raw)) return anchorRH;
  if (!Number.isFinite(anchorRH)) return clamp(raw, 1, 100);
  const anchorRaw = interpSounding(sounding, anchorZ, 'rh');
  if (!Number.isFinite(anchorRaw)) return clamp(raw, 1, 100);
  const offset = anchorRH - anchorRaw;
  return clamp(raw + offset * Math.exp(-Math.abs(z - anchorZ) / PHYS.anchorScale), 1, 100);
}

/**
 * Wind at height. Near the ground the surface forecast wins (it knows about
 * roughness and the boundary layer); higher up the free-atmosphere sounding
 * takes over. Then terrain exposure accelerates the flow towards the summit —
 * this is why a ridge feels twice as windy as the plateau below it.
 */
export function windAt(sounding, z, anchor, mtn) {
  const su = interpSounding(sounding, z, 'u');
  const sv = interpSounding(sounding, z, 'v');
  const { u: au, v: av } = toUV(anchor.speed, anchor.dir);
  let u = su, v = sv;
  if (Number.isFinite(au)) {
    if (!Number.isFinite(su)) { u = au; v = av; } else {
      const w = Math.exp(-Math.abs(z - anchor.z) / PHYS.windBlendScale);
      u = lerp(su, au, w); v = lerp(sv, av, w);
    }
  }
  const { speed, dir } = fromUV(u, v);
  if (!Number.isFinite(speed)) return { speed: NaN, dir: NaN, gust: NaN };
  // Exposure ramps from sheltered valley to fully exposed summit.
  const span = Math.max(1, mtn.summit - mtn.base);
  const height = clamp((z - mtn.base) / span, 0, 1.1);
  const exposure = 1 + (mtn.exposure - 1) * height ** 1.4;
  const s = speed * exposure;
  return { speed: s, dir, gust: s * clamp(anchor.gustRatio ?? 1.45, 1.15, 2.3) };
}

/**
 * Precipitation at height. Orographic enhancement is a blunt instrument but a
 * real one: forced ascent squeezes more water out of the same air the higher
 * you go, and the surface field is tied to the model's own smoothed terrain.
 */
export function precipAt(mm, z, anchorZ) {
  if (!Number.isFinite(mm) || mm <= 0) return 0;
  const factor = clamp(1 + (PHYS.orographicPerKm * (z - anchorZ)) / 1000, 0.55, 1.9);
  return mm * factor;
}

/** Height where the wet bulb crosses the rain/snow boundary, by scanning bands. */
export function snowLine(bands) {
  for (let i = bands.length - 1; i > 0; i--) {
    const hi = bands[i], lo = bands[i - 1];
    const boundary = (PHYS.snowBelow + PHYS.rainAbove) / 2;
    if (Number.isFinite(hi.wetBulb) && Number.isFinite(lo.wetBulb)
      && hi.wetBulb <= boundary && lo.wetBulb > boundary) {
      const t = (boundary - lo.wetBulb) / (hi.wetBulb - lo.wetBulb);
      return lerp(lo.z, hi.z, t);
    }
  }
  return null;
}

/**
 * Wind-loading index (0–100). Not an avalanche forecast — it is only the
 * meteorological half of the question: is there transportable snow and is the
 * wind strong enough to move it?
 */
export function driftIndex(newSnowCm, windMs, tempC) {
  if (!Number.isFinite(windMs)) return 0;
  const available = clamp(newSnowCm / 8, 0, 1);
  const cold = tempC < -1 ? 1 : clamp((0.5 - tempC) / 1.5, 0.15, 1);
  const transport = clamp((windMs - PHYS.driftThreshold) / 9, 0, 1) ** 0.8;
  return Math.round(100 * available * cold * transport);
}
