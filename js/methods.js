/* The method page renders itself from the same configuration the forecast runs
   on. Nothing here is a transcription of the code — if a constant changes, this
   page changes with it, which is the only way documentation stays true. */

import { APP, PHYS, PRESSURE_LEVELS, MOUNTAINS, MODELS, ACTIVITIES, SCORING, SOURCES, CONTACT, SMHI, activitiesFor } from './config.js';
import { TEMP_FEATURES } from './ml.js';
import { snowRatio } from './physics.js';
import { $, $$, el, round } from './util.js';
import { t, tr, applyTranslations, renderLangToggle } from './i18n.js';

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
  'SMHI.metresPerKm': SMHI.metresPerKm,
  'SMHI.radiusKm': SMHI.radiusKm,
  'SMHI.logLimit': SMHI.logLimit,
  levels: PRESSURE_LEVELS.join(', '),
  phaseMid: round((PHYS.snowBelow + PHYS.rainAbove) / 2, 2),
};
function fillConstants() {
  for (const node of $$('[data-const]')) {
    const v = CONSTANTS[node.dataset.const];
    node.textContent = v === undefined ? '?' : String(v);
  }
}

/* ---------- table helper ---------- */
function table(sel, headers, rows) {
  const node = $(sel);
  if (!node) return;
  node.textContent = '';
  const thead = el('thead', {}, node);
  const hr = el('tr', {}, thead);
  for (const h of headers) el('th', { text: h }, hr);
  const tbody = el('tbody', {}, node);
  for (const row of rows) {
    const line = el('tr', {}, tbody);
    for (const cell of row) el('td', { html: cell }, line);
  }
}
const link = (url, text) => `<a href="${url}" target="_blank" rel="noopener">${text}</a>`;

