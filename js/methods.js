/* The method page renders itself from the same configuration the forecast runs
   on. Nothing here is a transcription of the code — if a constant changes, this
   page changes with it, which is the only way documentation stays true. */

import { APP, PHYS, PRESSURE_LEVELS, MOUNTAINS, MODELS, SCORING, SOURCES } from './config.js';
import { TEMP_FEATURES } from './ml.js';
import { snowRatio } from './physics.js';
import { $, $$, el, round } from './util.js';

/* ---------- inline constants ---------- */
const CONSTANTS = {
  'APP.bandStep': APP.bandStep,
  'APP.trainingDays': APP.trainingDays,
  'APP.retrainAfterHours': APP.retrainAfterHours,
  'PHYS.anchorScale': PHYS.anchorScale,
  'PHYS.fallbackLapse': PHYS.fallbackLapse,
  'PHYS.windBlendScale': PHYS.windBlendScale,
  'PHYS.orographicPerKm': PHYS.orographicPerKm,
  'PHYS.snowBelow': PHYS.snowBelow,
  'PHYS.rainAbove': PHYS.rainAbove,
  'PHYS.driftThreshold': PHYS.driftThreshold,
  cacheMinutes: 30,
  levels: PRESSURE_LEVELS.join(', '),
  phaseMid: round((PHYS.snowBelow + PHYS.rainAbove) / 2, 2),
};
for (const node of $$('[data-const]')) {
  const v = CONSTANTS[node.dataset.const];
  node.textContent = v === undefined ? '?' : String(v);
}

/* ---------- table helper ---------- */
function table(sel, headers, rows) {
  const t = $(sel);
  if (!t) return;
  t.textContent = '';
  const thead = el('thead', {}, t);
  const hr = el('tr', {}, thead);
  for (const h of headers) el('th', { text: h }, hr);
  const tbody = el('tbody', {}, t);
  for (const row of rows) {
    const tr = el('tr', {}, tbody);
    for (const cell of row) el('td', { html: cell }, tr);
  }
}
const link = (url, text) => `<a href="${url}" target="_blank" rel="noopener">${text}</a>`;

/* ---------- 1. sources ---------- */
table('#providers-table',
  ['Provider', 'Model used here', 'Licence', 'Credit required'],
  SOURCES.providers.map((p) => [
    `${link(p.url, p.org)}<br><span class="muted" style="font-size:.9em">${p.country}</span>`,
    p.product,
    `${link(p.licenceUrl, p.licence)}${p.caveat ? ' <span style="color:var(--amber)">*</span>' : ''}`,
    p.credit,
  ]));

const ukmo = SOURCES.providers.find((p) => p.caveat);
if (ukmo) {
  const note = el('div', { class: 'callout warn' });
  note.innerHTML = `<b>* One licence worth your attention.</b>
    Open-Meteo serves everything from its API under CC BY 4.0, but the UK Met Office global data is
    published upstream under CC BY-<b>SA</b> — a share-alike licence, which asks that adapted
    material be released under the same terms. Since this app adapts the data heavily, the tidy
    options are: accept it and license the displayed forecast CC BY-SA too, or drop that one model.
    It is the lowest-weighted and least locally relevant of the six over Jämtland, so removing
    <code>ukmo_seamless</code> from <code>MODELS</code> in <code>js/config.js</code> costs almost
    nothing. Currently it is <b>${MODELS.some((m) => m.key === ukmo.key) ? 'still in use' : 'not in use'}</b>.`;
  $('#providers-table').after(note);
}

table('#aggregator-table',
  ['Source', 'Role', 'Licence', 'Notes'],
  [
    [link(SOURCES.aggregator.url, SOURCES.aggregator.name),
      'Aggregates and serves every model above',
      link(SOURCES.aggregator.licenceUrl, SOURCES.aggregator.licence),
      `${SOURCES.aggregator.tier} ${link(SOURCES.aggregator.terms, 'Terms')}`],
    [SOURCES.ensemble.name, 'Probability and spread', 'As the providers above', SOURCES.ensemble.note],
    [link(SOURCES.reanalysis.url, SOURCES.reanalysis.name),
      'Training target for the bias correction',
      link(SOURCES.reanalysis.licenceUrl, SOURCES.reanalysis.licence),
      SOURCES.reanalysis.note],
  ]);

