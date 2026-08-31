/* In-browser machine learning.

   Everything in this file trains on the device, on demand, from public data:
   45 days of archived forecasts from every model versus ERA5-Land reanalysis
   at the same point. Three things are learned:

     1. Model skill weights  — which model is actually right over *this* peak,
        rather than which one is famous. A softmax over measured error.
     2. Residual bias models — ridge regression on the ensemble's leftover
        error in temperature and wind speed, with the systematic part of the
        error (diurnal, humidity- and wind-dependent) removed.
     3. Precipitation calibration — logistic regression turning "4 of 6 models
        say wet" into a probability that has been checked against reality.

   Every learned component is validated on a contiguous hold-out block at the
   end of the window. If the correction does not beat the raw ensemble there,
   it is switched off and the app says so. A forecast that lies about its own
   skill is worse than no forecast. */

import { MODELS } from './config.js';
import { clamp, mean } from './util.js';

/* ---------- linear algebra ---------- */

/** Solve A x = b by Gaussian elimination with partial pivoting. */
function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-12) return null;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      if (!f) continue;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / M[i][i]);
}

/** Column standardisation; degenerate columns get sd = 1 so they vanish. */
function standardiser(X) {
  const d = X[0].length;
  const mu = Array(d).fill(0);
  const sd = Array(d).fill(1);
  for (let j = 0; j < d; j++) {
    const col = X.map((r) => r[j]);
    mu[j] = mean(col);
    const v = mean(col.map((x) => (x - mu[j]) ** 2));
    sd[j] = v > 1e-9 ? Math.sqrt(v) : 1;
  }
  return { mu, sd, apply: (row) => row.map((x, j) => (x - mu[j]) / sd[j]) };
}

/** Ridge regression with an unpenalised intercept. Rows carrying a non-finite
 *  feature or target are dropped: one bad hour must not poison the fit. */
function ridge(X0, y0, lambda = 1) {
  const keep = X0.map((row, i) => row.every(Number.isFinite) && Number.isFinite(y0[i]));
  const X = X0.filter((_, i) => keep[i]);
  const y = y0.filter((_, i) => keep[i]);
  if (X.length < 50) return null;
  const n = X.length;
  const d = X[0].length;
  const std = standardiser(X);
  const Z = X.map(std.apply);
  const yMean = mean(y);
  const A = Array.from({ length: d }, () => Array(d).fill(0));
  const b = Array(d).fill(0);
  for (let i = 0; i < n; i++) {
    const zi = Z[i];
    const yi = y[i] - yMean;
    for (let j = 0; j < d; j++) {
      b[j] += zi[j] * yi;
      for (let k = j; k < d; k++) A[j][k] += zi[j] * zi[k];
    }
  }
  for (let j = 0; j < d; j++) {
    for (let k = 0; k < j; k++) A[j][k] = A[k][j];
    A[j][j] += lambda * n;
  }
  const w = solve(A, b);
  if (!w) return null;
  return {
    mu: std.mu, sd: std.sd, w, b0: yMean,
    predict(row) {
      let s = this.b0;
      for (let j = 0; j < this.w.length; j++) s += this.w[j] * ((row[j] - this.mu[j]) / this.sd[j]);
      return s;
    },
  };
}

/** Logistic regression by plain batch gradient descent — d is tiny, n is small. */
function logistic(X0, y0, { iters = 500, lr = 0.35, l2 = 0.01 } = {}) {
  const keep = X0.map((row, i) => row.every(Number.isFinite) && Number.isFinite(y0[i]));
  const X = X0.filter((_, i) => keep[i]);
  const y = y0.filter((_, i) => keep[i]);
  if (X.length < 50) return null;
  const n = X.length;
  const d = X[0].length;
  const std = standardiser(X);
  const Z = X.map(std.apply);
  const w = Array(d).fill(0);
  let b = Math.log(clamp(mean(y), 0.02, 0.98) / (1 - clamp(mean(y), 0.02, 0.98)));
  for (let it = 0; it < iters; it++) {
    const gw = Array(d).fill(0);
    let gb = 0;
    for (let i = 0; i < n; i++) {
      let z = b;
      for (let j = 0; j < d; j++) z += w[j] * Z[i][j];
      const p = 1 / (1 + Math.exp(-clamp(z, -30, 30)));
      const e = p - y[i];
      gb += e;
      for (let j = 0; j < d; j++) gw[j] += e * Z[i][j];
    }
    b -= (lr * gb) / n;
    for (let j = 0; j < d; j++) w[j] -= lr * (gw[j] / n + l2 * w[j]);
  }
  return {
    mu: std.mu, sd: std.sd, w, b,
    predict(row) {
      let z = this.b;
      for (let j = 0; j < this.w.length; j++) z += this.w[j] * ((row[j] - this.mu[j]) / this.sd[j]);
      return 1 / (1 + Math.exp(-clamp(z, -30, 30)));
    },
  };
}

