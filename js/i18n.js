/* Bilingual site: English and Swedish.
 *
 * Swedish here is written as Swedish, not as translated English. The mountain
 * vocabulary is the one used in the fjäll and by SMHI — toppturer, nollgradig
 * nivå, våttemperatur, byvind, flatljus, drivbildning — because a forecast that
 * calls a gust "vindpust" tells a Swedish skier immediately that nobody who
 * skis wrote it.
 *
 * Strings live here; markup carries `data-i18n` (text) or `data-i18n-html`
 * (prose with inline markup) and is filled in on load and on every switch.
 */

const STORE_KEY = 'areweather.v1.lang';

export const LANGS = [
  { id: 'en', label: 'EN', name: 'English', locale: 'en-GB' },
  { id: 'sv', label: 'SV', name: 'Svenska', locale: 'sv-SE' },
];

function stored() {
  try { return localStorage.getItem(STORE_KEY); } catch { return null; }
}

/** Swedish for Swedish browsers, English otherwise, and whatever was last chosen over both. */
function detect() {
  const saved = stored();
  if (LANGS.some((l) => l.id === saved)) return saved;
  const browser = (typeof navigator !== 'undefined' && navigator.language) || 'en';
  return browser.toLowerCase().startsWith('sv') ? 'sv' : 'en';
}

let current = detect();

export const lang = () => current;
export const locale = () => LANGS.find((l) => l.id === current)?.locale ?? 'en-GB';

export function setLang(id) {
  if (!LANGS.some((l) => l.id === id) || id === current) return false;
  current = id;
  try { localStorage.setItem(STORE_KEY, id); } catch { /* private mode */ }
  if (typeof document !== 'undefined') document.documentElement.lang = id;
  return true;
}

/** Look up a string, interpolating {name} placeholders. */
export function t(key, vars) {
  const entry = STRINGS[key];
  let text = entry ? (entry[current] ?? entry.en) : key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) text = text.split(`{${k}}`).join(String(v));
  }
  return text;
}

/** Resolve a `{ en, sv }` value from configuration. Plain strings pass through. */
export function tr(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value[current] ?? value.en ?? '';
  return value ?? '';
}

/** Fill every translatable node under `root`. */
export function applyTranslations(root = document) {
  for (const node of root.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n);
  for (const node of root.querySelectorAll('[data-i18n-html]')) node.innerHTML = t(node.dataset.i18nHtml);
  for (const node of root.querySelectorAll('[data-i18n-title]')) node.title = t(node.dataset.i18nTitle);
  for (const node of root.querySelectorAll('[data-i18n-label]')) node.setAttribute('aria-label', t(node.dataset.i18nLabel));
  for (const node of root.querySelectorAll('[data-i18n-content]')) node.setAttribute('content', t(node.dataset.i18nContent));
  if (root === document) {
    document.documentElement.lang = current;
    const title = document.querySelector('title[data-i18n]');
    if (title) document.title = t(title.dataset.i18n);
  }
}

/** The language switch itself, rendered wherever it is asked for. */
export function renderLangToggle(node, onChange) {
  node.textContent = '';
  for (const l of LANGS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = l.label;
    b.title = l.name;
    b.setAttribute('lang', l.id);
    b.setAttribute('aria-label', l.name);
    b.className = l.id === current ? 'on' : '';
    b.setAttribute('aria-pressed', l.id === current ? 'true' : 'false');
    b.addEventListener('click', () => { if (setLang(l.id)) onChange(l.id); });
    node.appendChild(b);
  }
}