function renderTables() {
/* ---------- 1. sources ---------- */
table('#providers-table',
  [t('tbl.provider'), t('tbl.modelUsed'), t('tbl.licence'), t('tbl.credit')],
  SOURCES.providers.map((p) => [
    `${link(p.url, p.org)}<br><span class="muted" style="font-size:.9em">${p.country}</span>`,
    p.product,
    `${link(p.licenceUrl, tr(p.licence))}${p.caveat ? ' <span style="color:var(--amber)">*</span>' : ''}`,
    tr(p.credit),
  ]));

const ukmo = SOURCES.providers.find((p) => p.caveat);
if (ukmo) {
  const note = el('div', { class: 'callout warn' });
  note.innerHTML = t('sources.ukmoCaveat', {
    state: t(MODELS.some((m) => m.key === ukmo.key) ? 'sources.stillInUse' : 'sources.notInUse'),
  });
  $('#providers-table').after(note);
}

table('#aggregator-table',
  [t('tbl.source'), t('tbl.role'), t('tbl.licence'), t('tbl.notes')],
  [
    [link(SOURCES.aggregator.url, SOURCES.aggregator.name),
      t('role.aggregator'),
      link(SOURCES.aggregator.licenceUrl, SOURCES.aggregator.licence),
      `${tr(SOURCES.aggregator.tier)} ${link(SOURCES.aggregator.terms, t('tbl.terms'))}`],
    [SOURCES.ensemble.name, t('role.ensemble'), 'As the providers above', tr(SOURCES.ensemble.note)],
    [link(SOURCES.reanalysis.url, SOURCES.reanalysis.name),
      t('role.reanalysis'),
      link(SOURCES.reanalysis.licenceUrl, tr(SOURCES.reanalysis.licence)),
      tr(SOURCES.reanalysis.note)],
    [link(SOURCES.observations.url, SOURCES.observations.name),
      t('role.observations'),
      link(SOURCES.observations.licenceUrl, tr(SOURCES.observations.licence)),
      tr(SOURCES.observations.note)],
  ]);

table('#fonts-table',
  [t('tbl.typeface'), t('tbl.by'), t('tbl.licence'), t('tbl.text')],
  SOURCES.fonts.map((f) => [link(f.url, f.name), f.author, f.licence, link(f.file, t('tbl.included'))]));

/* The attribution block, assembled from the same data as the tables. */
const attribution = SOURCES.providers.map((p) => `${tr(p.credit)}.`).join('<br>')
  + `<br>${SOURCES.observations.credit}, licensed under Creative Commons Erkännande 4.0 SE.`
  + `<br>${SOURCES.reanalysis.credit}.`
  + `<br>${SOURCES.reanalysis.disclaimer}`
  + `<br><br>Weather data served by ${link(SOURCES.aggregator.url, 'Open-Meteo')}, licensed under `
  + `${link(SOURCES.aggregator.licenceUrl, 'CC BY 4.0')}. Modified: values shown are downscaled, `
  + `combined and bias-corrected by ÅreWeather.`;
$('#attribution').innerHTML = attribution;
$('#footer-attribution').innerHTML = `Weather data by ${link(SOURCES.aggregator.url, 'Open-Meteo')} `
  + `(${link(SOURCES.aggregator.licenceUrl, 'CC BY 4.0')}, modified) aggregating `
  + `${SOURCES.providers.map((p) => p.org).join(', ')} and ${SOURCES.reanalysis.org}. `
  + `Observation data from ${link(SOURCES.observations.licenceUrl, 'SMHI')}, CC BY 4.0 SE, modified.`;
$('#verified-pill').textContent = t('pill.verified', { date: SOURCES.verified });

/* ---------- 2. the requests ---------- */
table('#requests-table',
  [t('tbl.endpoint'), t('tbl.whatFor'), t('tbl.when'), t('tbl.cachedFor')],
  [
    ['<code>api.open-meteo.com<br>/v1/forecast</code>', t('req.surface', { n: MODELS.length }), t('req.whenOpen'), t('req.min30')],
    ['<code>api.open-meteo.com<br>/v1/forecast</code>', t('req.profile', { n: PRESSURE_LEVELS.length }), t('req.whenOpen'), t('req.min30')],
    ['<code>ensemble-api.open-meteo.com<br>/v1/ensemble</code>', t('req.ensemble'), t('req.whenOpen'), t('req.hours3')],
    ['<code>historical-forecast-api.open-meteo.com<br>/v1/forecast</code>', t('req.history', { n: APP.trainingDays }), t('req.whenTrain', { n: APP.retrainAfterHours }), t('req.hours24')],
    ['<code>archive-api.open-meteo.com<br>/v1/archive</code>', t('req.archive'), t('req.whenWithAbove'), t('req.hours24')],
    ['<code>opendata-download-metobs<br>.smhi.se</code>', t('req.smhi', { n: SMHI.parameters.length }), t('req.whenSmhi'), t('req.min20')],
  ]);

/* ---------- 6. snow ratio, read from the function itself ---------- */
const RATIO_BANDS = [
  [t('ratio.above1'), 2], ['−1…+1 °C', 0], ['−4…−1 °C', -2.5], ['−8…−4 °C', -6],
  ['−14…−8 °C', -11], ['−20…−14 °C', -17], [t('ratio.below20'), -24],
];
table('#snowratio-table',
  [t('tbl.airTemp'), t('tbl.ratio'), t('tbl.gives')],
  RATIO_BANDS.map(([label, probe]) => [label, `${snowRatio(probe)} : 1`, `${round(snowRatio(probe) / 10, 1)} cm`]));

/* ---------- 7. ml features ---------- */
const FEATURE_WHY = {
  'ens mean': 'feat.ensMean',
  'model spread': 'feat.spread',
  humidity: 'feat.humidity',
  cloud: 'feat.cloud',
  wind: 'feat.wind',
  'hour sin': 'feat.hourSin',
  'hour cos': 'feat.hourCos',
  'season sin': 'feat.seasonSin',
  'season cos': 'feat.seasonCos',
};
table('#features-table', [t('tbl.feature'), t('tbl.featureWhy')],
  TEMP_FEATURES.map((f) => [`<code>${f}</code>`, FEATURE_WHY[f] ? t(FEATURE_WHY[f]) : '']));

/* ---------- 8. scoring, straight from the activity registry ---------- */
function ruleRows(activity) {
  return activity.rules.map((r) => {
    const effect = r.kind === 'flag'
      ? t('tbl.flatCost', { n: r.amount })
      : t('tbl.rampCost', { sign: r.kind === 'bonus' ? '+' : '−', from: r.from, slope: r.slope, cap: r.cap });
    const trigger = r.reads
      ? `${tr(r.reads)}<br><span class="muted" style="font-size:.9em"><code>${r.metric}</code></span>`
      : r.kind === 'flag'
        ? `<code>${r.flag}</code>${r.invert ? t('tbl.isFalse') : ''}`
        : t('tbl.above', { metric: r.metric, n: r.from });
    return [tr(r.label), trigger, effect, tr(r.why)];
  });
}

const tables = $('#activity-tables');
for (const activity of ACTIVITIES) {
  const h3 = el('h3', {}, tables);
  h3.innerHTML = `${tr(activity.name)} <span class="muted" style="font-weight:400">· ${t('tbl.base')} <span class="num">${activity.base}</span> · `
    + `${t('tbl.windowHours', { n: activity.window })}`
    + `${activity.requires ? ` · ${t('tbl.needsTerrain', { feature: activity.requires })}` : ''}</span>`;
  el('p', { text: tr(activity.blurb) }, tables);
  const wrap = el('div', { class: 'table-scroll' }, tables);
  const tableEl = el('table', { id: `rules-${activity.id}` }, wrap);
  table(`#rules-${activity.id}`, [t('tbl.factor'), t('tbl.triggers'), t('tbl.effect'), t('tbl.reasoning')], ruleRows(activity));
  if (!tableEl.querySelector('tbody tr')) tableEl.remove();
}

table('#seasons-table', [t('tbl.activity'), t('tbl.runsWhen'), t('tbl.otherwise')],
  ACTIVITIES.filter((a) => a.season).map((a) => [
    tr(a.name),
    [a.season.snowMin != null ? t('tbl.snowMin', { n: a.season.snowMin }) : null,
      a.season.snowMax != null ? t('tbl.snowMax', { n: a.season.snowMax }) : null].filter(Boolean).join(t('tbl.and')),
    `<i>${tr(a.season.under ?? a.season.over)}</i>`,
  ]));

table('#terrain-table', [t('tbl.peak'), t('tbl.terrain'), t('tbl.offered')],
  MOUNTAINS.map((m) => [
    m.name,
    (m.features ?? []).map((f) => `<code>${f}</code>`).join(' ') || '—',
    activitiesFor(m).map((a) => tr(a.short)).join(', '),
  ]));

table('#labels-table', [t('tbl.score'), t('tbl.verdict')],
  SCORING.labels.map(([min, word], i) => {
    const upper = i === 0 ? 100 : SCORING.labels[i - 1][0] - 1;
    return [`${min}–${upper}`, t(word)];
  }));

/* ---------- 9. constants and mountains ---------- */
table('#phys-table', [t('tbl.constant'), t('tbl.value'), t('tbl.controls')], [
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
  [t('tbl.mountain'), t('tbl.summit'), t('tbl.valley'), t('tbl.vertical'), t('tbl.exposure'), t('tbl.position')],
  MOUNTAINS.map((m) => [
    `${m.name}<br><span class="muted" style="font-size:.9em">${m.tags.join(' · ')}</span>`,
    `<span class="num">${m.summit} m</span>`,
    `<span class="num">${m.base} m</span>`,
    `<span class="num">${m.summit - m.base} m</span>`,
    `<span class="num">${m.exposure.toFixed(2)}×</span>`,
    `<span class="num">${m.lat.toFixed(4)}°N ${m.lon.toFixed(4)}°E</span>`,
  ]));
}

/* ---------- contact, behind the answer to a question ----------
   The address is never in the source. The AES-GCM key is derived from what the
   visitor types, so a wrong answer fails the authentication tag and yields
   nothing at all — there is no comparison to bypass. */

$('#issues-link').href = CONTACT.issues;
function fillGate() {
  $('#gate-question').innerHTML = `${tr(CONTACT.question)}<small>${tr(CONTACT.hint)}</small>`;
  $('#gate-answer').placeholder = tr(CONTACT.placeholder);
}

const b64ToBytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const normalise = (s2) => s2.toLowerCase().replace(/[^a-z0-9åäö]/g, '');
const digitsOnly = (s2) => s2.replace(/[^0-9]/g, '');

async function unseal(answer) {
  const sealed = CONTACT.sealed;
  const salt = b64ToBytes(sealed.salt);
  const iv = b64ToBytes(sealed.iv);
  const ct = b64ToBytes(sealed.ct);
  // "1420", "1420 m" and "1420m" should all work; try the sensible readings.
  const candidates = [...new Set([normalise(answer), digitsOnly(answer)].filter(Boolean))];
  for (const candidate of candidates) {
    try {
      const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(candidate), 'PBKDF2', false, ['deriveKey']);
      const key = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: sealed.iterations, hash: 'SHA-256' },
        base, { name: 'AES-GCM', length: 256 }, false, ['decrypt'],
      );
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
      return new TextDecoder().decode(plain);
    } catch { /* wrong answer for this reading; try the next */ }
  }
  return null;
}