/* ---------- feature engineering ---------- */

const mae = (a, b) => mean(a.map((v, i) => Math.abs(v - b[i])));
const sdOf = (arr) => {
  const v = arr.filter(Number.isFinite);
  if (v.length < 2) return 0;
  const m = mean(v);
  return Math.sqrt(mean(v.map((x) => (x - m) ** 2)));
};

/**
 * Feature row shared by the temperature and wind corrections.
 * Kept deliberately small: ~1000 training rows cannot support a wide model,
 * and every feature here has a physical reason to be present.
 */
export const TEMP_FEATURES = ['ens mean', 'model spread', 'humidity', 'cloud', 'wind', 'hour sin', 'hour cos', 'season sin', 'season cos'];

function tempRow(ens, spread, rh, cloud, wind, hour, doy) {
  const h = (2 * Math.PI * hour) / 24;
  const s = (2 * Math.PI * doy) / 365.25;
  return [ens, spread, rh ?? 80, cloud ?? 60, wind ?? 5, Math.sin(h), Math.cos(h), Math.sin(s), Math.cos(s)];
}

/* ---------- training ---------- */

/**
 * @param {object} training  payload from api.fetchTraining
 * @returns {object|null} learned parameters, or null when there is too little data
 */
export function train(training) {
  const fh = training?.forecasts?.hourly;
  const th = training?.truth?.hourly;
  if (!fh?.time || !th?.time) return null;

  const truthIndex = new Map(th.time.map((t, i) => [t, i]));
  const modelKeys = (training.models ?? MODELS.map((m) => m.key))
    .filter((k) => fh[`temperature_2m_${k}`] || (training.models?.length === 1 && fh.temperature_2m));

  const get = (name, key, i) => {
    const arr = fh[`${name}_${key}`] ?? (modelKeys.length === 1 ? fh[name] : null);
    return arr ? arr[i] : undefined;
  };

  const rows = [];
  for (let i = 0; i < fh.time.length; i++) {
    const j = truthIndex.get(fh.time[i]);
    if (j === undefined) continue;
    const tTruth = th.temperature_2m?.[j];
    if (!Number.isFinite(tTruth)) continue;

    const temps = [], winds = [], precs = [];
    const perModel = {};
    for (const k of modelKeys) {
      const t = get('temperature_2m', k, i);
      const w = get('wind_speed_10m', k, i);
      const p = get('precipitation', k, i);
      perModel[k] = { t, w, p };
      if (Number.isFinite(t)) temps.push(t);
      if (Number.isFinite(w)) winds.push(w);
      if (Number.isFinite(p)) precs.push(p);
    }
    if (temps.length < 2) continue;

    const d = new Date(`${fh.time[i].slice(0, 10)}T00:00:00`);
    const doy = Number.isFinite(d.getTime()) ? Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 864e5) : 180;
    rows.push({
      time: fh.time[i],
      hour: +fh.time[i].slice(11, 13),
      doy,
      perModel,
      ensT: mean(temps), sdT: sdOf(temps),
      ensW: mean(winds), sdW: sdOf(winds),
      ensP: mean(precs), wetFrac: precs.length ? precs.filter((p) => p >= 0.1).length / precs.length : 0,
      rh: mean(modelKeys.map((k) => get('relative_humidity_2m', k, i)).filter(Number.isFinite)),
      cloud: mean(modelKeys.map((k) => get('cloud_cover', k, i)).filter(Number.isFinite)),
      tT: tTruth,
      tW: th.wind_speed_10m?.[j],
      tP: th.precipitation?.[j],
    });
  }

  if (rows.length < 200) return { insufficient: true, n: rows.length, trainedAt: Date.now() };

  const cut = Math.floor(rows.length * 0.75);
  const fit = rows.slice(0, cut);
  const hold = rows.slice(cut);

  /* --- 1. per-model skill --- */
  const skill = modelKeys.map((k) => {
    const pairs = rows.filter((r) => Number.isFinite(r.perModel[k]?.t));
    const errT = pairs.map((r) => Math.abs(r.perModel[k].t - r.tT));
    const wPairs = rows.filter((r) => Number.isFinite(r.perModel[k]?.w) && Number.isFinite(r.tW));
    const errW = wPairs.map((r) => Math.abs(r.perModel[k].w - r.tW));
    const meta = MODELS.find((m) => m.key === k);
    return {
      key: k,
      name: meta?.name ?? k,
      org: meta?.org ?? '',
      res: meta?.res ?? '',
      prior: meta?.prior ?? 1,
      n: pairs.length,
      maeT: pairs.length ? mean(errT) : NaN,
      maeW: wPairs.length ? mean(errW) : NaN,
    };
  }).filter((s) => s.n > 50);

  const best = Math.min(...skill.map((s) => s.maeT).filter(Number.isFinite));
  let wsum = 0;
  for (const s of skill) {
    // Softmax over error, scaled so a 1 °C worse MAE roughly halves the weight,
    // gently tilted by a prior that encodes native grid resolution.
    s.raw = Number.isFinite(s.maeT) ? s.prior * Math.exp(-(s.maeT - best) / 0.7) : 0;
    wsum += s.raw;
  }
  for (const s of skill) s.weight = wsum > 0 ? s.raw / wsum : 1 / skill.length;
  skill.sort((a, b) => b.weight - a.weight);
  const weights = Object.fromEntries(skill.map((s) => [s.key, s.weight]));

  /* Weighted ensemble mean is the baseline the correction has to beat. */
  const wEns = (r, field) => {
    let num = 0, den = 0;
    for (const s of skill) {
      const v = r.perModel[s.key]?.[field];
      if (Number.isFinite(v)) { num += s.weight * v; den += s.weight; }
    }
    return den > 0 ? num / den : NaN;
  };

  /* --- 2. temperature residual --- */
  const tempFit = fit.filter((r) => Number.isFinite(wEns(r, 't')));
  const temp = ridge(
    tempFit.map((r) => tempRow(wEns(r, 't'), r.sdT, r.rh, r.cloud, r.ensW, r.hour, r.doy)),
    tempFit.map((r) => r.tT - wEns(r, 't')),
    0.08,
  );

  const holdT = hold.filter((r) => Number.isFinite(wEns(r, 't')));
  const baseT = holdT.map((r) => wEns(r, 't'));
  const corrT = temp
    ? holdT.map((r, i) => {
      const dv = temp.predict(tempRow(wEns(r, 't'), r.sdT, r.rh, r.cloud, r.ensW, r.hour, r.doy));
      return baseT[i] + (Number.isFinite(dv) ? clamp(dv, -6, 6) : 0);
    })
    : baseT;
  const truthT = holdT.map((r) => r.tT);
  const maeBaseT = mae(baseT, truthT);
  const maeMlT = mae(corrT, truthT);
  const rawMaeT = mae(holdT.map((r) => r.ensT), truthT);

  /* --- 3. wind residual --- */
  const windFit = fit.filter((r) => Number.isFinite(wEns(r, 'w')) && Number.isFinite(r.tW));
  const windModel = windFit.length > 150 ? ridge(
    windFit.map((r) => tempRow(wEns(r, 'w'), r.sdW, r.rh, r.cloud, r.ensT, r.hour, r.doy)),
    windFit.map((r) => r.tW - wEns(r, 'w')),
    0.15,
  ) : null;
  const holdW = hold.filter((r) => Number.isFinite(wEns(r, 'w')) && Number.isFinite(r.tW));
  const maeBaseW = holdW.length ? mae(holdW.map((r) => wEns(r, 'w')), holdW.map((r) => r.tW)) : NaN;
  const maeMlW = windModel && holdW.length
    ? mae(holdW.map((r) => wEns(r, 'w') + clamp(windModel.predict(tempRow(wEns(r, 'w'), r.sdW, r.rh, r.cloud, r.ensT, r.hour, r.doy)), -5, 5)), holdW.map((r) => r.tW))
    : NaN;

  /* --- 4. precipitation probability calibration --- */
  const pRow = (r) => [Math.sqrt(Math.max(0, r.ensP || 0)), r.wetFrac, (r.rh ?? 80) / 100, (r.cloud ?? 60) / 100];
  const precFit = fit.filter((r) => Number.isFinite(r.tP));
  const precip = precFit.length > 150
    ? logistic(precFit.map(pRow), precFit.map((r) => (r.tP >= 0.1 ? 1 : 0)))
    : null;
  const holdP = hold.filter((r) => Number.isFinite(r.tP));
  const brier = (probs) => mean(holdP.map((r, i) => (probs[i] - (r.tP >= 0.1 ? 1 : 0)) ** 2));
  const brierBase = holdP.length ? brier(holdP.map((r) => r.wetFrac)) : NaN;
  const brierMl = precip && holdP.length ? brier(holdP.map((r) => precip.predict(pRow(r)))) : NaN;

  return {
    trainedAt: Date.now(),
    n: rows.length,
    nHold: hold.length,
    range: training.range,
    truthModel: training.truthModel,
    skill,
    weights,
    temp: temp ? { ...stripFns(temp), use: maeMlT < maeBaseT * 0.995 } : null,
    wind: windModel ? { ...stripFns(windModel), use: Number.isFinite(maeMlW) && maeMlW < maeBaseW * 0.995 } : null,
    precip: precip ? { ...stripFns(precip), use: Number.isFinite(brierMl) && brierMl < brierBase * 0.995 } : null,
    scores: {
      rawMaeT, maeBaseT, maeMlT, maeBaseW, maeMlW, brierBase, brierMl,
    },
  };
}