table('#fonts-table',
  ['Typeface', 'By', 'Licence', 'Text'],
  SOURCES.fonts.map((f) => [link(f.url, f.name), f.author, f.licence, link(f.file, 'included in this repository')]));

/* The attribution block, assembled from the same data as the tables. */
const attribution = SOURCES.providers.map((p) => `${p.credit}.`).join('<br>')
  + `<br>${SOURCES.reanalysis.credit}.`
  + `<br>${SOURCES.reanalysis.disclaimer}`
  + `<br><br>Weather data served by ${link(SOURCES.aggregator.url, 'Open-Meteo')}, licensed under `
  + `${link(SOURCES.aggregator.licenceUrl, 'CC BY 4.0')}. Modified: values shown are downscaled, `
  + `combined and bias-corrected by ÅreWeather.`;
$('#attribution').innerHTML = attribution;
$('#footer-attribution').innerHTML = `Weather data by ${link(SOURCES.aggregator.url, 'Open-Meteo')} `
  + `(${link(SOURCES.aggregator.licenceUrl, 'CC BY 4.0')}, modified) aggregating `
  + `${SOURCES.providers.map((p) => p.org).join(', ')} and ${SOURCES.reanalysis.org}.`;
$('#verified-date').textContent = SOURCES.verified;
$('#verified-pill').textContent = `Licences checked ${SOURCES.verified}`;

/* ---------- 2. the requests ---------- */
table('#requests-table',
  ['Endpoint', 'What for', 'When', 'Cached for'],
  [
    ['<code>api.open-meteo.com<br>/v1/forecast</code>', `Surface fields from ${MODELS.length} models at summit height, 7 days hourly`, 'Opening a mountain', '30 minutes'],
    ['<code>api.open-meteo.com<br>/v1/forecast</code>', `Pressure-level sounding (${PRESSURE_LEVELS.length} levels) plus freezing level, visibility, CAPE, snow depth`, 'Opening a mountain', '30 minutes'],
    ['<code>ensemble-api.open-meteo.com<br>/v1/ensemble</code>', 'Ensemble members for spread and probability', 'Opening a mountain', '3 hours'],
    ['<code>historical-forecast-api.open-meteo.com<br>/v1/forecast</code>', `What every model predicted over the past ${APP.trainingDays} days`, 'First visit per mountain, then every ' + APP.retrainAfterHours + ' hours', '24 hours'],
    ['<code>archive-api.open-meteo.com<br>/v1/archive</code>', 'ERA5-Land reanalysis for the same hours — the training target', 'With the request above', '24 hours'],
  ]);

/* ---------- 6. snow ratio, read from the function itself ---------- */
const RATIO_BANDS = [
  ['above +1 °C', 2], ['−1 to +1 °C', 0], ['−4 to −1 °C', -2.5], ['−8 to −4 °C', -6],
  ['−14 to −8 °C', -11], ['−20 to −14 °C', -17], ['below −20 °C', -24],
];
table('#snowratio-table',
  ['Air temperature', 'Ratio', '1 mm of water gives'],
  RATIO_BANDS.map(([label, probe]) => [label, `${snowRatio(probe)} : 1`, `${round(snowRatio(probe) / 10, 1)} cm`]));

/* ---------- 7. ml features ---------- */
const FEATURE_WHY = {
  'ens mean': 'The forecast being corrected — bias often depends on the value itself.',
  'model spread': 'Disagreement between models is a proxy for how uncertain the situation is.',
  humidity: 'Separates humid, cloudy regimes from dry, radiative ones.',
  cloud: 'Cloud cover drives the diurnal error pattern more than anything else.',
  wind: 'Windy nights mix the boundary layer; calm ones let it decouple.',
  'hour sin': 'Time of day, as a smooth cycle rather than a step at midnight.',
  'hour cos': 'The other half of that cycle.',
  'season sin': 'Day of year, same trick — bias in January differs from July.',
  'season cos': 'The other half of the seasonal cycle.',
};
table('#features-table', ['Feature', 'Why it is in the model'],
  TEMP_FEATURES.map((f) => [`<code>${f}</code>`, FEATURE_WHY[f] ?? '']));