const gate = $('#gate');
const msg = $('#gate-msg');
gate.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const value = $('#gate-answer').value.trim();
  if (!value) return;
  const button = $('#gate-submit');
  button.disabled = true;
  msg.className = 'gate-msg';
  msg.textContent = t('gate.deriving');
  const address = await unseal(value);
  button.disabled = false;
  if (!address) {
    msg.className = 'gate-msg bad';
    msg.textContent = t('gate.wrong');
    return;
  }
  msg.className = 'gate-msg good';
  msg.textContent = t('gate.ok');
  const mailLink = $('#revealed-mail');
  mailLink.textContent = address;
  mailLink.href = `mailto:${address}?subject=${encodeURIComponent(CONTACT.subject)}`;
  $('#revealed').hidden = false;
  $('#copy-mail').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(address);
      $('#copy-mail').textContent = t('gate.copied');
      setTimeout(() => { $('#copy-mail').textContent = t('gate.copy'); }, 1800);
    } catch {
      $('#copy-mail').textContent = t('gate.copyManual');
    }
  }, { once: true });
});

/* ---------- contents and scroll spy ---------- */
const sections = $$('.doc > section[id]');
const toc = $('#toc');
const links = new Map();
function buildToc() {
  toc.textContent = '';
  links.clear();
  for (const section of sections) {
    const title = section.querySelector('h2').textContent.replace(/^\d+\s·\s/, '');
    const li = el('li', {}, toc);
    links.set(section.id, el('a', { href: `#${section.id}`, text: title }, li));
  }
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

/* Render once, then again whenever the language changes. */
function renderPage() {
  applyTranslations();
  fillConstants();
  renderTables();
  fillGate();
  buildToc();
}
renderPage();
renderLangToggle($('#lang-toggle'), renderPage);

if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