/** Serialisable form — methods are re-attached by `hydrate` after a cache read. */
function stripFns(m) {
  return { mu: m.mu, sd: m.sd, w: m.w, b0: m.b0, b: m.b };
}

const linPredict = (m, row) => {
  if (!row.every(Number.isFinite)) return 0;
  let s = m.b0;
  for (let j = 0; j < m.w.length; j++) s += m.w[j] * ((row[j] - m.mu[j]) / m.sd[j]);
  return s;
};
const logPredict = (m, row) => {
  if (!row.every(Number.isFinite)) return NaN;
  let z = m.b;
  for (let j = 0; j < m.w.length; j++) z += m.w[j] * ((row[j] - m.mu[j]) / m.sd[j]);
  return 1 / (1 + Math.exp(-clamp(z, -30, 30)));
};

/* ---------- inference ---------- */

/** Learned temperature correction, in °C, clamped to a believable range. */
export function correctTemperature(ml, { ens, spread, rh, cloud, wind, hour, doy }) {
  if (!ml?.temp?.use) return 0;
  return clamp(linPredict(ml.temp, tempRow(ens, spread, rh, cloud, wind, hour, doy)), -6, 6);
}

/** Learned wind-speed correction, in m/s. */
export function correctWind(ml, { ens, spread, rh, cloud, temp, hour, doy }) {
  if (!ml?.wind?.use) return 0;
  return clamp(linPredict(ml.wind, tempRow(ens, spread, rh, cloud, temp, hour, doy)), -5, 5);
}

/** Calibrated probability of measurable precipitation (0–1). */
export function precipProbability(ml, { ensP, wetFrac, rh, cloud }) {
  if (!ml?.precip?.use) return null;
  return clamp(logPredict(ml.precip, [Math.sqrt(Math.max(0, ensP || 0)), wetFrac, (rh ?? 80) / 100, (cloud ?? 60) / 100]), 0, 1);
}

/** Skill weights for the deterministic models, falling back to the priors. */
export function modelWeights(ml, keys) {
  if (ml?.weights) {
    const present = keys.filter((k) => Number.isFinite(ml.weights[k]));
    if (present.length) {
      const total = present.reduce((a, k) => a + ml.weights[k], 0);
      return Object.fromEntries(keys.map((k) => [k, present.includes(k) ? ml.weights[k] / total : 0]));
    }
  }
  const priors = keys.map((k) => MODELS.find((m) => m.key === k)?.prior ?? 1);
  const total = priors.reduce((a, b) => a + b, 0);
  return Object.fromEntries(keys.map((k, i) => [k, priors[i] / total]));
}