/* ---------------------------------------------------------------------------
   Strings.
--------------------------------------------------------------------------- */
export const STRINGS = {
  /* ---- chrome ---- */
  'brand.tagline': { en: 'fjäll forecast engine', sv: 'prognosmotor för fjällen' },
  'brand.compare': { en: 'where to go', sv: 'vart du ska åka' },
  'brand.methods': { en: 'method & sources', sv: 'metod och källor' },
  'nav.compare': { en: 'Compare peaks', sv: 'Jämför toppar' },
  'nav.method': { en: 'Method', sv: 'Metod' },
  'nav.methodLong': { en: 'Method &amp; sources', sv: 'Metod och källor' },
  'nav.onePeak': { en: '← One peak', sv: '← En topp' },
  'nav.back': { en: '← Back to the forecast', sv: '← Tillbaka till prognosen' },
  'nav.skip': { en: 'Skip to the forecast', sv: 'Hoppa till prognosen' },
  'nav.skipContent': { en: 'Skip to the content', sv: 'Hoppa till innehållet' },
  'nav.skipPicks': { en: 'Skip to the recommendations', sv: 'Hoppa till rekommendationerna' },
  'unit.windGroup': { en: 'Wind unit', sv: 'Vindenhet' },
  'lang.group': { en: 'Language', sv: 'Språk' },

  /* ---- status ---- */
  'status.loading': { en: 'Loading…', sv: 'Laddar…' },
  'status.fetching': { en: 'Fetching models…', sv: 'Hämtar modeller…' },
  'status.training': { en: 'Training on 45 days…', sv: 'Tränar på 45 dygn…' },
  'status.scoring': { en: 'Scoring {n} peaks…', sv: 'Betygsätter {n} toppar…' },
  'status.live': { en: 'Live · {age}', sv: 'Live · {age}' },
  'status.cached': { en: 'Cached · {age}', sv: 'Cachat · {age}' },
  'status.offline': { en: 'Offline · {age}', sv: 'Offline · {age}' },
  'status.error': { en: 'Offline', sv: 'Offline' },
  'status.noData': { en: 'No data', sv: 'Ingen data' },
  'status.partial': { en: '{ok} of {total} peaks', sv: '{ok} av {total} toppar' },
  'status.refresh': { en: 'Data status — click to refresh', sv: 'Datastatus — klicka för att uppdatera' },

  /* ---- time ---- */
  'time.justNow': { en: 'just now', sv: 'nyss' },
  'time.minutes': { en: '{n} min ago', sv: 'för {n} min sedan' },
  'time.hours': { en: '{n} h ago', sv: 'för {n} tim sedan' },
  'time.days': { en: '{n} d ago', sv: 'för {n} dygn sedan' },
  'time.now': { en: 'Now', sv: 'Nu' },
  'time.today': { en: 'Today', sv: 'Idag' },

  /* ---- hero ---- */
  'hero.models': { en: '{n} models', sv: '{n} modeller' },
  'hero.summit': { en: 'summit', sv: 'topp' },
  'hero.vertical': { en: 'of vertical from the valley', sv: 'stigning från dalen' },
  'hero.feels': { en: 'Feels like', sv: 'Känns som' },
  'hero.wind': { en: 'Wind', sv: 'Vind' },
  'hero.gusts': { en: 'Gusts', sv: 'Byvind' },
  'hero.humidity': { en: 'Humidity', sv: 'Luftfuktighet' },
  'hero.newSnow24': { en: 'New snow 24 h', sv: 'Nysnö 24 tim' },
  'hero.precip24': { en: 'Precip 24 h', sv: 'Nederbörd 24 tim' },
  'hero.conditionsFor': { en: 'Conditions for', sv: 'Förhållanden för' },
  'hero.activityCount': { en: '{n} activities', sv: '{n} aktiviteter' },
  'hero.next48': { en: '{activity} · next 48 h', sv: '{activity} · kommande 48 tim' },
  'hero.bestWindow': { en: 'best {from}–{to} {day} · {score}', sv: 'bäst {from}–{to} {day} · {score}' },

  'summary.headline': {
    en: 'Summit <b>{temp}°</b> with <b>{wind} {unit}</b> from the {dir}, feeling like <b>{feels}°</b>.',
    sv: 'Toppen <b>{temp}°</b> med <b>{wind} {unit}</b> från {dir}, känns som <b>{feels}°</b>.',
  },
  'summary.inversion': {
    en: 'An <b>inversion</b> is in place — the summit is warmer than the valley, so cold air is pooling below you.',
    sv: 'Det råder <b>inversion</b> — toppen är varmare än dalen, och kalluften samlas under dig.',
  },
  'summary.lapse': {
    en: 'Lapse rate <b>{lapse}°/100 m</b>, so the valley sits near {valley}°.',
    sv: 'Temperaturgradienten är <b>{lapse}°/100 m</b>, så i dalen är det runt {valley}°.',
  },
  'summary.snowLine': { en: 'Snow line at <b>{z} m</b>.', sv: 'Snögränsen ligger på <b>{z} m</b>.' },
  'summary.allSnow': { en: 'Everything is falling as snow.', sv: 'All nederbörd faller som snö.' },
  'summary.allRain': { en: 'Everything is falling as rain.', sv: 'All nederbörd faller som regn.' },
  'summary.newSnow': { en: '<b>{cm} cm</b> of new snow in the last 24 h.', sv: '<b>{cm} cm</b> nysnö det senaste dygnet.' },
  'summary.inCloud': { en: 'The summit is <b>in cloud</b>.', sv: 'Toppen ligger <b>i moln</b>.' },
  'summary.drift': { en: 'Wind is actively <b>loading lee slopes</b> (index {n}).', sv: 'Vinden <b>packar snö på läsidorna</b> just nu (index {n}).' },

  /* ---- matrix, profile, hourly ---- */
  'matrix.title': { en: 'Elevation × time', sv: 'Höjd × tid' },
  'matrix.sub': {
    en: 'Every {step} m of {mtn}, hour by hour, downscaled from a {n}-model sounding.',
    sv: 'Varje {step} m av {mtn}, timme för timme, nedskalat från en vertikalprofil ur {n} modeller.',
  },
  'matrix.subNoProfile': {
    en: 'Every {step} m of {mtn}, hour by hour. No sounding available right now — using a constant lapse rate.',
    sv: 'Varje {step} m av {mtn}, timme för timme. Ingen vertikalprofil just nu — konstant temperaturgradient används.',
  },
  'matrix.metric.temp': { en: 'Temp', sv: 'Temp' },
  'matrix.metric.wind': { en: 'Wind', sv: 'Vind' },
  'matrix.metric.precip': { en: 'Precip', sv: 'Nederbörd' },
  'matrix.metric.feels': { en: 'Feels', sv: 'Känns som' },
  'matrix.metricGroup': { en: 'Matrix metric', sv: 'Storhet i matrisen' },
  'matrix.rangeGroup': { en: 'Forecast range', sv: 'Prognoslängd' },
  'matrix.scroll': { en: 'Elevation and time matrix, horizontally scrollable', sv: 'Matris över höjd och tid, skrollbar i sidled' },
  'matrix.keyboard': { en: 'Keyboard: <kbd>←</kbd> <kbd>→</kbd> step the selected hour.', sv: 'Tangentbord: <kbd>←</kbd> <kbd>→</kbd> flyttar vald timme.' },
  'matrix.snowLine': { en: 'SNOW LINE', sv: 'SNÖGRÄNS' },
  'matrix.freezing': { en: '0°C', sv: '0°C' },
  'matrix.now': { en: 'NOW', sv: 'NU' },
  'matrix.aria': {
    en: '{metric} for {rows} elevation bands from {lo} to {hi} metres over the next {hours} hours',
    sv: '{metric} för {rows} höjdband från {lo} till {hi} meter under de kommande {hours} timmarna',
  },
  'metric.temp': { en: 'temperature', sv: 'temperatur' },
  'metric.feels': { en: 'feels-like temperature', sv: 'känns-som-temperatur' },
  'metric.wind': { en: 'wind speed', sv: 'vindhastighet' },
  'metric.precip': { en: 'precipitation', sv: 'nederbörd' },

  'legend.snowLine': { en: 'snow line', sv: 'snögräns' },
  'legend.freezing': { en: 'freezing level', sv: 'nollgradig nivå' },
  'legend.night': { en: 'darker column = night', sv: 'mörkare kolumn = natt' },
  'legend.click': { en: 'click any cell to move the profile and intel to that hour', sv: 'klicka på en ruta för att flytta profil och nyckeltal till den timmen' },
  'legend.dry': { en: 'dry', sv: 'torrt' },
  'legend.rain': { en: '10 mm/h rain', sv: '10 mm/tim regn' },
  'legend.snow': { en: 'snow', sv: 'snö' },

  'profile.title': { en: 'Vertical profile', sv: 'Vertikalprofil' },
  'profile.sub': { en: 'Model sounding interpolated to the mountain, anchored to the surface ensemble.', sv: 'Modellprofil interpolerad till berget, förankrad i markensemblen.' },
  'profile.subFallback': { en: 'No pressure-level data for this hour — showing the lapse-rate fallback.', sv: 'Inga trycknivådata för den här timmen — visar reservberäkning med konstant temperaturgradient.' },
  'profile.cloudBase': { en: 'CLOUD BASE {z} m', sv: 'MOLNBAS {z} m' },
  'profile.snowLine': { en: 'SNOW LINE {z} m', sv: 'SNÖGRÄNS {z} m' },
  'profile.wind': { en: 'WIND', sv: 'VIND' },
  'profile.aria': { en: 'Vertical temperature and wind profile of {mtn} at {hour}', sv: 'Vertikal temperatur- och vindprofil för {mtn} klockan {hour}' },

  'hourly.title': { en: 'Hourly at', sv: 'Timme för timme på' },
  'hourly.sub': { en: 'Ensemble spread (p10–p90) around the machine-corrected forecast.', sv: 'Ensemblespridning (p10–p90) runt den maskinkorrigerade prognosen.' },
  'hourly.summit': { en: 'the summit', sv: 'toppen' },
  'hourly.band': { en: '{z} m', sv: '{z} m' },
  'hourly.bandGroup': { en: 'Elevation band', sv: 'Höjdband' },
  'hourly.aria': { en: 'Hourly temperature, wind and precipitation at {z} metres for the next {hours} hours', sv: 'Temperatur, vind och nederbörd timme för timme på {z} meter de kommande {hours} timmarna' },
  'key.temperature': { en: 'temperature', sv: 'temperatur' },
  'key.spread': { en: 'ensemble p10–p90', sv: 'ensemble p10–p90' },
  'key.wind': { en: 'wind', sv: 'vind' },
  'key.gusts': { en: 'gusts', sv: 'byvind' },
  'key.snow': { en: 'snow', sv: 'snö' },
  'key.rain': { en: 'rain', sv: 'regn' },
  'band.summitSuffix': { en: 'summit', sv: 'topp' },
  'band.aria': { en: '{z} metres', sv: '{z} meter' },
  'band.ariaSummit': { en: '{z} metres, the summit', sv: '{z} meter, toppen' },

  /* ---- intel ---- */
  'intel.title': { en: 'Mountain intel', sv: 'Läget på berget' },
  'intel.sub': { en: 'Snapshot for the selected hour.', sv: 'Ögonblicksbild för vald timme.' },
  'intel.freezing': { en: 'Freezing level', sv: 'Nollgradig nivå' },
  'intel.freezing.below': { en: '{m} m of the mountain is below freezing', sv: '{m} m av berget ligger under nollan' },
  'intel.freezing.above': { en: 'Whole mountain above freezing', sv: 'Hela berget är över nollan' },
  'intel.freezing.none': { en: 'Not reported by the high-res models', sv: 'Rapporteras inte av högupplösta modeller' },
  'intel.snowLine': { en: 'Snow line', sv: 'Snögräns' },
  'intel.snowLine.sub': { en: 'Wet-bulb crossing, not air temperature', sv: 'Där våttemperaturen passerar gränsen, inte lufttemperaturen' },
  'intel.snowLine.below': { en: 'Below base', sv: 'Under dalen' },
  'intel.cloudBase': { en: 'Cloud base', sv: 'Molnbas' },
  'intel.cloudBase.in': { en: 'Summit is in cloud — expect flat light', sv: 'Toppen ligger i moln — räkna med flatljus' },
  'intel.cloudBase.clear': { en: 'Summit is clear of cloud', sv: 'Toppen är fri från moln' },
  'intel.chill': { en: 'Wind chill', sv: 'Vindkyla' },
  'intel.chill.severe': { en: 'Frostbite in minutes on exposed skin', sv: 'Förfrysning på minuter på bar hud' },
  'intel.chill.cold': { en: 'Cover everything', sv: 'Täck allt' },
  'intel.chill.ok': { en: 'Manageable with normal layers', sv: 'Hanterbart med vanliga lager' },
  'intel.wind': { en: 'Summit wind', sv: 'Vind på toppen' },
  'intel.wind.sub': { en: 'Gusting {gust} {unit} from the {dir}', sv: 'Byvindar {gust} {unit} från {dir}' },
  'intel.drift': { en: 'Wind loading', sv: 'Vindtransport' },
  'intel.drift.high': { en: 'Active transport onto lee slopes', sv: 'Aktiv transport till läsidorna' },
  'intel.drift.some': { en: 'Some transport of loose snow', sv: 'Viss transport av lös snö' },
  'intel.drift.low': { en: 'Little or no snow moving', sv: 'Lite eller ingen snö i rörelse' },
  'intel.lapse': { en: 'Lapse rate', sv: 'Temperaturgradient' },
  'intel.lapse.inversion': { en: 'Inversion — valley colder than the summit', sv: 'Inversion — kallare i dalen än på toppen' },
  'intel.lapse.sounding': { en: 'From the model sounding', sv: 'Från modellens vertikalprofil' },
  'intel.lapse.fallback': { en: 'Standard fallback (no sounding)', sv: 'Standardvärde (ingen profil)' },
  'intel.newSnow': { en: 'New snow 24 h', sv: 'Nysnö 24 tim' },
  'intel.newSnow.sub': { en: '{mm} mm total water · ratio {ratio}:1', sv: '{mm} mm vatten totalt · förhållande {ratio}:1' },
  'intel.pop': { en: 'Chance of precip', sv: 'Nederbördsrisk' },
  'intel.pop.calibrated': { en: 'Calibrated against reanalysis', sv: 'Kalibrerad mot reanalys' },
  'intel.pop.raw': { en: 'Share of models with measurable precipitation', sv: 'Andel modeller med mätbar nederbörd' },
  'intel.visibility': { en: 'Visibility', sv: 'Sikt' },
  'intel.visibility.sub': { en: 'Model horizontal visibility', sv: 'Modellens horisontella sikt' },
  'intel.snowDepth': { en: 'Snow depth', sv: 'Snödjup' },
  'intel.snowDepth.sub': { en: 'Modelled cover at summit height', sv: 'Modellerat snötäcke på toppnivå' },
  'intel.spread': { en: 'Model spread', sv: 'Modellspridning' },
  'intel.spread.tight': { en: 'Models strongly agree — high confidence', sv: 'Modellerna är eniga — hög tillförlitlighet' },
  'intel.spread.normal': { en: 'Normal disagreement', sv: 'Normal oenighet' },
  'intel.spread.wide': { en: 'Models disagree — treat this hour as uncertain', sv: 'Modellerna är oeniga — behandla timmen som osäker' },
  'intel.cape': { en: 'CAPE', sv: 'CAPE' },
  'intel.cape.high': { en: 'Thunderstorms likely — get off the ridge', sv: 'Åska trolig — lämna ryggen' },
  'intel.cape.some': { en: 'Some convective potential', sv: 'Viss konvektiv potential' },
  'intel.daylight': { en: 'Daylight', sv: 'Dagsljus' },
  'intel.daylight.sub': { en: '{hours} h of light', sv: '{hours} tim ljust' },
  'intel.daylight.uv': { en: '{hours} h of light · UV max {uv}', sv: '{hours} tim ljust · UV max {uv}' },

  /* ---- model agreement and the learning log ---- */
  'models.title': { en: 'Model agreement', sv: 'Modellernas samstämmighet' },
  'models.sub': { en: 'Weighted by measured {days}-day skill over this exact point.', sv: 'Viktade efter uppmätt träffsäkerhet över exakt denna punkt under {days} dygn.' },
  'models.subPrior': { en: 'Weighted by native grid resolution until the skill training finishes.', sv: 'Viktade efter modellernas upplösning tills träningen är klar.' },
  'models.noData': { en: 'no data', sv: 'ingen data' },
  'models.foot': {
    en: 'Weights are a softmax over each model\'s mean absolute temperature error against {truth} reanalysis at this exact point over {n} hours. Values shown are each model\'s raw forecast at {hour}, before correction.',
    sv: 'Vikterna är en softmax över varje modells medelabsolutfel i temperatur mot reanalysen {truth} för exakt denna punkt under {n} timmar. Värdena visar varje modells råa prognos klockan {hour}, före korrigering.',
  },
  'models.footPrior': {
    en: 'Weights are falling back to resolution-based priors — the skill training has not completed for this peak yet.',
    sv: 'Vikterna bygger tills vidare på modellernas upplösning — träningen för den här toppen är inte klar än.',
  },

  'ml.title': { en: 'Learning log', sv: 'Inlärningslogg' },
  'ml.sub': { en: 'What the in-browser model learned and how much it actually helped.', sv: 'Vad modellen i webbläsaren lärde sig, och hur mycket det faktiskt hjälpte.' },
  'ml.training': { en: 'training…', sv: 'tränar…' },
  'ml.trainingNote': {
    en: 'Fetching 45 days of archived forecasts and reanalysis, then fitting the correction in this tab. The forecast above is already usable — it will quietly sharpen when this finishes.',
    sv: 'Hämtar 45 dygn av arkiverade prognoser och reanalys, och anpassar sedan korrigeringen i den här fliken. Prognosen ovan är redan användbar — den skärps när detta är klart.',
  },
  'ml.insufficient': { en: 'not enough data', sv: 'för lite data' },
  'ml.insufficientNote': {
    en: 'Only <code>{n}</code> usable hours came back from the archive for this point, below the 200 needed to fit anything trustworthy. The app is using resolution-based model priors and pure physics downscaling instead — which is the honest fallback, not a degraded one.',
    sv: 'Bara <code>{n}</code> användbara timmar kom tillbaka från arkivet för den här punkten, mot de 200 som krävs för en tillförlitlig anpassning. Appen använder i stället modellvikter baserade på upplösning och ren fysikalisk nedskalning — vilket är det ärliga alternativet, inte ett sämre.',
  },
  'ml.active': { en: 'correction active', sv: 'korrigering aktiv' },
  'ml.disabled': { en: 'correction disabled', sv: 'korrigering avstängd' },
  'ml.meta': { en: '{n} hours · {from} → {to} · truth: {truth}', sv: '{n} timmar · {from} → {to} · facit: {truth}' },
  'ml.rawMae': { en: 'Raw ensemble MAE', sv: 'MAE, rå ensemble' },
  'ml.weightedMae': { en: 'Skill-weighted MAE', sv: 'MAE, skickviktad' },
  'ml.correctedMae': { en: 'After ML correction', sv: 'Efter ML-korrigering' },
  'ml.windMae': { en: 'Wind MAE', sv: 'MAE, vind' },
  'ml.brier': { en: 'Precip Brier', sv: 'Brier, nederbörd' },
  'ml.gain': {
    en: 'On a hold-out block of <code>{n}</code> hours the correction never saw, it cut temperature error by <code>{pct}%</code>. Best single model here is <b>{model}</b> ({org}) at <code>{mae}°C</code> MAE, carrying <code>{weight}%</code> of the weight. The learned correction is applied at summit height and then propagated down the sounding.',
    sv: 'På ett avskilt block om <code>{n}</code> timmar som korrigeringen aldrig sett minskade den temperaturfelet med <code>{pct} %</code>. Bästa enskilda modell här är <b>{model}</b> ({org}) med <code>{mae}°C</code> i MAE och <code>{weight} %</code> av vikten. Den inlärda korrigeringen appliceras på toppnivå och förs sedan ned genom profilen.',
  },
  'ml.noGain': {
    en: 'The fitted correction did not beat the skill-weighted ensemble on the hold-out block (<code>{ml}</code> vs <code>{base}</code> °C), so it is switched off and you are seeing the weighted ensemble. That is the correct outcome to report — a model that cannot prove it helps should not be allowed to touch the forecast.',
    sv: 'Den anpassade korrigeringen slog inte den skickviktade ensemblen på det avskilda blocket (<code>{ml}</code> mot <code>{base}</code> °C), så den är avstängd och du ser den viktade ensemblen. Det är rätt sak att redovisa — en modell som inte kan visa att den hjälper ska inte få röra prognosen.',
  },
  'ml.caveat': {
    en: 'Reanalysis is a ~9 km grid estimate, not a summit weather station, so it captures systematic model bias rather than the last few hundred metres of local terrain effect. Retrains automatically every three days; weights live in this browser only.',
    sv: 'Reanalysen är en uppskattning i ett rutnät på ungefär 9 km, inte en väderstation på toppen. Den fångar systematiska modellfel snarare än de sista hundra metrarnas lokala terrängeffekt. Tränas om automatiskt var tredje dygn; vikterna finns bara i den här webbläsaren.',
  },

  /* ---- observations ---- */
  'obs.title': { en: 'Ground truth', sv: 'Verkligheten' },
  'obs.sub': { en: 'Live readings from the nearest SMHI stations, and how the forecast compares against them right now.', sv: 'Aktuella mätvärden från närmaste SMHI-stationer, och hur prognosen står sig mot dem just nu.' },
  'obs.reading': { en: 'Reading the stations…', sv: 'Läser av stationerna…' },
  'obs.none': {
    en: 'No station reported in the last few hours within 60 km of {mtn}. The fjäll is thinly instrumented — this is normal in a storm, when the stations that matter most are the ones that ice up.',
    sv: 'Ingen station har rapporterat de senaste timmarna inom 60 km från {mtn}. Fjällen är glest instrumenterade — det är normalt i oväder, när de stationer som betyder mest är de som isar igen.',
  },
  'obs.failed': {
    en: '<b>SMHI\'s observation service did not answer.</b> The forecast above is unaffected — this panel is a cross-check, not an input. ',
    sv: '<b>SMHI:s observationstjänst svarade inte.</b> Prognosen ovan påverkas inte — den här panelen är en kontroll, inte ett underlag. ',
  },
  'obs.failedOnline': { en: 'If this persists, the station API is either down or refusing browser requests from this domain.', sv: 'Om det håller i sig ligger stations-API:et antingen nere eller nekar anrop från webbläsare på den här domänen.' },
  'obs.failedOffline': { en: 'You are offline.', sv: 'Du är offline.' },
  'obs.headline': {
    en: 'The forecast is running <b>{state}</b> against <b>{station}</b>, {km} km away at {height} m.',
    sv: 'Prognosen ligger <b>{state}</b> jämfört med <b>{station}</b>, {km} km bort på {height} m.',
  },
  'obs.state.warm': { en: 'warm', sv: 'för varmt' },
  'obs.state.cold': { en: 'cold', sv: 'för kallt' },
  'obs.state.spot': { en: 'right on', sv: 'rätt' },
  'obs.detail': { en: 'Model {model}° at that height · station {observed}° · {age} min ago', sv: 'Modell {model}° på den höjden · station {observed}° · för {age} min sedan' },
  'obs.detailStale': { en: 'Model {model}° at that height · station {observed}° · reading is {age} min old', sv: 'Modell {model}° på den höjden · station {observed}° · avläsningen är {age} min gammal' },
  'obs.noMatch': { en: 'Stations are reporting, but none close enough in time to compare against the forecast hour.', sv: 'Stationer rapporterar, men ingen ligger nära nog i tid för att jämföras med prognostimmen.' },
  'obs.col.temp': { en: 'temp', sv: 'temp' },
  'obs.col.wind': { en: 'wind', sv: 'vind' },
  'obs.col.gust': { en: 'gust', sv: 'by' },
  'obs.col.from': { en: 'from', sv: 'från' },
  'obs.col.hum': { en: 'hum', sv: 'fukt' },
  'obs.verify': {
    en: '<b>Verification kept in this browser:</b> {n} hours logged over {days} days against {station} — mean error <code>{bias}°</code> ({word}), absolute error <code>{mae}°</code>. It grows every time you open this page, and never leaves your device.',
    sv: '<b>Verifiering sparad i den här webbläsaren:</b> {n} timmar loggade under {days} dygn mot {station} — medelfel <code>{bias}°</code> ({word}), absolutfel <code>{mae}°</code>. Loggen växer varje gång du öppnar sidan och lämnar aldrig din enhet.',
  },
  'obs.verify.none': { en: 'no consistent bias', sv: 'inget systematiskt fel' },
  'obs.verify.warm': { en: 'running {n}° warm', sv: '{n}° för varmt' },
  'obs.verify.cold': { en: 'running {n}° cold', sv: '{n}° för kallt' },
  'obs.verifyEmpty': {
    en: '<b>Verification:</b> {n} hours logged so far. Each visit records how the forecast compared against the nearest station; after a few days this becomes a real record of how this app performs at this peak.',
    sv: '<b>Verifiering:</b> {n} timmar loggade hittills. Varje besök registrerar hur prognosen stod sig mot närmaste station; efter några dygn blir det en riktig historik över hur appen presterar på den här toppen.',
  },
  'obs.caveat': {
    en: 'A station is a different <i>place</i>, not just a different altitude — the comparison mixes downscaling error with the honest fact that the weather 15 km away is not the weather here. Treat it as a sanity check, not a verdict. Observations are never blended into the forecast.',
    sv: 'En station ligger på en annan <i>plats</i>, inte bara på en annan höjd — jämförelsen blandar nedskalningsfel med det uppenbara att vädret 15 km bort inte är vädret här. Se det som en rimlighetskontroll, inte ett facit. Observationer vägs aldrig in i prognosen.',
  },

  /* ---- errors ---- */
  'error.fatal': {
    en: '<b>Could not reach the weather service for {mtn}.</b> {reason} — {message}. Nothing is cached for this peak yet, so there is nothing to fall back on. Try again, or pick a mountain you have loaded before.',
    sv: '<b>Kunde inte nå vädertjänsten för {mtn}.</b> {reason} — {message}. Ingenting finns cachat för den här toppen än, så det finns inget att falla tillbaka på. Försök igen, eller välj en topp du laddat tidigare.',
  },
  'error.noAnswer': { en: 'Open-Meteo did not answer', sv: 'Open-Meteo svarade inte' },
  'error.offline': { en: 'You appear to be offline', sv: 'Du verkar vara offline' },
  'error.unknown': { en: 'unknown error', sv: 'okänt fel' },

  /* ---- comparison view ---- */
  'compare.title': { en: 'Where to go', sv: 'Vart du ska åka' },
  'compare.titleWeak': { en: 'The least bad options', sv: 'De minst dåliga alternativen' },
  'compare.titleBad': { en: 'It is that kind of week', sv: 'Det är den sortens vecka' },
  'compare.titleSeason': { en: '{activity} is out of season', sv: '{activity} är utanför säsong' },
  'compare.sub': { en: 'Every peak, scored hour by hour for the next seven days, and the best window on each.', sv: 'Varje topp, betygsatt timme för timme sju dygn framåt, med bästa fönstret på var och en.' },
  'compare.subGood': { en: 'Best windows for {activity} in the next seven days.', sv: 'Bästa fönstren för {activity} de kommande sju dygnen.' },
  'compare.subWeak': { en: 'Nothing scores well for {activity} this week. These are the best of it.', sv: 'Ingenting får bra betyg för {activity} den här veckan. Det här är det bästa som finns.' },
  'compare.subBad': { en: 'Nothing in the next seven days scores above {top} for {activity}. Sometimes the honest answer is to stay in the valley.', sv: 'Inget av de kommande sju dygnen når över {top} för {activity}. Ibland är det ärliga svaret att stanna i dalen.' },
  'compare.subSeasonSnow': { en: 'There is not enough snow for {activity} on these peaks, and none of the next seven days changes that. The grid below shows where it is closest.', sv: 'Det finns inte tillräckligt med snö för {activity} på de här topparna, och inget av de kommande sju dygnen ändrar det. Rutnätet nedan visar var det är närmast.' },
  'compare.subSeasonBare': { en: 'There is too much snow for {activity} right now. The grid below shows where it is closest.', sv: 'Det ligger för mycket snö för {activity} just nu. Rutnätet nedan visar var det är närmast.' },
  'compare.gridTitle': { en: 'All peaks, all week', sv: 'Alla toppar, hela veckan' },
  'compare.gridSub': { en: 'Each cell is the best window that day, and its score — three hours for a run, eight for a hut-to-hut stage, after dark for the aurora. Click one to open that mountain.', sv: 'Varje ruta är dygnets bästa fönster och dess betyg — tre timmar för ett löppass, åtta för en dagsetapp mellan stugor, efter mörkrets inbrott för norrsken. Klicka för att öppna toppen.' },
  'compare.peak': { en: 'Peak', sv: 'Topp' },
  'compare.activityGroup': { en: 'Activity', sv: 'Aktivitet' },
  'compare.sortGroup': { en: 'Sort order', sv: 'Sortering' },
  'compare.sort.best': { en: 'Best first', sv: 'Bäst först' },
  'compare.sort.height': { en: 'By height', sv: 'Efter höjd' },
  'compare.sort.name': { en: 'A–Z', sv: 'A–Ö' },
  'compare.scroll': { en: 'Comparison grid, horizontally scrollable', sv: 'Jämförelserutnät, skrollbart i sidled' },
  'compare.na': { en: '{activity} is not a thing on this peak — no lift, or the wrong terrain for it', sv: '{activity} finns inte på den här toppen — ingen lift, eller fel terräng för det' },
  'compare.rowError': { en: 'no data — {reason}', sv: 'ingen data — {reason}' },
  'compare.noRows': { en: 'No peak returned usable data. Try refreshing.', sv: 'Ingen topp lämnade användbar data. Prova att uppdatera.' },
  'compare.scoringAll': { en: 'Scoring every peak…', sv: 'Betygsätter alla toppar…' },
  'compare.bestBet': { en: 'Best bet', sv: 'Bästa valet' },
  'compare.option': { en: 'Option {n}', sv: 'Alternativ {n}' },
  'compare.pickWhy': { en: '<b>{label}</b> — {limits}. {tmax}° to {tmin}° at the summit, wind to {wind} {unit}{extra}.', sv: '<b>{label}</b> — {limits}. {tmax}° till {tmin}° på toppen, vind upp till {wind} {unit}{extra}.' },
  'compare.limitedBy': { en: 'limited by {factors}', sv: 'begränsas av {factors}' },
  'compare.nothingHolding': { en: 'nothing holding you back', sv: 'inget som stoppar dig' },
  'compare.extraSnow': { en: ', {cm} cm of new snow', sv: ', {cm} cm nysnö' },
  'compare.extraRain': { en: ', {mm} mm of precipitation', sv: ', {mm} mm nederbörd' },
  'compare.score': { en: 'Score', sv: 'Betyg' },
  'compare.legend': { en: 'poor → excellent · times are the best {n}-hour {kind} that day', sv: 'dåligt → utmärkt · tiderna är dygnets bästa {n}-timmarsfönster {kind}' },
  'compare.legend.day': { en: 'daylight window', sv: 'i dagsljus' },
  'compare.legend.night': { en: 'window after dark', sv: 'efter mörkrets inbrott' },
  'compare.legend.dark': { en: 'in amber: no daylight left', sv: 'i gult: inget dagsljus kvar' },
  'compare.cellAria': { en: '{mtn}, {day}: score {score} for {activity}, best window {from} to {to}', sv: '{mtn}, {day}: betyg {score} för {activity}, bästa fönster {from} till {to}' },
  'compare.cellAriaDark': { en: ', after dark', sv: ', efter mörkrets inbrott' },
  'compare.tip.window': { en: 'Best window', sv: 'Bästa fönstret' },
  'compare.tip.score': { en: 'Score', sv: 'Betyg' },
  'compare.tip.temp': { en: 'Summit temp', sv: 'Topptemperatur' },
  'compare.tip.wind': { en: 'Max wind', sv: 'Max vind' },
  'compare.tip.newSnow': { en: 'New snow', sv: 'Nysnö' },
  'compare.tip.precip': { en: 'Precipitation', sv: 'Nederbörd' },
  'compare.tip.limited': { en: 'Limited by', sv: 'Begränsas av' },
  'compare.tip.daylight': { en: 'Daylight', sv: 'Dagsljus' },
  'compare.tip.noDaylight': { en: 'none left — headlamp', sv: 'inget kvar — pannlampa' },
  'compare.tip.partial': { en: 'Part day', sv: 'Del av dygn' },
  'compare.tip.fromNow': { en: 'from now on', sv: 'från och med nu' },
  'compare.differentTitle': { en: 'What this view does differently', sv: 'Vad den här vyn gör annorlunda' },
  'compare.different': {
    en: 'Scoring ten peaks means ten sets of requests, so this page deliberately fetches less per mountain than the single-peak view: surface fields from all six models, plus snow depth and freezing level, but no pressure-level sounding. Summit temperature and wind are identical either way — the sounding is anchored to the surface ensemble at exactly summit height — but the cloud-base estimate is rougher here, so a <i>summit in cloud</i> penalty can differ by a few points from the detail page. Open a peak for the full calculation.',
    sv: 'Att betygsätta tio toppar innebär tio uppsättningar anrop, så den här sidan hämtar medvetet mindre per berg än enskild-topp-vyn: markparametrar från alla sex modeller plus snödjup och nollgradig nivå, men ingen vertikalprofil från trycknivåer. Temperatur och vind på toppen blir identiska ändå — profilen förankras i markensemblen på exakt toppnivå — men uppskattningen av molnbasen blir grövre här, så avdraget för <i>toppen i moln</i> kan skilja sig några poäng från detaljsidan. Öppna en topp för hela beräkningen.',
  },
  'compare.differentLink': { en: 'How the scores are built →', sv: 'Så byggs betygen →' },

  /* ---- verdict words ---- */
  'verdict.excellent': { en: 'Excellent', sv: 'Utmärkt' },
  'verdict.good': { en: 'Good', sv: 'Bra' },
  'verdict.workable': { en: 'Workable', sv: 'Fungerar' },
  'verdict.marginal': { en: 'Marginal', sv: 'Marginellt' },
  'verdict.poor': { en: 'Poor', sv: 'Dåligt' },
  'verdict.outOfSeason': { en: 'Out of season', sv: 'Utanför säsong' },
  'verdict.noData': { en: 'No data', sv: 'Ingen data' },
  'verdict.missing': { en: 'forecast data missing for this hour', sv: 'prognosdata saknas för den här timmen' },
  'verdict.limitedBy': { en: '{label} — limited by {factors}', sv: '{label} — begränsas av {factors}' },
  'season.unknownSnow': { en: 'snow cover unknown', sv: 'okänt snötäcke' },
  'season.summerCheck': { en: '{reason} — freezing level far above the summit', sv: '{reason} — nollgradig nivå långt över toppen' },

  /* ---- WMO weather codes, in plain language ---- */
  'wmo.0': { en: 'Clear', sv: 'Klart' },
  'wmo.1': { en: 'Mostly clear', sv: 'Mestadels klart' },
  'wmo.2': { en: 'Partly cloudy', sv: 'Halvklart' },
  'wmo.3': { en: 'Overcast', sv: 'Mulet' },
  'wmo.45': { en: 'Fog', sv: 'Dimma' },
  'wmo.48': { en: 'Freezing fog', sv: 'Underkyld dimma' },
  'wmo.51': { en: 'Light drizzle', sv: 'Lätt duggregn' },
  'wmo.53': { en: 'Drizzle', sv: 'Duggregn' },
  'wmo.55': { en: 'Heavy drizzle', sv: 'Tätt duggregn' },
  'wmo.56': { en: 'Freezing drizzle', sv: 'Underkylt duggregn' },
  'wmo.57': { en: 'Freezing drizzle', sv: 'Underkylt duggregn' },
  'wmo.61': { en: 'Light rain', sv: 'Lätt regn' },
  'wmo.63': { en: 'Rain', sv: 'Regn' },
  'wmo.65': { en: 'Heavy rain', sv: 'Kraftigt regn' },
  'wmo.66': { en: 'Freezing rain', sv: 'Underkylt regn' },
  'wmo.67': { en: 'Freezing rain', sv: 'Underkylt regn' },
  'wmo.71': { en: 'Light snow', sv: 'Lätt snöfall' },
  'wmo.73': { en: 'Snow', sv: 'Snöfall' },
  'wmo.75': { en: 'Heavy snow', sv: 'Ymnigt snöfall' },
  'wmo.77': { en: 'Snow grains', sv: 'Kornsnö' },
  'wmo.80': { en: 'Rain showers', sv: 'Regnskurar' },
  'wmo.81': { en: 'Rain showers', sv: 'Regnskurar' },
  'wmo.82': { en: 'Violent rain showers', sv: 'Kraftiga regnskurar' },
  'wmo.85': { en: 'Snow showers', sv: 'Snöbyar' },
  'wmo.86': { en: 'Heavy snow showers', sv: 'Kraftiga snöbyar' },
  'wmo.95': { en: 'Thunderstorm', sv: 'Åskväder' },
  'wmo.96': { en: 'Thunderstorm with hail', sv: 'Åskväder med hagel' },
  'wmo.99': { en: 'Thunderstorm with hail', sv: 'Åskväder med hagel' },

  /* ---- rail ---- */
  'rail.aria': { en: '{name}, {m} metres', sv: '{name}, {m} meter' },
  'rail.group': { en: 'Choose a mountain', sv: 'Välj en topp' },
  /* ---- cell tooltip ---- */
  'tip.temperature': { en: 'Temperature', sv: 'Temperatur' },
  'tip.feels': { en: 'Feels like', sv: 'Känns som' },
  'tip.wetBulb': { en: 'Wet bulb', sv: 'Våttemperatur' },
  'tip.wind': { en: 'Wind', sv: 'Vind' },
  'tip.gusts': { en: 'Gusts', sv: 'Byvind' },
  'tip.humidity': { en: 'Humidity', sv: 'Luftfuktighet' },
  'tip.snow': { en: 'Snow', sv: 'Snö' },
  'tip.sleet': { en: 'Sleet', sv: 'Snöblandat regn' },
  'tip.rain': { en: 'Rain', sv: 'Regn' },
  'tip.precipitation': { en: 'Precipitation', sv: 'Nederbörd' },
  'tip.dry': { en: 'dry', sv: 'torrt' },

  'footer.build': { en: '{version} · {n} peaks · data cached in this browser', sv: '{version} · {n} toppar · data cachad i den här webbläsaren' },

  /* ---- forecast page ---- */
  'page.index.title': {
    en: 'ÅreWeather — Mountain forecasts for Åre, Sweden',
    sv: 'ÅreWeather — fjällprognoser för Åre',
  },
  'page.index.description': {
    en: 'High-resolution, elevation-aware mountain weather for Åreskutan, Snasahögarna, Sylarna and the rest of the Åre fjäll. Multi-model ensemble and machine-learned bias correction, built for trail runners and ski mountaineers.',
    sv: 'Högupplöst fjällväder höjd för höjd för Åreskutan, Snasahögarna, Sylarna och resten av Årefjällen. Ensemble av flera modeller och maskininlärd biaskorrigering, byggd för terränglöpare och toppturåkare.',
  },
  'method.title': { en: 'How this forecast is made', sv: 'Så görs prognosen' },
  'method.sub': { en: 'No black boxes — the summary is here, every formula and licence is on the method page.', sv: 'Inga svarta lådor — sammanfattningen står här, varje formel och licens finns på metodsidan.' },
  'method.link': { en: 'Full method, sources &amp; licences →', sv: 'Fullständig metod, källor och licenser →' },
  'method.step1': {
    en: '<b>Six numerical weather models</b> are fetched per mountain from Open-Meteo: MET Norway MET Nordic (1&nbsp;km, the best model for Scandinavian terrain), DMI Harmonie AROME (2&nbsp;km), DWD ICON, ECMWF IFS, UKMO and NOAA GFS.',
    sv: '<b>Sex prognosmodeller</b> hämtas per berg från Open-Meteo: MET Norways MET Nordic (1&nbsp;km, den bästa modellen för skandinavisk terräng), DMI:s Harmonie AROME (2&nbsp;km), DWD:s ICON, ECMWF:s IFS, brittiska UKMO och amerikanska GFS.',
  },
  'method.step2': {
    en: '<b>A real sounding, not a lapse-rate guess.</b> Temperature, humidity and wind on pressure levels from 1000&nbsp;hPa to 500&nbsp;hPa with their geopotential heights give the true vertical structure above the mountain — including inversions, where the summit is <i>warmer</i> than the village.',
    sv: '<b>En riktig vertikalprofil, inte en gissad temperaturgradient.</b> Temperatur, fuktighet och vind på trycknivåer från 1000&nbsp;hPa till 500&nbsp;hPa, med tillhörande geopotentiella höjder, ger den verkliga skiktningen över berget — inklusive inversioner, då toppen är <i>varmare</i> än byn.',
  },
  'method.step3': {
    en: '<b>Elevation downscaling.</b> The sounding is anchored to the surface ensemble at model height, then interpolated to every 100&nbsp;m band. Wind is blended from surface to free atmosphere and multiplied by a terrain exposure factor. Precipitation gets an orographic enhancement with height.',
    sv: '<b>Nedskalning i höjdled.</b> Profilen förankras i markensemblen på modellens marknivå och interpoleras sedan till varje 100-metersband. Vinden vägs samman från marknivå till fri atmosfär och multipliceras med en exponeringsfaktor för terrängen. Nederbörden förstärks orografiskt med höjden.',
  },
  'method.step4': {
    en: '<b>Phase from wet-bulb temperature</b>, not air temperature — the physically correct way to place a snow line, then a temperature-dependent snow ratio converts millimetres to centimetres.',
    sv: '<b>Nederbördsfasen bestäms av våttemperaturen</b>, inte lufttemperaturen — det fysikaliskt korrekta sättet att placera en snögräns. Ett temperaturberoende snöförhållande räknar sedan om millimeter till centimeter.',
  },
  'method.step5': {
    en: '<b>Machine learning, trained in your browser.</b> 45 days of archived forecasts from every model are scored against ERA5-Land reanalysis. A ridge regression learns the residual temperature and wind bias at this point; a logistic model calibrates precipitation probability; a softmax over measured error assigns each model its weight. Hold-out validation is reported honestly in the learning log — including when the correction does not help.',
    sv: '<b>Maskininlärning som tränas i din webbläsare.</b> 45 dygn av arkiverade prognoser från varje modell ställs mot reanalysen ERA5-Land. En ridgeregression lär sig kvarvarande fel i temperatur och vind för just den här punkten, en logistisk modell kalibrerar nederbördsrisken, och en softmax över uppmätta fel ger varje modell sin vikt. Utvärderingen på oanvänd data redovisas ärligt i inlärningsloggen — även när korrigeringen inte hjälper.',
  },
  'method.step6': {
    en: '<b>Ensemble probabilities</b> come from a 30+ member ICON-EU / GFS ensemble, giving the p10–p90 bands and the chance of precipitation.',
    sv: '<b>Sannolikheter från ensembler</b> kommer från en ensemble med fler än 30 medlemmar ur ICON-EU och GFS, och ger banden p10–p90 samt nederbördsrisken.',
  },
  'method.disclaimer': {
    en: '<b>This is not an avalanche forecast.</b> Wind-loading and new-snow numbers are meteorological indices only. For avalanche danger in the Swedish fjäll always use <a href="https://www.lavinprognoser.se" target="_blank" rel="noopener">lavinprognoser.se</a>, and for official warnings <a href="https://www.smhi.se" target="_blank" rel="noopener">SMHI</a>. Mountain weather kills people who trust a screen over their eyes.',
    sv: '<b>Det här är ingen lavinprognos.</b> Siffrorna för vindtransport och nysnö är rent meteorologiska index. För lavinfara i de svenska fjällen, använd alltid <a href="https://www.lavinprognoser.se" target="_blank" rel="noopener">lavinprognoser.se</a>, och för officiella varningar <a href="https://www.smhi.se" target="_blank" rel="noopener">SMHI</a>. Fjällvädret dödar den som litar mer på en skärm än på sina egna ögon.',
  },
  'footer.attribution': {
    en: 'Weather data served by <a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a> under <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC&nbsp;BY&nbsp;4.0</a>, <b>modified</b> — values shown are downscaled, combined and bias-corrected by this site. Source data from MET&nbsp;Norway, DMI, Deutscher&nbsp;Wetterdienst, ECMWF, the UK&nbsp;Met&nbsp;Office and NOAA; reanalysis generated using Copernicus Climate Change Service information. Observation data from <a href="https://opendata.smhi.se/metobs/introduction" target="_blank" rel="noopener">SMHI</a> (<a href="https://www.smhi.se/data/om-smhis-data/villkor-for-anvandning" target="_blank" rel="noopener">CC&nbsp;BY&nbsp;4.0&nbsp;SE</a>), modified. <a href="methods.html">Full sources, licences and every calculation →</a>',
    sv: 'Väderdata levereras av <a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a> under <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC&nbsp;BY&nbsp;4.0</a>, <b>bearbetad</b> — värdena som visas är nedskalade, sammanvägda och biaskorrigerade av den här sajten. Källdata från MET&nbsp;Norway, DMI, Deutscher&nbsp;Wetterdienst, ECMWF, brittiska&nbsp;Met&nbsp;Office och NOAA; reanalysen är framtagen med information från Copernicus Climate Change Service. Observationsdata från <a href="https://opendata.smhi.se/metobs/introduction" target="_blank" rel="noopener">SMHI</a> (<a href="https://www.smhi.se/data/om-smhis-data/villkor-for-anvandning" target="_blank" rel="noopener">CC&nbsp;BY&nbsp;4.0&nbsp;SE</a>), bearbetad. <a href="methods.html">Alla källor, licenser och varje beräkning →</a>',
  },
  'footer.privacy': {
    en: 'Non-commercial use of the Open-Meteo free tier. Everything — fetching, downscaling and model training — runs in your browser. No API key, no server, no cookies, no tracking. The only hosts this page contacts are the two weather services themselves: Open-Meteo and SMHI.',
    sv: 'Icke-kommersiell användning av Open-Meteos kostnadsfria nivå. Allt — hämtning, nedskalning och modellträning — sker i din webbläsare. Ingen API-nyckel, ingen server, inga kakor, ingen spårning. De enda värdar sidan kontaktar är de två vädertjänsterna själva: Open-Meteo och SMHI.',
  },
  'footer.contact': {
    en: 'Found a forecast that was wrong, or a peak that should be on the list? <a href="methods.html#contact">Get in touch</a> — the email is behind a question so crawlers cannot lift it.',
    sv: 'Hittat en prognos som slog fel, eller en topp som borde finnas med? <a href="methods.html#contact">Hör av dig</a> — adressen ligger bakom en fråga så att robotar inte kommer åt den.',
  },
  'footer.builtFor': {
    en: 'Built for the Åre fjäll · elevations and coordinates are approximate summit positions',
    sv: 'Byggd för Årefjällen · höjder och koordinater är ungefärliga toppositioner',
  },

  /* ---- comparison page chrome ---- */
  'page.compare.title': { en: 'Where to go — ÅreWeather', sv: 'Vart du ska åka — ÅreWeather' },
  'page.compare.description': {
    en: 'Every peak in the Åre fjäll scored side by side for the next week, across eight mountain sports.',
    sv: 'Varje topp i Årefjällen betygsatt sida vid sida för veckan framåt, i åtta fjällsporter.',
  },
  'footer.attributionShort': {
    en: 'Weather data served by <a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a> under <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC&nbsp;BY&nbsp;4.0</a>, <b>modified</b>. <a href="methods.html">Full sources, licences and every calculation →</a>',
    sv: 'Väderdata levereras av <a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a> under <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC&nbsp;BY&nbsp;4.0</a>, <b>bearbetad</b>. <a href="methods.html">Alla källor, licenser och varje beräkning →</a>',
  },
  'footer.scoresOpinion': {
    en: 'Scores are opinions, not measurements — the thresholds are on the method page. This is not an avalanche forecast.',
    sv: 'Betygen är bedömningar, inte mätvärden — gränsvärdena finns på metodsidan. Det här är ingen lavinprognos.',
  },


  /* ---- method page ---- */
  'm.hero.1': {
    en: 'This page exists because a mountain forecast that you cannot check is just a confident-looking guess. Below is every data source with its licence, the terms this site operates under, and each formula it applies — including the ones that are approximations, labelled as such.',
    sv: 'Den här sidan finns för att en fjällprognos man inte kan kontrollera bara är en välklädd gissning. Nedan finns varje datakälla med sin licens, villkoren sajten arbetar under, och varje formel som används — inklusive de som är approximationer, tydligt märkta som sådana.',
  },
  'm.sources.1': {
    en: '1 · Sources and licences',
    sv: '1 · Källor och licenser',
  },
  'm.sources.2': {
    en: 'Every forecast value on this site originates from a national weather service and reaches your browser through <a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a>, which aggregates their open data. Nothing is scraped, and there is no intermediary server of mine in the path — your browser talks to Open-Meteo directly.',
    sv: 'Varje prognosvärde på sajten kommer från ett nationellt vädertjänstinstitut och når din webbläsare via <a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a>, som samlar deras öppna data. Ingenting skrapas, och det finns ingen mellanliggande server av mig i kedjan — din webbläsare pratar direkt med Open-Meteo.',
  },
  'm.sources.3': {
    en: 'Aggregator, ensemble and reanalysis',
    sv: 'Aggregator, ensemble och reanalys',
  },
  'm.sources.4': {
    en: 'Required attribution',
    sv: 'Obligatorisk källhänvisning',
  },
  'm.sources.5': {
    en: 'All of the above is served under CC BY 4.0 (except NOAA\'s, which is public domain). That licence requires three things: credit the source, link the licence, and state that changes were made. This site does all three, here and in the footer of every page:',
    sv: 'Allt ovanstående tillhandahålls under CC BY 4.0 (utom NOAA:s, som är fri från upphovsrätt). Licensen kräver tre saker: ange källan, länka licensen och tala om att materialet har bearbetats. Sajten gör alla tre, här och i sidfoten på varje sida:',
  },
  'm.sources.6': {
    en: 'Typefaces',
    sv: 'Typsnitt',
  },
  'm.terms.1': {
    en: '2 · Terms this site operates under',
    sv: '2 · Villkor sajten arbetar under',
  },
  'm.terms.2': {
    en: 'Open-Meteo free tier',
    sv: 'Open-Meteos kostnadsfria nivå',
  },
  'm.terms.3': {
    en: '<b>Non-commercial use only.</b> No subscriptions, no advertising, nothing sold. If this site ever carried ads or a paywall it would need a paid Open-Meteo plan.',
    sv: '<b>Endast icke-kommersiell användning.</b> Inga abonnemang, ingen annonsering, ingenting som säljs. Om sajten någonsin fick reklam eller betalvägg skulle den behöva ett betalt Open-Meteo-avtal.',
  },
  'm.terms.4': {
    en: '<b>SMHI asks the same of its open data:</b> use the documented APIs, do not mass-download per location, and do not fetch the same data twice. The station readings are therefore requested once for the whole country per parameter and reused for every mountain and both pages, rather than once per peak.',
    sv: '<b>SMHI ställer samma krav på sina öppna data:</b> använd de dokumenterade API:erna, ladda inte ned massvis per plats, och hämta inte samma data två gånger. Stationsavläsningarna hämtas därför en gång för hela landet per parameter och återanvänds för varje berg och båda sidorna, i stället för en gång per topp.',
  },
  'm.terms.5': {
    en: '<b>Under 10 000 API calls per day.</b> Worth understanding <i>whose</i> calls those are: this is a static site with no backend, so the requests come from each visitor\'s own browser and count against that visitor\'s own IP, not a shared server quota.',
    sv: '<b>Under 10 000 API-anrop per dygn.</b> Värt att förstå <i>vems</i> anrop det handlar om: det här är en statisk sajt utan backend, så anropen kommer från varje besökares egen webbläsare och räknas mot besökarens egen IP-adress, inte mot en delad serverkvot.',
  },
  'm.terms.6': {
    en: '<b>No API key</b>, and therefore no key of mine embedded in the page for anyone to lift.',
    sv: '<b>Ingen API-nyckel</b>, och därmed ingen nyckel av mig inbakad i sidan som någon kan plocka.',
  },
  'm.terms.7': {
    en: '<b>Attribution required</b>, as above.',
    sv: '<b>Källhänvisning krävs</b>, enligt ovan.',
  },
  'm.terms.8': {
    en: 'The app is deliberately frugal with calls regardless. Forecasts are cached in your browser for <span data-const="cacheMinutes"></span> minutes, ensemble data for three hours, and the machine-learning training set for a day; the model is retrained at most every <span data-const="APP.retrainAfterHours"></span> hours. Opening one mountain costs three requests, plus two more the first time its correction is trained.',
    sv: 'Appen är sparsam med anrop oavsett. Prognoser cachas i din webbläsare i <span data-const="cacheMinutes"></span> minuter, ensembledata i tre timmar och träningsdatan för maskininlärningen i ett dygn; modellen tränas om som mest var <span data-const="APP.retrainAfterHours"></span>:e timme. Att öppna ett berg kostar tre anrop, plus två till första gången dess korrigering tränas.',
  },
  'm.terms.9': {
    en: 'Exactly which requests are made',
    sv: 'Exakt vilka anrop som görs',
  },
  'm.terms.10': {
    en: 'So you can audit it rather than take my word:',
    sv: 'Så att du kan granska det i stället för att ta mitt ord för det:',
  },
  'm.terms.11': {
    en: 'Privacy',
    sv: 'Integritet',
  },
  'm.terms.12': {
    en: 'No analytics, no cookies, no fingerprinting, no accounts, no logs — I have no server to log anything with.',
    sv: 'Ingen analys, inga kakor, ingen fingeravtrycksspårning, inga konton, inga loggar — jag har ingen server att logga med.',
  },
  'm.terms.13': {
    en: 'Exactly two external hosts are contacted, and both are weather services: <code>open-meteo.com</code> for forecasts and <code>opendata-download-metobs.smhi.se</code> for station observations. No analytics, no embeds, no third-party fonts or scripts of any kind — typefaces are self-hosted precisely so that loading this page does not hand your IP address to a font CDN.',
    sv: 'Exakt två externa värdar kontaktas, och båda är vädertjänster: <code>open-meteo.com</code> för prognoser och <code>opendata-download-metobs.smhi.se</code> för stationsobservationer. Ingen analys, inga inbäddningar, inga typsnitt eller skript från tredje part av något slag — typsnitten ligger på egen server just för att sidan inte ska lämna ut din IP-adress till ett typsnitts-CDN.',
  },
  'm.terms.14': {
    en: 'Everything remembered is in your own browser\'s <code>localStorage</code>: the last forecast per mountain, your unit preference, and the trained correction weights. Clearing site data erases all of it. Nothing is ever sent anywhere.',
    sv: 'Allt som sparas ligger i din egen webbläsares <code>localStorage</code>: senaste prognosen per berg, ditt enhetsval och de tränade korrigeringsvikterna. Rensar du webbplatsdata försvinner allt. Ingenting skickas någonstans.',
  },
  'm.terms.15': {
    en: 'Open-Meteo receives the coordinates of the mountain you are looking at — a fixed summit position from a public list, never your location. SMHI receives no coordinates at all: the station request is for the whole country and the nearest ones are picked in your browser. This app never asks for or uses geolocation.',
    sv: 'Open-Meteo får koordinaterna för det berg du tittar på — en fast toppposition från en offentlig lista, aldrig din plats. SMHI får inga koordinater alls: stationsanropet gäller hela landet och de närmaste väljs ut i din webbläsare. Appen frågar aldrig efter och använder aldrig platstjänster.',
  },
  'm.pipeline.1': {
    en: '3 · The pipeline',
    sv: '3 · Kedjan',
  },
  'm.pipeline.2': {
    en: 'Six raw model forecasts go in; one elevation-resolved forecast comes out. In order:',
    sv: 'Sex råa modellprognoser in, en höjdupplöst prognos ut. I tur och ordning:',
  },
  'm.pipeline.3': {
    en: '<b>Fetch</b> — surface fields from six models at summit height, pressure-level fields from two, and an ensemble for spread.',
    sv: '<b>Hämta</b> — markparametrar från sex modeller på toppnivå, trycknivåer från två, och en ensemble för spridningen.',
  },
  'm.pipeline.4': {
    en: '<b>Weight</b> — combine the six into one estimate using weights learned from measured error at this exact point.',
    sv: '<b>Vikta</b> — väg samman de sex till en uppskattning med vikter inlärda från uppmätta fel för exakt denna punkt.',
  },
  'm.pipeline.5': {
    en: '<b>Correct</b> — apply the learned temperature and wind bias correction at the anchor height, if it passed hold-out validation.',
    sv: '<b>Korrigera</b> — applicera den inlärda korrigeringen av temperatur och vind på förankringsnivån, om den klarade utvärderingen på oanvänd data.',
  },
  'm.pipeline.6': {
    en: '<b>Build the sounding</b> — assemble a vertical profile from pressure-level data.',
    sv: '<b>Bygg profilen</b> — sätt samman en vertikalprofil från trycknivådata.',
  },
  'm.pipeline.7': {
    en: '<b>Downscale</b> — interpolate to every <span data-const="APP.bandStep"></span> m band between valley and summit, anchored to the corrected surface estimate.',
    sv: '<b>Skala ned</b> — interpolera till varje <span data-const="APP.bandStep"></span>-metersband mellan dal och topp, förankrat i den korrigerade markuppskattningen.',
  },
  'm.pipeline.8': {
    en: '<b>Derive</b> — wet bulb, phase, snow line, cloud base, wind chill, drift index.',
    sv: '<b>Härled</b> — våttemperatur, nederbördsfas, snögräns, molnbas, vindkyla och vindtransportindex.',
  },
  'm.pipeline.9': {
    en: '<b>Score</b> — turn all of it into two verdicts with named limiting factors.',
    sv: '<b>Betygsätt</b> — gör om alltihop till omdömen med namngivna begränsande faktorer.',
  },
  'm.ensemble.1': {
    en: '4 · Combining models',
    sv: '4 · Att väga samman modeller',
  },
  'm.ensemble.2': {
    en: 'Weighted mean',
    sv: 'Viktat medelvärde',
  },
  'm.ensemble.3': {
    en: 'Scalars are combined with a straight weighted mean over whichever models returned a value for that hour:',
    sv: 'Skalära storheter vägs samman med ett rakt viktat medelvärde över de modeller som lämnade ett värde för timmen:',
  },
  'm.ensemble.4': {
    en: 'model <em>i</em>\'s value for this hour',
    sv: 'värdet från modell <em>i</em> för den här timmen',
  },
  'm.ensemble.5': {
    en: 'that model\'s skill weight (below); models with no value drop out of both sums',
    sv: 'modellens träffsäkerhetsvikt (se nedan); modeller utan värde faller ur båda summorna',
  },
  'm.ensemble.6': {
    en: 'Wind is a vector, not a number',
    sv: 'Vind är en vektor, inte ett tal',
  },
  'm.ensemble.7': {
    en: 'Averaging wind <i>directions</i> is a classic way to produce nonsense — the mean of 350° and 10° is 180°, exactly backwards. Wind is decomposed into components first:',
    sv: 'Att medelvärdesbilda vind<i>riktningar</i> är ett klassiskt sätt att producera nonsens — medelvärdet av 350° och 10° blir 180°, exakt åt fel håll. Vinden delas därför först upp i komposanter:',
  },
  'm.ensemble.8': {
    en: 'wind speed and the direction it blows <i>from</i>, in degrees',
    sv: 'vindhastighet och den riktning det blåser <i>från</i>, i grader',
  },
  'm.ensemble.9': {
    en: 'eastward and northward components, which average correctly',
    sv: 'komposanter österut och norrut, som går att medelvärdesbilda korrekt',
  },
  'm.ensemble.10': {
    en: 'Skill weights',
    sv: 'Träffsäkerhetsvikter',
  },
  'm.ensemble.11': {
    en: 'Each model\'s weight is a softmax over its measured mean absolute error, gently tilted by a prior that reflects native grid resolution:',
    sv: 'Varje modells vikt är en softmax över dess uppmätta medelabsolutfel, försiktigt justerad med en förhandsvikt som speglar modellens egen upplösning:',
  },
  'm.ensemble.12': {
    en: 'mean absolute temperature error of model <em>i</em> against ERA5-Land over the training window',
    sv: 'medelabsolutfel i temperatur för modell <em>i</em> mot ERA5-Land under träningsperioden',
  },
  'm.ensemble.13': {
    en: 'prior, 0.90–1.35, higher for finer native grids',
    sv: 'förhandsvikt, 0,90–1,35, högre för finare rutnät',
  },
  'm.ensemble.14': {
    en: 'temperature of the softmax: a model 0.7 °C worse than the best gets ~1/e of its weight',
    sv: 'softmaxens temperatur: en modell som är 0,7 °C sämre än den bästa får ungefär 1/e av dess vikt',
  },
  'm.ensemble.15': {
    en: 'Weights are renormalised each hour over the models that actually returned data.',
    sv: 'Vikterna normeras om varje timme över de modeller som faktiskt lämnade data.',
  },
  'm.sounding.1': {
    en: '5 · The sounding, and why not a lapse rate',
    sv: '5 · Vertikalprofilen, och varför inte en fast temperaturgradient',
  },
  'm.sounding.2': {
    en: 'The usual shortcut for mountain temperature is to subtract a fixed 0.65 °C per 100 m. That is right on average and badly wrong exactly when it matters. On a clear, calm winter night in Jämtland, cold air drains into the valley and the profile inverts: Åre village sits at −18 °C while the summit of Åreskutan is at −6 °C. A fixed lapse rate does not just miss this — it gets the sign backwards, by twelve degrees.',
    sv: 'Den vanliga genvägen för bergstemperatur är att dra av fasta 0,65 °C per 100 m. Det stämmer i genomsnitt och slår grovt fel precis när det spelar roll. En klar och vindstilla vinternatt i Jämtland rinner kalluften ned i dalen och skiktningen vänder: Åre by ligger på −18 °C medan toppen av Åreskutan har −6 °C. En fast temperaturgradient missar inte bara detta — den får tecknet bakvänt, med tolv graders marginal.',
  },
  'm.sounding.3': {
    en: 'So instead the app requests temperature, humidity, wind and <b>geopotential height</b> at pressure levels <span data-const="levels"></span> hPa from ICON and GFS, giving a genuine vertical profile above the mountain. Heights are averaged across whichever models answered; the profile is sorted by height and interpolated linearly:',
    sv: 'I stället hämtar appen temperatur, fuktighet, vind och <b>geopotentiell höjd</b> på trycknivåerna <span data-const="levels"></span> hPa från ICON och GFS, vilket ger en verklig vertikalprofil över berget. Höjderna medelvärdesbildas över de modeller som svarade; profilen sorteras efter höjd och interpoleras linjärt:',
  },
  'm.sounding.4': {
    en: 'target elevation in metres',
    sv: 'önskad höjd i meter',
  },
  'm.sounding.5': {
    en: 'the first sounding level above <em>z</em>',
    sv: 'den första profilnivån ovanför <em>z</em>',
  },
  'm.sounding.6': {
    en: 'Outside the profile the gradient of the nearest layer is extended rather than clamped.',
    sv: 'Utanför profilen förlängs närmaste skikts gradient i stället för att klippas av.',
  },
  'm.sounding.7': {
    en: 'Anchoring',
    sv: 'Förankring',
  },
  'm.sounding.8': {
    en: 'The sounding knows the <i>shape</i> of the atmosphere; the six-model surface ensemble knows the best <i>value</i> at summit height. Both are kept: the offset between them is applied in full at the anchor and decays with distance, so near the mountain you get the ensemble and far above it you get the free atmosphere.',
    sv: 'Profilen känner atmosfärens <i>form</i>; markensemblen från sex modeller känner det bästa <i>värdet</i> på toppnivå. Båda behålls: skillnaden mellan dem appliceras fullt ut vid förankringspunkten och avtar med avståndet, så nära berget får du ensemblen och högt däröver den fria atmosfären.',
  },
  'm.sounding.9': {
    en: 'temperature interpolated from the sounding',
    sv: 'temperatur interpolerad ur profilen',
  },
  'm.sounding.10': {
    en: 'skill-weighted, bias-corrected surface ensemble at anchor height',
    sv: 'skickviktad och biaskorrigerad markensemble på förankringsnivån',
  },
  'm.sounding.11': {
    en: 'anchor elevation — the summit height passed to the API',
    sv: 'förankringshöjd — den toppnivå som skickas till API:et',
  },
  'm.sounding.12': {
    en: '<span data-const="PHYS.anchorScale"></span> m decay scale',
    sv: 'avtagandeskala på <span data-const="PHYS.anchorScale"></span> m',
  },
  'm.sounding.13': {
    en: 'Relative humidity is anchored the same way and clamped to 1–100 %. If no sounding is available for an hour, the app falls back to a constant <span data-const="PHYS.fallbackLapse"></span> °C/100 m and says so on the profile card.',
    sv: 'Den relativa luftfuktigheten förankras på samma sätt och begränsas till 1–100 %. Saknas profil för en timme faller appen tillbaka på konstanta <span data-const="PHYS.fallbackLapse"></span> °C/100 m och säger det på profilkortet.',
  },
  'm.sounding.14': {
    en: 'Wind with height',
    sv: 'Vind med höjden',
  },
  'm.sounding.15': {
    en: 'Near the ground the surface forecast wins — it knows about roughness and the boundary layer. Higher up, the free-atmosphere sounding takes over. Then terrain accelerates the flow towards an exposed summit, which is why a ridge feels twice as windy as the plateau below it.',
    sv: 'Nära marken vinner markprognosen — den känner till råhet och gränsskikt. Högre upp tar profilen för den fria atmosfären över. Sedan accelererar terrängen flödet mot en utsatt topp, vilket är varför en rygg känns dubbelt så blåsig som kalfjället nedanför.',
  },
  'm.sounding.16': {
    en: '<span data-const="PHYS.windBlendScale"></span> m blend scale',
    sv: 'övergångsskala på <span data-const="PHYS.windBlendScale"></span> m',
  },
  'm.sounding.17': {
    en: 'per-peak terrain exposure factor, 1.18–1.40 (see the mountain table)',
    sv: 'exponeringsfaktor för terrängen per topp, 1,18–1,40 (se bergtabellen)',
  },
  'm.sounding.18': {
    en: 'the surface model\'s own gust ratio, clamped to 1.15–2.30',
    sv: 'markmodellens egen byfaktor, begränsad till 1,15–2,30',
  },
  'm.sounding.19': {
    en: '<b>Approximation.</b> The exposure factor is hand-set per summit from terrain shape, not measured or fitted. It is the least rigorous number on this site.',
    sv: '<b>Approximation.</b> Exponeringsfaktorn är satt för hand per topp utifrån terrängens form, inte uppmätt eller anpassad. Det är den minst stringenta siffran på hela sajten.',
  },
  'm.sounding.20': {
    en: 'Precipitation with height',
    sv: 'Nederbörd med höjden',
  },
  'm.sounding.21': {
    en: '<span data-const="PHYS.orographicPerKm"></span> per kilometre of ascent — forced ascent wrings more water out of the same air',
    sv: '<span data-const="PHYS.orographicPerKm"></span> per kilometer stigning — påtvingad hävning pressar mer vatten ur samma luft',
  },
  'm.sounding.22': {
    en: '<b>Approximation.</b> A blunt linear stand-in for orographic enhancement, which really depends on wind direction relative to the slope and on airmass humidity.',
    sv: '<b>Approximation.</b> En trubbig linjär ersättare för orografisk förstärkning, som i verkligheten beror på vindriktningen i förhållande till sluttningen och på luftmassans fuktighet.',
  },
  'm.thermo.1': {
    en: '6 · Thermodynamics',
    sv: '6 · Termodynamik',
  },
  'm.thermo.2': {
    en: 'Dew point — Magnus-Tetens',
    sv: 'Daggpunkt — Magnus-Tetens',
  },
  'm.thermo.3': {
    en: 'air temperature, °C',
    sv: 'lufttemperatur, °C',
  },
  'm.thermo.4': {
    en: 'relative humidity, %',
    sv: 'relativ luftfuktighet, %',
  },
  'm.thermo.5': {
    en: 'Wet-bulb temperature — Stull (2011)',
    sv: 'Våttemperatur — Stull (2011)',
  },
  'm.thermo.6': {
    en: 'This is the variable that actually decides whether precipitation reaches you as snow. Air at +2 °C and 40 % humidity has a wet bulb near −1 °C, and it snows — which is why a forecast that places the snow line by air temperature puts it hundreds of metres too low.',
    sv: 'Det är den här storheten som faktiskt avgör om nederbörden når dig som snö. Luft på +2 °C och 40 % fuktighet har en våttemperatur nära −1 °C, och då snöar det — vilket är varför en prognos som placerar snögränsen efter lufttemperaturen lägger den hundratals meter för lågt.',
  },
  'm.thermo.7': {
    en: 'Stull, R. (2011). <i>Wet-Bulb Temperature from Relative Humidity and Air Temperature.</i> J. Appl. Meteor. Climatol. 50, 2267–2269. Valid roughly −20 to +50 °C and 5–99 % RH.',
    sv: 'Stull, R. (2011). <i>Wet-Bulb Temperature from Relative Humidity and Air Temperature.</i> J. Appl. Meteor. Climatol. 50, 2267–2269. Giltig ungefär mellan −20 och +50 °C och 5–99 % relativ fuktighet.',
  },
  'm.thermo.8': {
    en: 'Precipitation phase and the snow line',
    sv: 'Nederbördsfas och snögräns',
  },
  'm.thermo.9': {
    en: 'Snow ratio — millimetres of water to centimetres of snow',
    sv: 'Snöförhållande — millimeter vatten till centimeter snö',
  },
  'm.thermo.10': {
    en: 'Ten to one is the folk rule and it is wrong at both ends: warm snow packs dense, and the driest cold smoke sits near −12 °C. A step function of air temperature:',
    sv: 'Tio till ett är folkregeln, och den är fel i båda ändar: varm snö packar sig tät, och den torraste kallröken ligger runt −12 °C. En stegfunktion av lufttemperaturen:',
  },
  'm.thermo.11': {
    en: '<b>Approximation.</b> Real snow density also depends on wind, riming and crystal habit, none of which are modelled here.',
    sv: '<b>Approximation.</b> Verklig snödensitet beror också på vind, nedisning och kristallform, och inget av det är modellerat här.',
  },
  'm.thermo.12': {
    en: 'Wind chill — Environment Canada / JAG-TI',
    sv: 'Vindkyla — Environment Canada / JAG-TI',
  },
  'm.thermo.13': {
    en: 'wind speed in km/h at 10 m',
    sv: 'vindhastighet i km/h på 10 m',
  },
  'm.thermo.14': {
    en: 'Defined only for <em>T</em> ≤ 10 °C and <em>V</em> ≥ 4.8 km/h; outside that the air temperature is returned unchanged.',
    sv: 'Definierad endast för <em>T</em> ≤ 10 °C och <em>V</em> ≥ 4,8 km/h; utanför det returneras lufttemperaturen oförändrad.',
  },
  'm.thermo.15': {
    en: 'Humidex, and one "feels like" number',
    sv: 'Humidex, och ett enda ”känns som”-tal',
  },
  'm.thermo.16': {
    en: 'The warm-side wind term is my own addition: 12 m/s on a ridge is worth a couple of degrees even in July. It is not part of the standard humidex.',
    sv: 'Vindtermen på den varma sidan är mitt eget tillägg: 12 m/s uppe på en rygg är värt ett par grader även i juli. Den ingår inte i standardhumidex.',
  },
  'm.thermo.17': {
    en: 'Cloud base — Espy\'s rule',
    sv: 'Molnbas — Espys regel',
  },
  'm.thermo.18': {
    en: '<b>Approximation.</b> Strictly the lifting condensation level for a parcel from the valley floor. The summit is additionally reported as "in cloud" when its interpolated humidity exceeds 92 %.',
    sv: '<b>Approximation.</b> Strikt sett kondensationsnivån för en luftpaket som lyfts från dalbotten. Toppen redovisas dessutom som ”i moln” när dess interpolerade luftfuktighet överstiger 92 %.',
  },
  'm.thermo.19': {
    en: 'Wind loading index',
    sv: 'Index för vindtransport',
  },
  'm.thermo.20': {
    en: 'Not an avalanche forecast — only the meteorological half of the question: is there loose snow available, and is the wind strong enough to move it?',
    sv: 'Ingen lavinprognos — bara den meteorologiska halvan av frågan: finns det lös snö tillgänglig, och är vinden stark nog att flytta den?',
  },
  'm.thermo.21': {
    en: 'last 6 hours in full, plus a quarter of the last 24',
    sv: 'de senaste 6 timmarna fullt ut, plus en fjärdedel av det senaste dygnet',
  },
  'm.thermo.22': {
    en: 'summit wind, m/s — <span data-const="PHYS.driftThreshold"></span> m/s is roughly where dry loose snow starts moving',
    sv: 'vind på toppen, m/s — <span data-const="PHYS.driftThreshold"></span> m/s är ungefär där torr lössnö börjar röra sig',
  },
  'm.thermo.23': {
    en: '<b>Approximation, and a deliberately crude one.</b> It ignores aspect, slope angle, terrain traps and the entire snowpack history — that is to say, most of what an avalanche forecast is about.',
    sv: '<b>Approximation, och en medvetet grov sådan.</b> Den bortser från väderstreck, lutning, terrängfällor och hela snötäckets historia — alltså från det mesta som en lavinprognos handlar om.',
  },
  'm.ml.1': {
    en: '7 · The machine learning',
    sv: '7 · Maskininlärningen',
  },
  'm.ml.2': {
    en: 'All of it trains in your browser, on demand, from public data. Nothing is precomputed by me and nothing is sent anywhere.',
    sv: 'Allt tränas i din webbläsare, vid behov, på offentliga data. Ingenting är förberäknat av mig och ingenting skickas någonstans.',
  },
  'm.ml.3': {
    en: 'Training data',
    sv: 'Träningsdata',
  },
  'm.ml.4': {
    en: '<span data-const="APP.trainingDays"></span> days of <i>archived forecasts</i> from every model — what each one predicted at the time — against ERA5-Land reanalysis for the same hours and the same point. The window ends six days ago because the reanalysis lags.',
    sv: '<span data-const="APP.trainingDays"></span> dygn av <i>arkiverade prognoser</i> från varje modell — det var och en förutsade vid tillfället — mot reanalysen ERA5-Land för samma timmar och samma punkt. Perioden slutar sex dygn bakåt eftersom reanalysen släpar efter.',
  },
  'm.ml.5': {
    en: 'Standardisation',
    sv: 'Standardisering',
  },
  'm.ml.6': {
    en: 'Ridge regression on the residual',
    sv: 'Ridgeregression på residualen',
  },
  'm.ml.7': {
    en: 'The target is not temperature — it is what the weighted ensemble got <i>wrong</i>. Solved in closed form by Gaussian elimination with partial pivoting; the intercept is not penalised.',
    sv: 'Målvariabeln är inte temperaturen — det är vad den viktade ensemblen fick <i>fel</i>. Löses på sluten form med gausselimination och partiell pivotering; interceptet straffas inte.',
  },
  'm.ml.8': {
    en: 'standardised feature matrix, ~1000 rows × 9 columns',
    sv: 'standardiserad variabelmatris, ungefär 1 000 rader × 9 kolumner',
  },
  'm.ml.9': {
    en: 'ridge penalty — with this little data, a wide unregularised fit would memorise noise',
    sv: 'ridge-straff — med så här lite data skulle en bred oreglerad anpassning memorera brus',
  },
  'm.ml.10': {
    en: 'Features',
    sv: 'Variabler',
  },
  'm.ml.11': {
    en: 'Nine, each with a physical reason to be there — a small model is the honest choice for a thousand rows:',
    sv: 'Nio stycken, var och en med ett fysikaliskt skäl att finnas med — en liten modell är det ärliga valet för tusen rader:',
  },
  'm.ml.12': {
    en: 'Precipitation probability — logistic regression',
    sv: 'Nederbördsrisk — logistisk regression',
  },
  'm.ml.13': {
    en: '√(ensemble precipitation), fraction of models that are wet, humidity, cloud cover',
    sv: '√(ensemblens nederbörd), andelen modeller med nederbörd, luftfuktighet, molntäcke',
  },
  'm.ml.14': {
    en: 'Fitted by batch gradient descent, 500 iterations, L2 penalty 0.01.',
    sv: 'Anpassad med batchvis gradientnedstigning, 500 iterationer, L2-straff 0,01.',
  },
  'm.ml.15': {
    en: 'Validation, and the right to switch itself off',
    sv: 'Utvärdering, och rätten att stänga av sig själv',
  },
  'm.ml.16': {
    en: 'The last 25 % of the window is held out as a contiguous block — not a random split, which would leak information across neighbouring hours. Each learned component must beat the baseline it replaces on that block by at least 0.5 %, or it is disabled and the app tells you so on the learning-log card.',
    sv: 'De sista 25 % av perioden hålls undan som ett sammanhängande block — inte en slumpmässig uppdelning, som skulle läcka information mellan närliggande timmar. Varje inlärd komponent måste slå den utgångspunkt den ersätter på det blocket med minst 0,5 %, annars stängs den av och appen säger det på inlärningsloggens kort.',
  },
  'm.ml.17': {
    en: '<b>The honest caveat about the target.</b> ERA5-Land is a ~9 km reanalysis grid, not a summit weather station. It is a good reference for systematic model bias and a poor one for the last few hundred metres of local terrain effect. A correction trained this way makes the grid-scale forecast better; it cannot know that a particular gully funnels wind.',
    sv: '<b>Det ärliga förbehållet om facit.</b> ERA5-Land är ett reanalysrutnät på ungefär 9 km, inte en väderstation på toppen. Det är en bra referens för systematiska modellfel och en dålig för de sista hundra metrarnas lokala terrängeffekt. En korrigering tränad så här gör prognosen bättre på rutnätets skala; den kan inte veta att en viss ravin tratta&shy;r vinden.',
  },
  'm.ml.18': {
    en: 'Checking against thermometers',
    sv: 'Kontroll mot termometrar',
  },
  'm.ml.19': {
    en: 'Everything above is model output corrected against <i>another model\'s</i> best estimate of the past. The ground-truth panel on the forecast page closes that loop with actual instruments: SMHI\'s automatic stations, read live.',
    sv: 'Allt ovanstående är modellutdata korrigerat mot <i>en annan modells</i> bästa uppskattning av det förflutna. Panelen ”Verkligheten” på prognossidan sluter cirkeln med riktiga instrument: SMHI:s automatstationer, avlästa direkt.',
  },
  'm.ml.20': {
    en: 'Stations are ranked by distance with a penalty for being at a very different height, since a valley station 5 km away says less about a summit than a ridge station 12 km away:',
    sv: 'Stationerna rangordnas efter avstånd med ett avdrag för att ligga på kraftigt avvikande höjd, eftersom en dalstation 5 km bort säger mindre om en topp än en station uppe på ryggen 12 km bort:',
  },
  'm.ml.21': {
    en: 'Distance is the great-circle distance. Stations beyond <span data-const="SMHI.radiusKm"></span> km are ignored entirely.',
    sv: 'Avståndet är storcirkelavståndet. Stationer längre bort än <span data-const="SMHI.radiusKm"></span> km ignoreras helt.',
  },
  'm.ml.22': {
    en: 'The forecast is then interpolated down the sounding to that station\'s exact elevation and the hour it reported, and the two are put side by side. Every comparison is appended to a rolling log in your browser — deduplicated by station and hour, capped at <span data-const="SMHI.logLimit"></span> entries — so that after a few days of use the app can show you its own measured bias at that peak, against a thermometer rather than a reanalysis grid.',
    sv: 'Prognosen interpoleras sedan ned genom profilen till stationens exakta höjd och den timme den rapporterade, och de två ställs sida vid sida. Varje jämförelse läggs till i en rullande logg i din webbläsare — utan dubbletter per station och timme, med tak på <span data-const="SMHI.logLimit"></span> poster — så att appen efter några dygns användning kan visa sitt eget uppmätta fel på just den toppen, mot en termometer i stället för mot ett reanalysrutnät.',
  },
  'm.ml.23': {
    en: '<b>What this comparison is not.</b> A station is a different <i>place</i>, not merely a different altitude of the same one. The difference you see mixes genuine downscaling error with the unavoidable fact that the weather 15 km away is different weather. It is a sanity check, not a verification — and observations are never fed back into the forecast, because a valley thermometer cannot correct a summit prediction without inventing information.',
    sv: '<b>Vad jämförelsen inte är.</b> En station ligger på en annan <i>plats</i>, inte bara på en annan höjd av samma plats. Skillnaden du ser blandar verkligt nedskalningsfel med det ofrånkomliga faktum att vädret 15 km bort är ett annat väder. Det är en rimlighetskontroll, inte en validering — och observationer matas aldrig tillbaka in i prognosen, eftersom en termometer i dalen inte kan korrigera en toppprognos utan att hitta på information.',
  },
  'm.ml.24': {
    en: 'Ensemble spread',
    sv: 'Ensemblespridning',
  },
  'm.ml.25': {
    en: 'The spread is computed at summit height and shifted to the displayed band, which assumes uncertainty is roughly constant through the depth of one mountain.',
    sv: 'Spridningen beräknas på toppnivå och förskjuts till det band som visas, vilket förutsätter att osäkerheten är ungefär konstant genom ett bergs höjdskillnad.',
  },
  'm.scoring.1': {
    en: '8 · Activity scores',
    sv: '8 · Aktivitetsbetyg',
  },
  'm.scoring.2': {
    en: 'Each score starts from a base and loses points to named penalties, so the interface can tell you <i>what</i> is wrong rather than only that something is. A <code>ramp</code> costs <code>clamp((value − from) × slope, 0, cap)</code> points; a <code>flag</code> costs a flat amount when its condition holds — or when it does not, if it is inverted; a <code>bonus</code> adds points the same way. The result is clamped to 0–100.',
    sv: 'Varje betyg utgår från en grundnivå och förlorar poäng till namngivna avdrag, så att gränssnittet kan berätta <i>vad</i> som är fel i stället för bara att något är det. En <code>ramp</code> kostar <code>clamp((värde − from) × slope, 0, cap)</code> poäng; en <code>flag</code> kostar ett fast belopp när dess villkor är uppfyllt — eller när det inte är det, om den är inverterad; en <code>bonus</code> lägger till poäng på samma sätt. Resultatet begränsas till 0–100.',
  },
  'm.scoring.3': {
    en: 'These tables are generated from the same configuration the scorer runs on — they cannot drift out of date.',
    sv: 'Tabellerna genereras ur samma konfiguration som betygsättningen körs på — de kan inte bli inaktuella.',
  },
  'm.scoring.4': {
    en: 'Seasons',
    sv: 'Säsonger',
  },
  'm.scoring.5': {
    en: 'An activity with a snow-cover season returns <b>Out of season</b> outright rather than a number — a ski tour in July is not a bad day out, it is not a day out at all. When no model reports snow depth, a summer sanity check stands in: high summit temperature and a freezing level far above the summit means no snow, whatever the missing field would have said.',
    sv: 'En aktivitet med en snösäsong svarar rakt av <b>Utanför säsong</b> i stället för en siffra — en topptur i juli är inte en dålig dag ute, det är ingen dag ute alls. När ingen modell rapporterar snödjup träder en sommarkontroll in: hög topptemperatur och en nollgradig nivå långt över toppen betyder ingen snö, vad det saknade fältet än skulle ha sagt.',
  },
  'm.scoring.6': {
    en: 'Where each activity is offered',
    sv: 'Var varje aktivitet erbjuds',
  },
  'm.scoring.7': {
    en: 'A bike park lap needs a lift and snowkiting needs open ground, so activities are gated on the terrain a peak actually has rather than offered everywhere and scored badly.',
    sv: 'Ett varv i cykelparken kräver en lift och snowkiting kräver öppen mark, så aktiviteter styrs av vilken terräng en topp faktiskt har i stället för att erbjudas överallt och få dåligt betyg.',
  },
  'm.scoring.8': {
    en: 'Verdict words',
    sv: 'Omdömesord',
  },
  'm.scoring.9': {
    en: '<b>These are opinions, not measurements.</b> The thresholds are my judgement about what makes a day unpleasant or dangerous, tuned for the Åre fjäll. They are in <code>js/config.js</code> and you should change them if your tolerance differs from mine.',
    sv: '<b>Det här är bedömningar, inte mätvärden.</b> Gränsvärdena är min uppfattning om vad som gör en dag obehaglig eller farlig, avstämd mot Årefjällen. De finns i <code>js/config.js</code> och du bör ändra dem om din tolerans skiljer sig från min.',
  },
  'm.constants.1': {
    en: '9 · Constants and mountains',
    sv: '9 · Konstanter och berg',
  },
  'm.constants.2': {
    en: 'Read live from the running configuration.',
    sv: 'Läses direkt ur den konfiguration som körs.',
  },
  'm.constants.3': {
    en: 'Physical tunables',
    sv: 'Fysikaliska parametrar',
  },
  'm.constants.4': {
    en: 'The mountains',
    sv: 'Bergen',
  },
  'm.limits.1': {
    en: '10 · What this is not',
    sv: '10 · Vad det här inte är',
  },
  'm.limits.2': {
    en: '<b>This is not an avalanche forecast.</b> The wind-loading index and new-snow figures are meteorological indices. They know nothing about aspect, slope angle, terrain traps, or the buried weak layer that decides whether a slope releases. For avalanche danger in the Swedish fjäll use <a href="https://www.lavinprognoser.se" target="_blank" rel="noopener">lavinprognoser.se</a>; for official warnings, <a href="https://www.smhi.se" target="_blank" rel="noopener">SMHI</a>.',
    sv: '<b>Det här är ingen lavinprognos.</b> Vindtransportindexet och nysnösiffrorna är meteorologiska index. De vet ingenting om väderstreck, lutning, terrängfällor eller det begravda svaga lagret som avgör om en sluttning släpper. För lavinfara i de svenska fjällen, använd <a href="https://www.lavinprognoser.se" target="_blank" rel="noopener">lavinprognoser.se</a>; för officiella varningar, <a href="https://www.smhi.se" target="_blank" rel="noopener">SMHI</a>.',
  },
  'm.limits.3': {
    en: '<b>Not a weather station.</b> Every number is a model output, downscaled. No observation from the mountain itself enters the calculation.',
    sv: '<b>Ingen väderstation.</b> Varje siffra är modellutdata, nedskalat. Ingen observation från själva berget går in i beräkningen.',
  },
  'm.limits.4': {
    en: '<b>Not validated against summit observations.</b> The reported skill is against reanalysis, which is the best free reference available but not ground truth.',
    sv: '<b>Inte validerat mot observationer på toppen.</b> Träffsäkerheten som redovisas är mot reanalys, vilket är den bästa fria referens som finns men inte facit.',
  },
  'm.limits.5': {
    en: '<b>Coordinates and elevations are approximate</b> summit positions, hand-entered.',
    sv: '<b>Koordinater och höjder är ungefärliga</b> topplägen, inmatade för hand.',
  },
  'm.limits.6': {
    en: '<b>Terrain exposure factors are hand-set</b>, not fitted to anything.',
    sv: '<b>Exponeringsfaktorerna för terrängen är satta för hand</b>, inte anpassade till något.',
  },
  'm.limits.7': {
    en: '<b>The forecast degrades with range.</b> Beyond about three days the ensemble spread on the hourly chart is more informative than the line through it.',
    sv: '<b>Prognosen tappar i kvalitet med längden.</b> Bortom ungefär tre dygn säger ensemblespridningen i timdiagrammet mer än linjen genom den.',
  },
  'm.limits.8': {
    en: 'The source is public: every formula on this page is in <code>js/physics.js</code>, <code>js/ml.js</code> and <code>js/forecast.js</code>, and <code>tools/selftest.mjs</code> checks them against known cases offline.',
    sv: 'Källkoden är offentlig: varje formel på den här sidan finns i <code>js/physics.js</code>, <code>js/ml.js</code> och <code>js/forecast.js</code>, och <code>tools/selftest.mjs</code> kontrollerar dem mot kända fall utan nätverk.',
  },
  'm.contact.1': {
    en: '11 · Contact',
    sv: '11 · Kontakt',
  },
  'm.contact.2': {
    en: 'Wrong forecast, broken chart, a peak that should be on the list, or an exposure factor you think is nonsense — all of it is welcome. There are two ways to reach me.',
    sv: 'Fel prognos, trasigt diagram, en topp som borde finnas med, eller en exponeringsfaktor du tycker är nonsens — allt är välkommet. Det finns två sätt att nå mig.',
  },
  'm.contact.3': {
    en: 'Bugs and suggestions — the better channel',
    sv: 'Buggar och förslag — den bättre kanalen',
  },
  'm.contact.4': {
    en: 'The source is public, so an issue is easier to act on than an email: it keeps the discussion attached to the code and anyone else hitting the same thing can find it.',
    sv: 'Källkoden är offentlig, så ett ärende är lättare att agera på än ett mejl: det håller diskussionen kopplad till koden, och alla andra som stöter på samma sak kan hitta den.',
  },
  'm.contact.5': {
    en: '<a class="nav-link" id="issues-link" href="#" target="_blank" rel="noopener">Open an issue on GitHub →</a>',
    sv: '<a class="nav-link" id="issues-link" href="#" target="_blank" rel="noopener">Öppna ett ärende på GitHub →</a>',
  },
  'm.contact.6': {
    en: 'Email',
    sv: 'E-post',
  },
  'm.contact.7': {
    en: 'The address is not written anywhere in this page\'s source — only a ciphertext is. The key is derived from the answer below, so answering is what produces the address. It costs you five seconds and costs an address-harvesting crawler more than it is willing to spend.',
    sv: 'Adressen står ingenstans i sidans källkod — bara en krypterad text gör det. Nyckeln härleds ur svaret nedan, så det är svaret som framställer adressen. Det kostar dig fem sekunder och kostar en adressinsamlande robot mer än den är beredd att lägga.',
  },
  'm.contact.9': {
    en: 'Proton Mail, so it is end-to-end encrypted if you write from Proton too. I answer when I am not on a mountain, which in winter can take a few days.',
    sv: 'Proton Mail, så det är totalsträckskrypterat om du också skriver från Proton. Jag svarar när jag inte är uppe på ett berg, vilket på vintern kan dröja några dagar.',
  },
  'm.contact.10': {
    en: 'If you are reporting a forecast that was wrong',
    sv: 'Om du rapporterar en prognos som slog fel',
  },
  'm.contact.11': {
    en: 'This is the useful kind of bug report, and the hardest to act on without detail. Include:',
    sv: 'Det är den nyttiga sortens felrapport, och den svåraste att agera på utan detaljer. Ta med:',
  },
  'm.contact.12': {
    en: '<b>Which mountain, and the exact hour</b> — the forecast changes every hour and I cannot reconstruct what you saw without it.',
    sv: '<b>Vilket berg, och exakt vilken timme</b> — prognosen ändras varje timme och jag kan inte rekonstruera vad du såg utan det.',
  },
  'm.contact.13': {
    en: '<b>What the app said and what actually happened</b> — "it said −4 °C and 8 m/s at the summit at 09:00, it was more like −12 °C and blowing hard".',
    sv: '<b>Vad appen sa och vad som faktiskt hände</b> — ”den sa −4 °C och 8 m/s på toppen klockan 09, det var snarare −12 °C och full storm”.',
  },
  'm.contact.14': {
    en: '<b>Roughly when you loaded it</b>, since a forecast made three days out is a different claim from one made that morning.',
    sv: '<b>Ungefär när du laddade den</b>, eftersom en prognos ställd tre dygn i förväg är ett annat påstående än en ställd samma morgon.',
  },
  'm.contact.15': {
    en: 'Whether the <b>learning log</b> said the correction was active or disabled.',
    sv: 'Om <b>inlärningsloggen</b> sa att korrigeringen var aktiv eller avstängd.',
  },
  'm.contact.16': {
    en: 'Systematic errors are the interesting ones. If a peak is always too warm, or the wind is always understated on one particular ridge, that is a fixable bug in the exposure factor or the downscaling — not just weather being weather.',
    sv: 'Systematiska fel är de intressanta. Om en topp alltid är för varm, eller vinden alltid underskattas på en viss rygg, är det en åtgärdbar bugg i exponeringsfaktorn eller nedskalningen — inte bara väder som är väder.',
  },
  'm.contact.18': {
    en: 'Licence information last checked <span id="verified-date"></span>. Licences change — if you are reading this much later, verify against the linked sources.',
    sv: 'Licensuppgifterna kontrollerades senast <span id="verified-date"></span>. Licenser ändras — läser du det här långt senare, kontrollera mot de länkade källorna.',
  },

  /* ---- method page chrome ---- */
  'page.methods.title': { en: 'Method, sources & licences — ÅreWeather', sv: 'Metod, källor och licenser — ÅreWeather' },
  'page.methods.description': {
    en: 'Every calculation ÅreWeather makes, every data source it uses, and the licence terms it operates under.',
    sv: 'Varje beräkning ÅreWeather gör, varje datakälla den använder och licensvillkoren den arbetar under.',
  },
  'methods.h1': { en: 'Every number, and where it comes from', sv: 'Varje siffra, och var den kommer ifrån' },
  'methods.contents': { en: 'Contents', sv: 'Innehåll' },
  'pill.noTracking': { en: 'No tracking', sv: 'Ingen spårning' },
  'pill.noCookies': { en: 'No cookies', sv: 'Inga kakor' },
  'pill.noThirdParty': { en: 'No trackers or third-party embeds', sv: 'Inga spårare eller inbäddningar' },
  'pill.nonCommercial': { en: 'Non-commercial', sv: 'Icke-kommersiell' },
  'pill.verified': { en: 'Licences checked {date}', sv: 'Licenser kontrollerade {date}' },
  'gate.unlock': { en: 'Unlock', sv: 'Lås upp' },
  'gate.copy': { en: 'Copy', sv: 'Kopiera' },
  'gate.copied': { en: 'Copied', sv: 'Kopierat' },
  'gate.copyManual': { en: 'Select it manually', sv: 'Markera den manuellt' },
  'gate.deriving': { en: 'Deriving key…', sv: 'Härleder nyckel…' },
  'gate.wrong': { en: 'That is not it. The number is on the Åreskutan chip at the top of the forecast page.', sv: 'Inte riktigt. Siffran står på Åreskutan-knappen högst upp på prognossidan.' },
  'gate.ok': { en: 'Decrypted.', sv: 'Dekrypterat.' },

  /* ---- method page tables ---- */
  'tbl.provider': { en: 'Provider', sv: 'Leverantör' },
  'tbl.modelUsed': { en: 'Model used here', sv: 'Modell som används här' },
  'tbl.licence': { en: 'Licence', sv: 'Licens' },
  'tbl.credit': { en: 'Credit required', sv: 'Källhänvisning som krävs' },
  'tbl.source': { en: 'Source', sv: 'Källa' },
  'tbl.role': { en: 'Role', sv: 'Roll' },
  'tbl.notes': { en: 'Notes', sv: 'Noteringar' },
  'tbl.typeface': { en: 'Typeface', sv: 'Typsnitt' },
  'tbl.by': { en: 'By', sv: 'Av' },
  'tbl.text': { en: 'Text', sv: 'Licenstext' },
  'tbl.included': { en: 'included in this repository', sv: 'finns i det här arkivet' },
  'tbl.endpoint': { en: 'Endpoint', sv: 'Slutpunkt' },
  'tbl.whatFor': { en: 'What for', sv: 'Till vad' },
  'tbl.when': { en: 'When', sv: 'När' },
  'tbl.cachedFor': { en: 'Cached for', sv: 'Cachas i' },
  'tbl.airTemp': { en: 'Air temperature', sv: 'Lufttemperatur' },
  'tbl.ratio': { en: 'Ratio', sv: 'Förhållande' },
  'tbl.gives': { en: '1 mm of water gives', sv: '1 mm vatten ger' },
  'tbl.feature': { en: 'Feature', sv: 'Variabel' },
  'tbl.featureWhy': { en: 'Why it is in the model', sv: 'Varför den finns med' },
  'tbl.factor': { en: 'Factor', sv: 'Faktor' },
  'tbl.triggers': { en: 'Triggers on', sv: 'Utlöses av' },
  'tbl.effect': { en: 'Effect on the score', sv: 'Effekt på betyget' },
  'tbl.reasoning': { en: 'Reasoning', sv: 'Motivering' },
  'tbl.activity': { en: 'Activity', sv: 'Aktivitet' },
  'tbl.runsWhen': { en: 'Runs when', sv: 'Gäller när' },
  'tbl.otherwise': { en: 'Otherwise', sv: 'Annars' },
  'tbl.peak': { en: 'Peak', sv: 'Topp' },
  'tbl.terrain': { en: 'Terrain', sv: 'Terräng' },
  'tbl.offered': { en: 'Activities offered', sv: 'Aktiviteter som erbjuds' },
  'tbl.score': { en: 'Score', sv: 'Betyg' },
  'tbl.verdict': { en: 'Verdict', sv: 'Omdöme' },
  'tbl.constant': { en: 'Constant', sv: 'Konstant' },
  'tbl.value': { en: 'Value', sv: 'Värde' },
  'tbl.controls': { en: 'What it controls', sv: 'Vad den styr' },
  'tbl.mountain': { en: 'Mountain', sv: 'Berg' },
  'tbl.summit': { en: 'Summit', sv: 'Topp' },
  'tbl.valley': { en: 'Valley', sv: 'Dal' },
  'tbl.vertical': { en: 'Vertical', sv: 'Höjdskillnad' },
  'tbl.exposure': { en: 'Exposure', sv: 'Exponering' },
  'tbl.position': { en: 'Position', sv: 'Position' },
  'tbl.base': { en: 'base', sv: 'grundnivå' },
  'tbl.windowHours': { en: '{n}-hour window', sv: '{n}-timmarsfönster' },
  'tbl.needsTerrain': { en: 'needs <code>{feature}</code> terrain', sv: 'kräver terräng av typen <code>{feature}</code>' },
  'tbl.snowMin': { en: 'snow depth ≥ {n} m', sv: 'snödjup ≥ {n} m' },
  'tbl.snowMax': { en: 'snow depth ≤ {n} m', sv: 'snödjup ≤ {n} m' },
  'tbl.and': { en: ' and ', sv: ' och ' },
  'tbl.isFalse': { en: ' is <b>false</b>', sv: ' är <b>falskt</b>' },
  'tbl.above': { en: '<code>{metric}</code> above {n}', sv: '<code>{metric}</code> över {n}' },
  'tbl.flatCost': { en: '−{n} flat', sv: '−{n} fast' },
  'tbl.rampCost': { en: '{sign}(value − {from}) × {slope}, capped at {cap}', sv: '{sign}(värde − {from}) × {slope}, tak {cap}' },

  /* ---- method page generated content ---- */
  'role.aggregator': { en: 'Aggregates and serves every model above', sv: 'Samlar och levererar alla modeller ovan' },
  'role.ensemble': { en: 'Probability and spread', sv: 'Sannolikhet och spridning' },
  'role.reanalysis': { en: 'Training target for the bias correction', sv: 'Facit vid träning av biaskorrigeringen' },
  'role.observations': { en: 'Live station readings, for the ground-truth panel', sv: 'Aktuella stationsavläsningar, till panelen Verkligheten' },
  'tbl.terms': { en: 'Terms', sv: 'Villkor' },
  'req.surface': { en: 'Surface fields from {n} models at summit height, 7 days hourly', sv: 'Markparametrar från {n} modeller på toppnivå, 7 dygn timme för timme' },
  'req.profile': { en: 'Pressure-level sounding ({n} levels) plus freezing level, visibility, CAPE, snow depth', sv: 'Vertikalprofil från trycknivåer ({n} nivåer) plus nollgradig nivå, sikt, CAPE och snödjup' },
  'req.ensemble': { en: 'Ensemble members for spread and probability', sv: 'Ensemblemedlemmar för spridning och sannolikhet' },
  'req.history': { en: 'What every model predicted over the past {n} days', sv: 'Vad varje modell förutsade under de senaste {n} dygnen' },
  'req.archive': { en: 'ERA5-Land reanalysis for the same hours — the training target', sv: 'Reanalysen ERA5-Land för samma timmar — facit vid träningen' },
  'req.smhi': { en: 'Latest hour of {n} observed parameters for every station in Sweden', sv: 'Senaste timmen av {n} observerade parametrar för varje station i Sverige' },
  'req.whenOpen': { en: 'Opening a mountain', sv: 'När ett berg öppnas' },
  'req.whenTrain': { en: 'First visit per mountain, then every {n} hours', sv: 'Första besöket per berg, sedan var {n}:e timme' },
  'req.whenWithAbove': { en: 'With the request above', sv: 'Tillsammans med anropet ovan' },
  'req.whenSmhi': { en: 'Once per parameter, shared by every mountain and both pages', sv: 'En gång per parameter, delat av alla berg och båda sidorna' },
  'req.min20': { en: '20 minutes', sv: '20 minuter' },
  'req.min30': { en: '30 minutes', sv: '30 minuter' },
  'req.hours3': { en: '3 hours', sv: '3 timmar' },
  'req.hours24': { en: '24 hours', sv: '24 timmar' },
  'ratio.above1': { en: 'above +1 °C', sv: 'över +1 °C' },
  'ratio.below20': { en: 'below −20 °C', sv: 'under −20 °C' },
  'sources.ukmoCaveat': {
    en: '<b>* One licence worth your attention.</b> Open-Meteo serves everything from its API under CC BY 4.0, but the UK Met Office global data is published upstream under CC BY-<b>SA</b> — a share-alike licence, which asks that adapted material be released under the same terms. Since this app adapts the data heavily, the tidy options are: accept it and license the displayed forecast CC BY-SA too, or drop that one model. It is the lowest-weighted and least locally relevant of the six over Jämtland, so removing <code>ukmo_seamless</code> from <code>MODELS</code> in <code>js/config.js</code> costs almost nothing. Currently it is <b>{state}</b>.',
    sv: '<b>* En licens värd din uppmärksamhet.</b> Open-Meteo levererar allt från sitt API under CC BY 4.0, men brittiska Met Offices globala data publiceras i ursprungskällan under CC BY-<b>SA</b> — en dela-lika-licens som kräver att bearbetat material släpps under samma villkor. Eftersom appen bearbetar data kraftigt är de rena alternativen: acceptera det och licensiera även den visade prognosen som CC BY-SA, eller stryka den modellen. Den är den lägst viktade och minst lokalt relevanta av de sex över Jämtland, så att ta bort <code>ukmo_seamless</code> ur <code>MODELS</code> i <code>js/config.js</code> kostar nästan ingenting. Just nu är den <b>{state}</b>.',
  },
  'sources.stillInUse': { en: 'still in use', sv: 'fortfarande i bruk' },
  'sources.notInUse': { en: 'not in use', sv: 'inte i bruk' },
  'feat.ensMean': { en: 'The forecast being corrected — bias often depends on the value itself.', sv: 'Prognosen som korrigeras — felet beror ofta på värdet i sig.' },
  'feat.spread': { en: 'Disagreement between models is a proxy for how uncertain the situation is.', sv: 'Oenighet mellan modellerna är ett mått på hur osäkert läget är.' },
  'feat.humidity': { en: 'Separates humid, cloudy regimes from dry, radiative ones.', sv: 'Skiljer fuktiga, molniga lägen från torra med stark utstrålning.' },
  'feat.cloud': { en: 'Cloud cover drives the diurnal error pattern more than anything else.', sv: 'Molntäcket styr dygnsvariationen i felet mer än något annat.' },
  'feat.wind': { en: 'Windy nights mix the boundary layer; calm ones let it decouple.', sv: 'Blåsiga nätter blandar om gränsskiktet; stilla nätter låter det skikta sig.' },
  'feat.hourSin': { en: 'Time of day, as a smooth cycle rather than a step at midnight.', sv: 'Tid på dygnet, som en jämn cykel i stället för ett hopp vid midnatt.' },
  'feat.hourCos': { en: 'The other half of that cycle.', sv: 'Den andra halvan av samma cykel.' },
  'feat.seasonSin': { en: 'Day of year, same trick — bias in January differs from July.', sv: 'Dag på året, samma knep — felet i januari skiljer sig från i juli.' },
  'feat.seasonCos': { en: 'The other half of the seasonal cycle.', sv: 'Den andra halvan av årscykeln.' },

  /* ---- climate context ---- */
  'climate.title': { en: 'Is this normal?', sv: 'Är det här normalt?' },
  'climate.sub': { en: 'Today against thirty years of the same date, and what this mountain is normally like across the year.', sv: 'Dagen jämförd med trettio år av samma datum, och hur berget normalt är över året.' },
  'climate.loading': { en: 'Reading thirty years of archive…', sv: 'Läser trettio år av arkivdata…' },
  'climate.failed': { en: '<b>The climate archive did not answer.</b> The forecast above is unaffected — this panel only adds historical context.', sv: '<b>Klimatarkivet svarade inte.</b> Prognosen ovan påverkas inte — den här panelen ger bara historiskt sammanhang.' },
  'climate.noContext': { en: 'The archive does not cover this date yet.', sv: 'Arkivet täcker inte det här datumet än.' },
  'climate.warmer': { en: 'warmer', sv: 'varmare' },
  'climate.colder': { en: 'colder', sv: 'kallare' },
  'climate.headline': {
    en: '{word} than <b>{pct}%</b> of the {years} years on record for {date}, where the normal high is {normal}°.',
    sv: '{word} än <b>{pct} %</b> av de {years} år som finns i arkivet för {date}, då normal dagstemperatur är {normal}°.',
  },
  'climate.detail': {
    en: 'Normal for this week: {normalHigh}° by day, {normalLow}° at night, wind around {wind} m/s, and {wet}% of days with measurable precipitation.',
    sv: 'Normalt den här veckan: {normalHigh}° på dagen, {normalLow}° på natten, vind kring {wind} m/s och nederbörd {wet} % av dygnen.',
  },
  'climate.now': { en: 'NOW', sv: 'NU' },
  'climate.key.high': { en: 'normal day temperature', sv: 'normal dagstemperatur' },
  'climate.key.low': { en: 'normal night temperature', sv: 'normal nattemperatur' },
  'climate.key.band': { en: 'the middle 80% of years', sv: 'mittersta 80 % av åren' },
  'climate.key.snow': { en: 'weekly snowfall', sv: 'snöfall per vecka' },
  'climate.aria': { en: 'Climate for {mtn} through the year, from {years} years of reanalysis', sv: 'Klimat för {mtn} över året, ur {years} års reanalys' },
  'climate.caveat': {
    en: 'Built from {years} years of ERA5 reanalysis ({from}–{to}) at summit height, computed in your browser and cached for a month. A reanalysis grid is not a summit weather station: read it as the shape of the season, not as a record of any particular day.',
    sv: 'Byggt på {years} års ERA5-reanalys ({from}–{to}) på toppnivå, beräknat i din webbläsare och cachat i en månad. Ett reanalysrutnät är ingen väderstation på toppen: läs det som säsongens form, inte som en notering om en enskild dag.',
  },
  'month.0': { en: 'Jan', sv: 'jan' },
  'month.1': { en: 'Feb', sv: 'feb' },
  'month.2': { en: 'Mar', sv: 'mar' },
  'month.3': { en: 'Apr', sv: 'apr' },
  'month.4': { en: 'May', sv: 'maj' },
  'month.5': { en: 'Jun', sv: 'jun' },
  'month.6': { en: 'Jul', sv: 'jul' },
  'month.7': { en: 'Aug', sv: 'aug' },
  'month.8': { en: 'Sep', sv: 'sep' },
  'month.9': { en: 'Oct', sv: 'okt' },
  'month.10': { en: 'Nov', sv: 'nov' },
  'month.11': { en: 'Dec', sv: 'dec' },

  /* ---- aspect ---- */
  'aspect.title': { en: 'Which side of the mountain', sv: 'Vilken sida av berget' },
  'aspect.sub': { en: 'Wind strips one side and loads the other, and the sun only reaches some of it. This is the part a local knows.', sv: 'Vinden blåser ren ena sidan och packar den andra, och solen når bara delar av berget. Det är den kunskapen en ortsbo har.' },
  'aspect.lensGroup': { en: 'What to show', sv: 'Vad som visas' },
  'aspect.lens.wind': { en: 'Wind', sv: 'Vind' },
  'aspect.lens.loading': { en: 'Loading', sv: 'Drivbildning' },
  'aspect.lens.sun': { en: 'Sun', sv: 'Sol' },
  'aspect.aria.wind': { en: 'Wind speed by slope aspect', sv: 'Vindhastighet per väderstreck' },
  'aspect.aria.loading': { en: 'Wind loading by slope aspect', sv: 'Drivbildning per väderstreck' },
  'aspect.aria.sun': { en: 'Sunlight by slope aspect', sv: 'Solljus per väderstreck' },
  'aspect.sheltered': { en: 'Most sheltered', sv: 'Mest i lä' },
  'aspect.exposed': { en: 'Most exposed', sv: 'Mest utsatt' },
  'aspect.loaded': { en: 'Wind-loaded', sv: 'Vindpackat' },
  'aspect.sunny': { en: 'Sun on', sv: 'Sol på' },
  'aspect.sun': { en: 'Sun right now', sv: 'Solen just nu' },
  'aspect.sunUp': { en: '{deg}° up, in the {dir}', sv: '{deg}° över horisonten, i {dir}' },
  'aspect.sunDown': { en: 'below the horizon', sv: 'under horisonten' },
  'aspect.verdictCalm': {
    en: 'Nothing is being loaded at this hour. The <b>{sheltered}</b> slopes are the calm ones if you want shelter.',
    sv: 'Ingenting packas den här timmen. Sluttningar mot <b>{sheltered}</b> ligger i lä om du vill ha skydd.',
  },
  'aspect.verdictLoaded': {
    en: 'Wind is stripping the windward side and depositing it on <b>{loaded}</b>. Those are the slopes building slab; <b>{sheltered}</b> are the calm ones. This is meteorology, not an avalanche forecast — check the bulletin.',
    sv: 'Vinden blåser ren lovartsidan och lägger snön på <b>{loaded}</b>. Där byggs flaksnö; <b>{sheltered}</b> ligger lugnast. Det här är meteorologi, inte en lavinprognos — läs prognosen.',
  },
  'aspect.caveat': {
    en: 'This is compass geometry, not terrain. It knows the wind direction and where the sun is; it does not know your gully, the cornice above it, or the trees that shelter the lower slope. Use it to choose where to look, then look.',
    sv: 'Det här är kompassgeometri, inte terräng. Modellen känner vindriktningen och solens läge; den känner inte din ravin, kornischen ovanför eller skogen som ger lä längre ned. Använd den för att välja var du ska titta — och titta sedan.',
  },

  /* ---- trip planner ---- */
  'page.trip.title': { en: 'Plan a trip — ÅreWeather', sv: 'Planera resan — ÅreWeather' },
  'page.trip.description': {
    en: 'Set your arrival and departure and get a day-by-day plan for the Åre fjäll: which peak, which sport, which hours, and what to pack.',
    sv: 'Ange ankomst och avresa och få en plan dygn för dygn i Årefjällen: vilken topp, vilken sport, vilka timmar och vad du behöver packa.',
  },
  'brand.trip': { en: 'plan a trip', sv: 'planera resan' },
  'brand.links': { en: 'everything else', sv: 'allt det andra' },
  'nav.trip': { en: 'Plan a trip', sv: 'Planera resan' },
  'nav.links': { en: 'Everything else', sv: 'Allt det andra' },
  'trip.title': { en: 'When are you here?', sv: 'När är du här?' },
  'trip.sub': {
    en: 'Set your dates and every peak gets scored for every sport, day by day. Beyond the forecast horizon it falls back to what the last thirty years say is normal.',
    sv: 'Ange dina datum så betygsätts varje topp för varje sport, dygn för dygn. Bortom prognoshorisonten faller den tillbaka på vad de senaste trettio åren säger är normalt.',
  },
  'trip.arrive': { en: 'Arrive', sv: 'Ankomst' },
  'trip.depart': { en: 'Depart', sv: 'Avresa' },
  'trip.preset.weekend': { en: 'This weekend', sv: 'I helgen' },
  'trip.preset.week': { en: 'This week', sv: 'Den här veckan' },
  'trip.preset.next': { en: 'Next week', sv: 'Nästa vecka' },
  'trip.range': { en: '<b>{days} days</b>, {nights} nights — {from} to {to}.', sv: '<b>{days} dagar</b>, {nights} nätter — {from} till {to}.' },
  'trip.badRange': { en: 'Departure is before arrival. One of those dates is wrong.', sv: 'Avresan ligger före ankomsten. Ett av datumen är fel.' },
  'trip.dayForecast': { en: 'Forecast — the three best things to do', sv: 'Prognos — de tre bästa sakerna att göra' },
  'trip.dayClimate': { en: 'Beyond the forecast — what is normal for this date', sv: 'Bortom prognosen — vad som är normalt det här datumet' },
  'trip.dayUnknown': { en: 'No data for this date yet.', sv: 'Ingen data för det här datumet än.' },
  'trip.bestOfDay': { en: 'Best of the day', sv: 'Dagens bästa' },
  'trip.normalDay': { en: 'Normal day', sv: 'Normal dag' },
  'trip.normalNight': { en: 'Normal night', sv: 'Normal natt' },
  'trip.normalRange': { en: 'usually {lo}° to {hi}°', sv: 'oftast {lo}° till {hi}°' },
  'trip.normalWind': { en: 'Normal wind', sv: 'Normal vind' },
  'trip.normalWindSub': { en: 'windy years reach {n} m/s', sv: 'blåsiga år når {n} m/s' },
  'trip.wetOdds': { en: 'Chance of rain or snow', sv: 'Chans till nederbörd' },
  'trip.wetOddsSub': { en: 'of days on this date', sv: 'av dygnen detta datum' },
  'trip.snowOdds': { en: 'Chance of snowfall', sv: 'Chans till snöfall' },
  'trip.snowOddsSub': { en: 'of days on this date', sv: 'av dygnen detta datum' },
  'trip.climateNote': {
    en: 'From {years} years of reanalysis at {mtn}. A forecast for this date appears about seven days out — come back then.',
    sv: 'Ur {years} års reanalys vid {mtn}. En prognos för det här datumet dyker upp ungefär sju dygn i förväg — kom tillbaka då.',
  },
  'trip.packTitle': { en: 'What that means for the pack', sv: 'Vad det betyder för packningen' },
  'trip.packSub': { en: 'Derived from the actual numbers across your window, not a generic list.', sv: 'Härlett ur de faktiska siffrorna för din period, inte en standardlista.' },
  'trip.packBeyond': {
    en: 'Your window is beyond the forecast horizon, so there is nothing specific to pack for yet. The daily cards below show what is normal for the season.',
    sv: 'Din period ligger bortom prognoshorisonten, så det finns inget specifikt att packa för än. Dygnskorten nedan visar vad som är normalt för säsongen.',
  },
  'trip.packNote': { en: 'Based on the {days} days of your window that the forecast reaches, taken at summit height — the harshest point on the mountain.', sv: 'Baserat på de {days} dygn av din period som prognosen når, på toppnivå — bergets hårdaste punkt.' },
  'trip.coldest': { en: 'Coldest it feels', sv: 'Kallast det känns' },
  'trip.coldestSub': { en: 'wind chill at the summit', sv: 'vindkyla på toppen' },
  'trip.windiest': { en: 'Strongest gust', sv: 'Kraftigaste by' },
  'trip.windiestSub': { en: 'at the summit', sv: 'på toppen' },
  'trip.wettest': { en: 'Wettest day', sv: 'Blötaste dygnet' },
  'trip.wettestSub': { en: 'rain, not snow', sv: 'regn, inte snö' },
  'trip.snowiest': { en: 'Most new snow', sv: 'Mest nysnö' },
  'trip.snowiestSub': { en: 'in one day', sv: 'på ett dygn' },

  'pack.nothingSpecial': { en: 'Nothing unusual — normal mountain kit for the season covers this window.', sv: 'Inget ovanligt — vanlig fjällutrustning för säsongen räcker för den här perioden.' },
  'pack.faceProtection': { en: 'Face protection', sv: 'Ansiktsskydd' },
  'pack.faceProtection.why': { en: 'it drops below −15 °C felt, where exposed skin has minutes rather than hours', sv: 'det går under −15 °C känt, då bar hud har minuter på sig snarare än timmar' },
  'pack.insulation': { en: 'A real insulating layer', sv: 'Ett riktigt isolerande lager' },
  'pack.insulation.why': { en: 'below −5 °C felt at the summit, a softshell stops being enough when you stop moving', sv: 'under −5 °C känt på toppen räcker inte ett softshell när du stannar' },
  'pack.windShell': { en: 'A windproof shell', sv: 'Vindtätt skalplagg' },
  'pack.windShell.why': { en: 'gusts reach 15 m/s or more, which strips warmth faster than cold alone', sv: 'byarna når 15 m/s eller mer, vilket drar ur värmen fortare än kylan ensam' },
  'pack.rainShell': { en: 'Waterproofs, not water-resistant', sv: 'Vattentätt, inte vattenavvisande' },
  'pack.rainShell.why': { en: 'there is real rain in your window, and a treated softshell wets out in an hour', sv: 'det kommer riktigt regn under din period, och ett impregnerat softshell blir genomblött på en timme' },
  'pack.spareSocks': { en: 'Spare socks and gloves', sv: 'Extra strumpor och vantar' },
  'pack.spareSocks.why': { en: 'two or more wet days, and nothing dries in a hut overnight', sv: 'två eller fler blöta dygn, och ingenting torkar i en stuga över natten' },
  'pack.goggles': { en: 'Goggles, not sunglasses', sv: 'Goggles, inte solglasögon' },
  'pack.goggles.why': { en: 'wind plus falling snow — sunglasses are useless in spindrift', sv: 'vind och snöfall samtidigt — solglasögon är värdelösa i yrsnö' },
  'pack.avalancheKit': { en: 'Transceiver, shovel, probe', sv: 'Sändare, spade, sond' },
  'pack.avalancheKit.why': { en: 'significant new snow on an existing cover is exactly when slab builds — and read the bulletin', sv: 'mycket nysnö på befintligt snötäcke är precis när flaksnö byggs — och läs lavinprognosen' },
  'pack.skiCrampons': { en: 'Ski crampons', sv: 'Stighudsjärn' },
  'pack.skiCrampons.why': { en: 'it freezes and thaws in your window, which is how a skin track turns to ice overnight', sv: 'det växlar mellan frost och töväder, vilket är hur ett stighudsspår blir is över natten' },
  'pack.headlamp': { en: 'A headlamp', sv: 'Pannlampa' },
  'pack.headlamp.why': { en: 'eight hours of daylight or less, and the light goes quickly at this latitude', sv: 'åtta timmars dagsljus eller mindre, och ljuset försvinner fort på den här breddgraden' },
  'pack.sunglasses': { en: 'Sunglasses and sunscreen', sv: 'Solglasögon och solskydd' },
  'pack.sunglasses.why': { en: 'long days over snow — the reflected dose is what burns people here', sv: 'långa dagar över snö — det är den reflekterade strålningen som bränner folk här' },
  'pack.traction': { en: 'Traction for bare ice', sv: 'Broddar' },
  'pack.traction.why': { en: 'freeze-thaw without snow cover leaves glazed rock and iced-over trail', sv: 'växlande frost och töväder utan snötäcke ger isiga hällar och isbelagda leder' },
  'pack.thunder': { en: 'A plan for thunder', sv: 'En plan för åska' },
  'pack.thunder.why': { en: 'convective potential in your window — know where you would descend to', sv: 'konvektiv potential under din period — vet vart du skulle ta dig ner' },

  /* ---- resources page ---- */
  'page.links.title': { en: 'Everything else — ÅreWeather', sv: 'Allt det andra — ÅreWeather' },
  'page.links.description': {
    en: 'Avalanche bulletins, webcams, lift opening hours, road conditions, huts and official warnings for the Åre fjäll — the things a forecast cannot tell you.',
    sv: 'Lavinprognoser, webbkameror, liftöppettider, väglag, stugor och officiella varningar för Årefjällen — sådant en prognos inte kan säga.',
  },
  'links.h1': { en: 'What a forecast cannot tell you', sv: 'Sådant en prognos inte kan säga' },
  'links.lede': {
    en: 'Whether the bulletin says the slab is reactive, whether the lift is turning, whether the road over to Storulvån is open, whether the hut is even staffed this month. None of it is weather, and all of it ends a plan.',
    sv: 'Om lavinprognosen säger att flaket är reaktivt, om liften går, om vägen till Storulvån är öppen, om stugan ens är bemannad den här månaden. Inget av det är väder, och allt av det kan avsluta en plan.',
  },
  'links.count': { en: '{n} links', sv: '{n} länkar' },
  'links.verified': { en: 'Checked {date}', sv: 'Kontrollerade {date}' },
  'links.disclaimer': {
    en: 'These are other people\'s sites, linked because they are useful. Nothing here is affiliated with them, and none of them has any idea this page exists.',
    sv: 'Det här är andras sajter, länkade för att de är användbara. Ingenting här är knutet till dem, och ingen av dem vet att den här sidan finns.',
  },

};

/** Plain-language name for a WMO weather code, or null if unmapped. */
export const wmoLabel = (code) => (STRINGS[`wmo.${code}`] ? t(`wmo.${code}`) : null);