/* ---------- 8. scoring, straight from SCORING ---------- */
function ruleRows(spec) {
  return spec.rules.map((r) => {
    const effect = r.kind === 'flag'
      ? `−${r.amount} flat`
      : `${r.kind === 'bonus' ? '+' : '−'}(value − ${r.from}) × ${r.slope}, capped at ${r.cap}`;
    const trigger = r.reads
      ? `${r.reads}<br><span class="muted" style="font-size:.9em"><code>${r.metric}</code></span>`
      : r.kind === 'flag' ? `<code>${r.flag}</code>` : `<code>${r.metric}</code> above ${r.from}`;
    return [r.label, trigger, effect, r.why];
  });
}
$('#trail-base').textContent = SCORING.trail.base;
$('#skimo-base').textContent = SCORING.skimo.base;
table('#trail-table', ['Factor', 'Triggers on', 'Effect on the score', 'Reasoning'], ruleRows(SCORING.trail));
table('#skimo-table', ['Factor', 'Triggers on', 'Effect on the score', 'Reasoning'], ruleRows(SCORING.skimo));
table('#labels-table', ['Score', 'Verdict'],
  SCORING.labels.map(([min, word], i) => {
    const upper = i === 0 ? 100 : SCORING.labels[i - 1][0] - 1;
    return [`${min}–${upper}`, word];
  }));

/* ---------- 9. constants and mountains ---------- */
table('#phys-table', ['Constant', 'Value', 'What it controls'], [
  ['<code>fallbackLapse</code>', `${PHYS.fallbackLapse} °C / 100 m`, 'Lapse rate used only when no sounding is available'],
  ['<code>anchorScale</code>', `${PHYS.anchorScale} m`, 'How fast the surface anchor gives way to the free atmosphere'],
  ['<code>windBlendScale</code>', `${PHYS.windBlendScale} m`, 'How fast surface wind gives way to the sounding wind'],
  ['<code>orographicPerKm</code>', `${PHYS.orographicPerKm} per km`, 'Precipitation enhancement with height'],
  ['<code>snowBelow</code> / <code>rainAbove</code>', `${PHYS.snowBelow} / ${PHYS.rainAbove} °C`, 'Wet-bulb thresholds for snow and rain'],
  ['<code>driftThreshold</code>', `${PHYS.driftThreshold} m/s`, 'Wind speed at which loose snow starts moving'],
  ['<code>bandStep</code>', `${APP.bandStep} m`, 'Vertical resolution of the forecast'],
  ['<code>forecastDays</code>', `${APP.forecastDays} days`, 'How far ahead each model is requested'],
  ['<code>trainingDays</code>', `${APP.trainingDays} days`, 'Length of the machine-learning training window'],
  ['<code>timezone</code>', APP.timezone, 'All times are local to the mountains, whatever your device says'],
]);

table('#mountains-table',
  ['Mountain', 'Summit', 'Valley', 'Vertical', 'Exposure', 'Position'],
  MOUNTAINS.map((m) => [
    `${m.name}<br><span class="muted" style="font-size:.9em">${m.tags.join(' · ')}</span>`,
    `<span class="num">${m.summit} m</span>`,
    `<span class="num">${m.base} m</span>`,
    `<span class="num">${m.summit - m.base} m</span>`,
    `<span class="num">${m.exposure.toFixed(2)}×</span>`,
    `<span class="num">${m.lat.toFixed(4)}°N ${m.lon.toFixed(4)}°E</span>`,
  ]));

/* ---------- contents and scroll spy ---------- */
const sections = $$('.doc > section[id]');
const toc = $('#toc');
const links = new Map();
for (const s of sections) {
  const title = s.querySelector('h2').textContent.replace(/^\d+\s·\s/, '');
  const li = el('li', {}, toc);
  const a = el('a', { href: `#${s.id}`, text: title }, li);
  links.set(s.id, a);
}
const spy = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (e.isIntersecting) {
      for (const a of links.values()) a.classList.remove('on');
      links.get(e.target.id)?.classList.add('on');
    }
  }
}, { rootMargin: '-90px 0px -70% 0px' });
sections.forEach((s) => spy.observe(s));

if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
