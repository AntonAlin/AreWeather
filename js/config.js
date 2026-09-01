/* Static configuration: the mountains, the models, the tunables.
   Everything here is meant to be edited by hand — add a peak, change a
   coordinate, retune an exposure factor. Nothing else in the app hardcodes
   a mountain. */

export const APP = {
  version: 'v1',
  timezone: 'Europe/Stockholm',
  forecastDays: 7,
  /** how many days of archived forecasts to train the bias model on */
  trainingDays: 45,
  /** retrain when the cached weights are older than this */
  retrainAfterHours: 72,
  /** elevation band resolution, metres */
  bandStep: 100,
};

/* Peaks and massifs around Åre that people actually run up, ride down or ski off.
   `summit` / `base` in metres, `exposure` is the terrain wind acceleration
   factor at the summit (1.0 = sheltered forest, 1.4 = bare exposed dome).

   `features` decides which activities are offered at all. A bike park lap needs
   a lift; snowkiting needs open ground to kite across. Add 'lift' to any peak
   with a lift system and the lift-served activities appear there too. */
export const MOUNTAINS = [
  {
    id: 'areskutan', name: 'Åreskutan', lat: 63.4262, lon: 13.0665,
    summit: 1420, base: 380, exposure: 1.34,
    blurb: {
      en: 'The home mountain. Village-to-summit is 1040 m of vert in 6 km — the standard test piece for both running and skinning.',
      sv: 'Hemmaberget. Från byn till toppen är 1 040 höjdmeter på 6 km — standardtestet för både löpning och stighud.',
    },
    tags: [
      { en: 'Trail running', sv: 'Terränglöpning' },
      { en: 'Ski mountaineering', sv: 'Toppturer' },
      { en: 'Lift access', sv: 'Liftnära' },
    ],
    features: ['lift', 'forest'],
  },
  {
    id: 'mullfjallet', name: 'Mullfjället', lat: 63.4180, lon: 12.9300,
    summit: 1120, base: 450, exposure: 1.24,
    blurb: {
      en: 'Duved’s quiet neighbour. Broad north-east bowls hold snow late and the ridge line runs fast and dry in summer.',
      sv: 'Duveds tysta granne. Breda nordostvända skålar håller snön länge, och ryggen springs snabb och torr på sommaren.',
    },
    tags: [
      { en: 'Ski touring', sv: 'Toppturer' },
      { en: 'Trail running', sv: 'Terränglöpning' },
    ],
    features: ['forest', 'bowl'],
  },
  {
    id: 'renfjallet', name: 'Renfjället', lat: 63.3480, lon: 13.1200,
    summit: 1054, base: 400, exposure: 1.18,
    blurb: {
      en: 'South of the lake, so it catches sun and loses snow first. Reliable shoulder-season running when the north side is still white.',
      sv: 'Söder om sjön, så det fångar solen och tappar snön först. Pålitlig löpning i vår och höst när nordsidan fortfarande är vit.',
    },
    tags: [
      { en: 'Trail running', sv: 'Terränglöpning' },
    ],
    features: ['forest'],
  },
  {
    id: 'ottfjallet', name: 'Ottfjället', lat: 63.2500, lon: 13.2450,
    summit: 1246, base: 500, exposure: 1.22,
    blurb: {
      en: 'The Vålådalen gateway. Long rolling approach, wind-scoured plateau up top.',
      sv: 'Porten till Vålådalen. Lång böljande ansats, vindpiskat kalfjäll högst upp.',
    },
    tags: [
      { en: 'Trail running', sv: 'Terränglöpning' },
      { en: 'Ski touring', sv: 'Toppturer' },
    ],
    features: ['plateau', 'forest'],
  },
  {
    id: 'hundshogen', name: 'Hundshögen', lat: 63.2670, lon: 12.7350,
    summit: 1372, base: 600, exposure: 1.30,
    blurb: {
      en: 'Steep east-facing lines above Ånn and a summit that sees the raw westerly before anywhere else in the valley.',
      sv: 'Branta östvända linjer ovanför Ånn, och en topp som möter den råa västvinden före alla andra i dalen.',
    },
    tags: [
      { en: 'Ski mountaineering', sv: 'Toppturer' },
    ],
    features: ['plateau', 'steep'],
  },
  {
    id: 'blahammaren', name: 'Blåhammaren', lat: 63.2010, lon: 12.4040,
    summit: 1086, base: 620, exposure: 1.32,
    blurb: {
      en: 'Sweden’s highest mountain station. Famously exposed — the wind here is the wind everyone else gets an hour later.',
      sv: 'Sveriges högst belägna fjällstation. Ökänt utsatt — vinden här är den vind alla andra får en timme senare.',
    },
    tags: [
      { en: 'Ski touring', sv: 'Toppturer' },
      { en: 'Hut to hut', sv: 'Stuga till stuga' },
    ],
    features: ['plateau'],
  },
  {
    id: 'storsnasen', name: 'Storsnasen', lat: 63.1780, lon: 12.5060,
    summit: 1462, base: 700, exposure: 1.36,
    blurb: {
      en: 'The Snasahögarna high point. Big alpine feel, corniced ridges, the classic Storulvån day tour.',
      sv: 'Snasahögarnas högsta punkt. Riktig alpin känsla, kornischade ryggar och den klassiska dagsturen från Storulvån.',
    },
    tags: [
      { en: 'Ski mountaineering', sv: 'Toppturer' },
      { en: 'Trail running', sv: 'Terränglöpning' },
    ],
    features: ['plateau', 'steep'],
  },
  {
    id: 'getryggen', name: 'Getryggen', lat: 63.1160, lon: 12.4380,
    summit: 1250, base: 700, exposure: 1.28,
    blurb: {
      en: 'The knife-edge between Storulvån and Sylarna. Narrow, loaded on the lee side, a serious place in wind.',
      sv: 'Kniveggen mellan Storulvån och Sylarna. Smal, lastad på läsidan, en allvarlig plats i blåst.',
    },
    tags: [
      { en: 'Ski mountaineering', sv: 'Toppturer' },
    ],
    features: ['plateau', 'steep'],
  },
  {
    id: 'bunnerstoten', name: 'Bunnerstöten', lat: 63.0720, lon: 12.5700,
    summit: 1372, base: 700, exposure: 1.30,
    blurb: {
      en: 'Bunnerfjällen’s high point above the twin lakes — remote, long approach, superb spring corn.',
      sv: 'Bunnerfjällens högsta punkt ovanför de två sjöarna — avlägset, lång ansats, förnämlig vårkorn.',
    },
    tags: [
      { en: 'Ski mountaineering', sv: 'Toppturer' },
    ],
    features: ['plateau', 'steep'],
  },
  {
    id: 'storsylen', name: 'Storsylen', lat: 63.0330, lon: 12.2230,
    summit: 1728, base: 800, exposure: 1.40,
    blurb: {
      en: 'The roof of the region, right on the Norwegian border. Real mountaineering terrain and the harshest weather in the area.',
      sv: 'Områdets tak, precis på norska gränsen. Riktig alpin terräng och det hårdaste vädret i trakten.',
    },
    tags: [
      { en: 'Ski mountaineering', sv: 'Toppturer' },
      { en: 'Alpine', sv: 'Alpint' },
    ],
    features: ['steep', 'alpine'],
  },
];

/* Deterministic NWP models. `key` is the Open-Meteo model id, `res` is the
   native grid spacing used only for display honesty. Order matters: the
   first entries are the ones we expect to be best over Jämtland. */
export const MODELS = [
  { key: 'metno_seamless',  name: 'MET Nordic',    org: 'MET Norway',  res: '1 km',    prior: 1.35 },
  { key: 'dmi_seamless',    name: 'Harmonie AROME', org: 'DMI',        res: '2 km',    prior: 1.20 },
  { key: 'icon_seamless',   name: 'ICON',          org: 'DWD',         res: '2–7 km',  prior: 1.10 },
  { key: 'ecmwf_ifs025',    name: 'IFS 0.25°',     org: 'ECMWF',       res: '25 km',   prior: 1.05 },
  { key: 'ukmo_seamless',   name: 'UM Global',     org: 'UK Met Office', res: '10 km', prior: 0.95 },
  { key: 'gfs_seamless',    name: 'GFS',           org: 'NOAA',        res: '13 km',   prior: 0.90 },
];

/* Models that expose pressure-level fields at the resolution we need to
   build a sounding (975/950/900/800 hPa exist here; ECMWF open data does not
   carry them, so it is deliberately absent). */
export const PROFILE_MODELS = ['icon_seamless', 'gfs_seamless'];
export const PRESSURE_LEVELS = [1000, 975, 950, 925, 900, 850, 800, 700, 600, 500];

/* Ensemble systems, tried in order until one answers. */
export const ENSEMBLE_MODELS = ['icon_eu', 'gfs025', 'ecmwf_ifs025'];

export const ENDPOINTS = {
  forecast: 'https://api.open-meteo.com/v1/forecast',
  ensemble: 'https://ensemble-api.open-meteo.com/v1/ensemble',
  history: 'https://historical-forecast-api.open-meteo.com/v1/forecast',
  archive: 'https://archive-api.open-meteo.com/v1/archive',
  climate: 'https://climate-api.open-meteo.com/v1/climate',
};

/* ---------------------------------------------------------------------------
   Climate projections.

   Seven CMIP6 HighResMIP models, daily, 1950-2050, statistically downscaled to
   10 km and bias-corrected against ERA5 by Open-Meteo. These are the coarsest
   data on the site by a wide margin: a 25 km grid cell cannot tell Åreskutan
   from Ottfjället, so the warming page uses one point for the whole massif and
   makes elevation the variable instead of the peak.
   --------------------------------------------------------------------------- */
export const CLIMATE_MODELS = [
  { key: 'EC_Earth3P_HR', org: 'EC-Earth Consortium', country: 'Europe', km: 29 },
  { key: 'MRI_AGCM3_2_S', org: 'Meteorological Research Institute', country: 'Japan', km: 20 },
  { key: 'HiRAM_SIT_HR', org: 'AS-RCEC', country: 'Taiwan', km: 25 },
  { key: 'CMCC_CM2_VHR4', org: 'CMCC', country: 'Italy', km: 30 },
  { key: 'FGOALS_f3_H', org: 'Chinese Academy of Sciences', country: 'China', km: 28 },
  { key: 'NICAM16_8S', org: 'MIROC / NICAM', country: 'Japan', km: 31 },
  { key: 'MPI_ESM1_2_XR', org: 'Max Planck Institute for Meteorology', country: 'Germany', km: 51 },
];

/* ---------------------------------------------------------------------------
   Winter metrics.

   The thresholds the warming page counts against. They are here rather than in
   the code because every one of them is a judgement call that a reader is
   entitled to disagree with, and the method page prints them.
   --------------------------------------------------------------------------- */
export const WARMING = {
  /** the point the whole massif is read at — a 25 km cell resolves nothing finer */
  anchor: { id: 'areskutan', lat: 63.4262, lon: 13.0665 },
  /** elevation bands the projection is downscaled to (m) */
  bands: [400, 600, 800, 1000, 1200, 1420],
  /** first year of model data, and the last */
  from: 1950,
  to: 2050,
  /** the three windows the page compares, the middle one being the WMO normal */
  periods: [
    { id: 'past', from: 1961, to: 1990 },
    { id: 'present', from: 1991, to: 2020 },
    { id: 'future', from: 2031, to: 2050 },
  ],
  /** a winter year runs July to June, so one winter is never split in two */
  yearStartMonth: 7,
  /** midwinter, for counting thaws */
  coreWinter: { fromMonth: 12, toMonth: 3 },
  /** the season snowmaking can run in */
  makingSeason: { fromMonth: 11, toMonth: 3 },
  /** wet-bulb at or below which a snow gun can run (°C) */
  snowmakingWetBulb: -2,
  /** a midwinter day warmer than this counts as a thaw (°C max) */
  thawAbove: 2,
  /** degree-day melt factor (mm water equivalent per °C per day) */
  meltFactor: 3.5,
  /** settled snowpack density (kg/m³) used to turn water equivalent into depth */
  packDensity: 300,
  /** the classic snow-reliability test: this depth (cm), this many days */
  reliableDepth: 30,
  reliableDays: 100,
  /** a run of this many days below freezing opens or closes the season */
  runLength: 5,
};

/* Physical / empirical tunables, gathered in one place so they can be
   argued with rather than hunted for. */
export const PHYS = {
  /** fallback lapse rate when no sounding is available (°C per 100 m) */
  fallbackLapse: 0.65,
  /** how fast the surface anchor decays with height above model ground (m) */
  anchorScale: 1200,
  /** how fast surface wind gives way to free-atmosphere wind (m) */
  windBlendScale: 700,
  /** orographic precipitation enhancement per 1000 m above model ground */
  orographicPerKm: 0.35,
  /** wet-bulb thresholds for precipitation phase (°C) */
  snowBelow: 0.4,
  rainAbove: 1.8,
  /** wind speed (m/s) at which loose snow starts moving */
  driftThreshold: 7,
};

/* ---------------------------------------------------------------------------
   Activities.

   Every sport this app scores is defined here as data, not code — the scorer
   applies these rules and the method page prints them, so the two can never
   disagree. Adding a sport means adding an entry, nothing else.

   A `ramp` rule costs   clamp((value − from) × slope, 0, cap)  points.
   A `bonus` rule adds   clamp((value − from) × slope, 0, cap)  points.
   A `flag` rule costs a flat `amount` when its condition holds — or when it
   does *not*, if `invert` is set. Everything is clamped to 0–100.

   `requires`  a terrain feature the mountain must have, or null for anywhere.
   `window`    hours the activity is scored over when picking the best window.
   `season`    snow-cover gate: below `snowMin` or above `snowMax` it is simply
               out of season and says so rather than pretending otherwise.
--------------------------------------------------------------------------- */
export const ACTIVITIES = [
  {
    id: 'trail', base: 100, window: 3, requires: null,
    name: { en: "Trail running", sv: "Terränglöpning" },
    short: { en: "Trail run", sv: "Löpning" },
    blurb: { en: "Moving fast in light kit, so wind chill and wet arrive quickly.", sv: "Snabb förflyttning i tunna kläder, så vindkyla och väta kommer fort." },
    season: { snowMax: 0.45, over: { en: "too much snow underfoot", sv: "för mycket snö att ta sig fram i" } },
    rules: [
      { kind: 'ramp', metric: 'precip', from: 0, slope: 16, cap: 42,
        label: { en: "precipitation", sv: "nederbörd" },
        why: { en: "Wet rock and wet feet, and it only gets colder with height.", sv: "Blöt sten och blöta fötter, och det blir bara kallare med höjden." } },
      { kind: 'ramp', metric: 'wind', from: 6, slope: 3.4, cap: 34,
        label: { en: "wind", sv: "vind" },
        why: { en: "Above about 6 m/s a headwind starts costing real pace on an exposed ridge.", sv: "Över ungefär 6 m/s börjar motvinden kosta på i tempo uppe på en öppen rygg." } },
      { kind: 'ramp', metric: 'gust', from: 15, slope: 1.7, cap: 15,
        label: { en: "gusts", sv: "byvind" },
        why: { en: "Gusts are what actually knock you off a line, not the mean wind.", sv: "Det är byarna som slår dig ur spåret, inte medelvinden." } },
      { kind: 'ramp', metric: 'chill', from: 0, slope: 2.3, cap: 30,
        label: { en: "wind chill", sv: "vindkyla" },
        reads: { en: "feels-like below 0 °C", sv: "känns som under 0 °C" },
        why: { en: "Below freezing on skin, a running kit stops being enough.", sv: "Under nollan på huden räcker inte löparkläder längre." } },
      { kind: 'ramp', metric: 'feels', from: 20, slope: 2.6, cap: 24,
        label: { en: "heat", sv: "värme" },
        why: { en: "Rare in the fjäll, punishing when it happens.", sv: "Ovanligt i fjällen, obarmhärtigt när det händer." } },
      { kind: 'ramp', metric: 'snowDepth', from: 0.25, slope: 60, cap: 26,
        label: { en: "deep snow underfoot", sv: "djup snö" },
        why: { en: "Modelled snow cover deep enough to wreck footing.", sv: "Modellerat snötäcke djupt nog att förstöra fotfästet." } },
      { kind: 'flag', flag: 'summitInCloud', amount: 9,
        label: { en: "summit in cloud", sv: "toppen i moln" },
        why: { en: "No view, and navigation by feel.", sv: "Ingen utsikt, och navigering på känsla." } },
      { kind: 'flag', flag: 'night', amount: 13,
        label: { en: "darkness", sv: "mörker" },
        why: { en: "Headlamp territory — outside sunrise and sunset for that day.", sv: "Pannlampsläge — utanför soluppgång och solnedgång det dygnet." } },
      { kind: 'flag', flag: 'sleet', amount: 7,
        label: { en: "sleet", sv: "snöblandat regn" },
        why: { en: "The single worst thing to be wet in.", sv: "Det absolut sämsta att bli blöt i." } },
      { kind: 'flag', flag: 'thunder', amount: 10,
        label: { en: "thunder risk", sv: "åskrisk" },
        why: { en: "CAPE above 700 J/kg — get off the high ground.", sv: "CAPE över 700 J/kg — ta dig ner från höjden." } },
    ],
  },
  {
    id: 'hike', base: 100, window: 5, requires: null,
    name: { en: "Hiking", sv: "Vandring" },
    short: { en: "Hike", sv: "Vandring" },
    blurb: { en: "Slower than running, so more hours exposed — but carrying layers for it.", sv: "Långsammare än löpning, alltså fler timmar utsatt — men med kläder för det." },
    season: null,
    rules: [
      { kind: 'ramp', metric: 'precip', from: 0, slope: 10, cap: 30,
        label: { en: "precipitation", sv: "nederbörd" },
        why: { en: "You have a shell, but a whole day in it still grinds.", sv: "Du har skalplagg, men ett helt dygn i det sliter ändå." } },
      { kind: 'ramp', metric: 'wind', from: 8, slope: 2.6, cap: 28,
        label: { en: "wind", sv: "vind" },
        why: { en: "Walking pace into a headwind is survivable in a way that running is not.", sv: "Motvind i gångtempo går att stå ut med på ett sätt som löpning inte gör." } },
      { kind: 'ramp', metric: 'gust', from: 18, slope: 1.4, cap: 12,
        label: { en: "gusts", sv: "byvind" },
        why: { en: "Enough to stagger you on a loaded pack.", sv: "Nog för att få dig ur balans med tung packning." } },
      { kind: 'ramp', metric: 'chill', from: 3, slope: 1.8, cap: 26,
        label: { en: "cold", sv: "kyla" },
        reads: { en: "feels-like below −3 °C", sv: "känns som under −3 °C" },
        why: { en: "Slow movement generates little heat; this is where hypothermia starts.", sv: "Långsam förflyttning ger lite egenvärme; det är här nedkylningen börjar." } },
      { kind: 'ramp', metric: 'feels', from: 24, slope: 2, cap: 16,
        label: { en: "heat", sv: "värme" },
        why: { en: "Little shade above the treeline.", sv: "Lite skugga ovanför trädgränsen." } },
      { kind: 'ramp', metric: 'snowDepth', from: 0.3, slope: 45, cap: 24,
        label: { en: "deep snow", sv: "djup snö" },
        why: { en: "Post-holing turns five kilometres into a day.", sv: "Att gå igenom snön gör fem kilometer till en heldag." } },
      { kind: 'flag', flag: 'summitInCloud', amount: 7,
        label: { en: "summit in cloud", sv: "toppen i moln" },
        why: { en: "The view was the point, and navigation gets serious.", sv: "Utsikten var poängen, och navigeringen blir allvar." } },
      { kind: 'flag', flag: 'night', amount: 10,
        label: { en: "darkness", sv: "mörker" },
        why: { en: "Outside sunrise and sunset for that day.", sv: "Utanför soluppgång och solnedgång det dygnet." } },
      { kind: 'flag', flag: 'thunder', amount: 14,
        label: { en: "thunder risk", sv: "åskrisk" },
        why: { en: "You are slower than a storm, and there is nowhere to get to.", sv: "Du är långsammare än ovädret, och det finns ingenstans att ta vägen." } },
    ],
  },
  {
    id: 'thru', base: 100, window: 8, requires: null,
    name: { en: "Hut to hut", sv: "Stuga till stuga" },
    short: { en: "Thru-hike", sv: "Stugvandring" },
    blurb: { en: "Jämtlandstriangeln and the long routes — a whole day out, then a night in it.", sv: "Jämtlandstriangeln och de långa lederna — ett helt dygn ute, och sedan en natt i det." },
    season: null,
    rules: [
      { kind: 'ramp', metric: 'precip', from: 0, slope: 13, cap: 34,
        label: { en: "precipitation", sv: "nederbörd" },
        why: { en: "Everything you own is wet by hut two, and it stays wet.", sv: "Allt du äger är blött vid stuga två, och förblir blött." } },
      { kind: 'ramp', metric: 'rain24', from: 5, slope: 1.6, cap: 20,
        label: { en: "saturated ground", sv: "blöt mark" },
        why: { en: "Yesterday's rain is today's bog and tomorrow's river crossing.", sv: "Gårdagens regn är dagens myr och morgondagens vadställe." } },
      { kind: 'ramp', metric: 'wind', from: 9, slope: 2.4, cap: 26,
        label: { en: "wind", sv: "vind" },
        why: { en: "Hours of it, with a pack, across open fjäll.", sv: "Timme efter timme, med packning, över öppet fjäll." } },
      { kind: 'ramp', metric: 'chill', from: 5, slope: 1.6, cap: 24,
        label: { en: "cold", sv: "kyla" },
        reads: { en: "feels-like below −5 °C", sv: "känns som under −5 °C" },
        why: { en: "A full day of it, and the night after.", sv: "Ett helt dygn i det, och natten efter." } },
      { kind: 'ramp', metric: 'feels', from: 25, slope: 1.8, cap: 12,
        label: { en: "heat", sv: "värme" },
        why: { en: "Water between huts becomes the planning problem.", sv: "Vatten mellan stugorna blir planeringsproblemet." } },
      { kind: 'ramp', metric: 'snowDepth', from: 0.25, slope: 40, cap: 22,
        label: { en: "deep snow", sv: "djup snö" },
        why: { en: "Summer routes under snow are a different trip entirely.", sv: "Sommarleder under snö är en helt annan tur." } },
      { kind: 'flag', flag: 'summitInCloud', amount: 8,
        label: { en: "cloud on the tops", sv: "moln på topparna" },
        why: { en: "Route-finding between cairns you cannot see.", sv: "Att hitta mellan rösen du inte ser." } },
      { kind: 'flag', flag: 'thunder', amount: 12,
        label: { en: "thunder risk", sv: "åskrisk" },
        why: { en: "Long exposed traverses with no shelter for hours.", sv: "Långa blottade traverser utan skydd i timmar." } },
      { kind: 'flag', flag: 'night', amount: 8,
        label: { en: "darkness", sv: "mörker" },
        why: { en: "Walking a stage in the dark is a choice, rarely a good one.", sv: "Att gå en etapp i mörker är ett val, sällan ett bra." } },
    ],
  },
  {
    id: 'skimo', base: 74, window: 4, requires: null,
    name: { en: "Ski mountaineering", sv: "Toppturer" },
    short: { en: "Ski tour", sv: "Topptur" },
    blurb: { en: "Earning the turns. Wind loading matters as much as the weather does.", sv: "Du gör dig förtjänt av svängarna. Vindtransporten betyder lika mycket som vädret." },
    season: { snowMin: 0.05, under: { en: "no snow cover", sv: "inget snötäcke" } },
    rules: [
      { kind: 'ramp', metric: 'coverDeficit', from: 0, slope: 90, cap: 28,
        label: { en: "thin cover", sv: "tunt snötäcke" },
        reads: { en: "snow depth below 0.30 m", sv: "snödjup under 0,30 m" },
        why: { en: "Below 30 cm the rocks are still in play.", sv: "Under 30 cm är stenarna fortfarande med i spelet." } },
      { kind: 'bonus', metric: 'coverSurplus', from: 0, slope: 22, cap: 14,
        label: { en: "good base", sv: "bra underlag" },
        reads: { en: "snow depth above 0.30 m", sv: "snödjup över 0,30 m" },
        why: { en: "A deep base covers the sharks.", sv: "Ett djupt underlag täcker det vassa." } },
      { kind: 'bonus', metric: 'newSnow24', from: 0, slope: 1.6, cap: 18,
        label: { en: "fresh snow", sv: "nysnö" },
        why: { en: "The entire point of the exercise.", sv: "Hela poängen med övningen." } },
      { kind: 'ramp', metric: 'wind', from: 8, slope: 3.1, cap: 36,
        label: { en: "wind", sv: "vind" },
        why: { en: "Skinning into 15 m/s on a plateau is its own kind of misery.", sv: "Att stiga mot 15 m/s uppe på kalfjället är sin egen sorts elände." } },
      { kind: 'ramp', metric: 'gust', from: 18, slope: 1.5, cap: 14,
        label: { en: "gusts", sv: "byvind" },
        why: { en: "Gusts on a corniced ridge are a safety problem, not a comfort one.", sv: "Byar på en kornischad rygg är ett säkerhetsproblem, inte ett bekvämlighetsproblem." } },
      { kind: 'ramp', metric: 'rain', from: 0, slope: 18, cap: 38,
        label: { en: "rain on snow", sv: "regn på snö" },
        why: { en: "Ruins the surface and soaks the pack.", sv: "Förstör underlaget och dränker packningen." } },
      { kind: 'ramp', metric: 'chill', from: 20, slope: 1.6, cap: 18,
        label: { en: "severe cold", sv: "sträng kyla" },
        reads: { en: "feels-like below −20 °C", sv: "känns som under −20 °C" },
        why: { en: "Exposed skin has minutes.", sv: "Bar hud har minuter på sig." } },
      { kind: 'ramp', metric: 'temp', from: 3, slope: 5, cap: 16,
        label: { en: "warm, wet snow", sv: "blöt vårsnö" },
        why: { en: "Isothermal mush, and a wet-loose problem in steep terrain.", sv: "Genomvåt snö, och risk för våta laviner i brant terräng." } },
      { kind: 'ramp', metric: 'drift', from: 45, slope: 0.35, cap: 18,
        label: { en: "wind slab building", sv: "drivbildning" },
        why: { en: "Meteorological wind loading — see the avalanche warning.", sv: "Meteorologisk vindtransport — se lavinvarningen." } },
      { kind: 'flag', flag: 'summitInCloud', amount: 15,
        label: { en: "flat light, no visibility", sv: "flatljus, ingen sikt" },
        why: { en: "You cannot read terrain you cannot see.", sv: "Du kan inte läsa terräng du inte ser." } },
      { kind: 'flag', flag: 'overcastOnly', amount: 7,
        label: { en: "flat light", sv: "flatljus" },
        why: { en: "Cloud above the summit still kills the contrast.", sv: "Moln ovanför toppen tar ändå kontrasten." } },
      { kind: 'flag', flag: 'night', amount: 12,
        label: { en: "darkness", sv: "mörker" },
        why: { en: "Outside sunrise and sunset for that day.", sv: "Utanför soluppgång och solnedgång det dygnet." } },
    ],
  },
  {
    id: 'alpine', base: 78, window: 5, requires: 'lift',
    name: { en: "Alpine skiing", sv: "Utförsåkning" },
    short: { en: "Piste", sv: "Pist" },
    blurb: { en: "Lift-served. The thing that ends the day here is wind, not cold.", sv: "Liftburen åkning. Det som avslutar dagen här är vinden, inte kylan." },
    season: { snowMin: 0.08, under: { en: "no snow cover", sv: "inget snötäcke" } },
    rules: [
      { kind: 'bonus', metric: 'newSnow24', from: 0, slope: 1.4, cap: 16,
        label: { en: "fresh snow", sv: "nysnö" },
        why: { en: "A powder morning is why you booked the week.", sv: "En puddermorgon är varför du bokade veckan." } },
      { kind: 'bonus', metric: 'coverSurplus', from: 0, slope: 18, cap: 12,
        label: { en: "deep base", sv: "djupt underlag" },
        why: { en: "Everything open, nothing showing through.", sv: "Allt öppet, inget som sticker upp." } },
      { kind: 'ramp', metric: 'wind', from: 12, slope: 3.6, cap: 40,
        label: { en: "wind — lift holds", sv: "vind — liftstopp" },
        why: { en: "The top lifts on Åreskutan stop in a strong westerly long before the skiing gets bad.", sv: "Topplifterna på Åreskutan stannar i hård västlig vind långt innan åkningen blir dålig." } },
      { kind: 'ramp', metric: 'gust', from: 20, slope: 2.2, cap: 20,
        label: { en: "gusts", sv: "byvind" },
        why: { en: "Gusts are what actually put a chairlift on hold.", sv: "Det är byarna som faktiskt stoppar en stollift." } },
      { kind: 'ramp', metric: 'rain', from: 0, slope: 20, cap: 40,
        label: { en: "rain", sv: "regn" },
        why: { en: "Rain on piste is the worst day of the season.", sv: "Regn i backen är säsongens sämsta dag." } },
      { kind: 'ramp', metric: 'chill', from: 18, slope: 1.5, cap: 16,
        label: { en: "severe cold", sv: "sträng kyla" },
        reads: { en: "feels-like below −18 °C", sv: "känns som under −18 °C" },
        why: { en: "Twelve minutes on an exposed chair changes your plans.", sv: "Tolv minuter i en utsatt stollift ändrar dina planer." } },
      { kind: 'ramp', metric: 'temp', from: 4, slope: 4, cap: 14,
        label: { en: "slush", sv: "sörja" },
        why: { en: "Spring snow goes from perfect to unskiable in an hour.", sv: "Vårsnö går från perfekt till oåkbar på en timme." } },
      { kind: 'flag', flag: 'summitInCloud', amount: 16,
        label: { en: "flat light", sv: "flatljus" },
        why: { en: "Above the treeline in cloud you cannot see the terrain at all.", sv: "Ovanför trädgränsen i moln ser du ingen terräng alls." } },
      { kind: 'flag', flag: 'overcastOnly', amount: 6,
        label: { en: "dull light", sv: "grått ljus" },
        why: { en: "Contrast still suffers under thick cloud.", sv: "Kontrasten lider ändå under tjocka moln." } },
      { kind: 'flag', flag: 'night', amount: 26,
        label: { en: "lifts closed", sv: "lifterna stängda" },
        why: { en: "Outside daylight, with only limited evening skiing.", sv: "Utanför dagsljus, med bara begränsad kvällsåkning." } },
    ],
  },
  {
    id: 'bike', base: 92, window: 4, requires: 'lift',
    name: { en: "Downhill biking", sv: "Utförscykling" },
    short: { en: "Bike park", sv: "Cykelpark" },
    blurb: { en: "Åre Bike Park. Grip, sight lines, and how cold 60 km/h is.", sv: "Åre Bike Park. Grepp, sikt i kurvorna, och hur kallt 60 km/h faktiskt är." },
    season: { snowMax: 0.05, over: { en: "snow on the trails", sv: "snö på lederna" } },
    rules: [
      { kind: 'ramp', metric: 'precip', from: 0, slope: 14, cap: 34,
        label: { en: "rain", sv: "regn" },
        why: { en: "Wet roots and off-camber rock are where the season ends for people.", sv: "Blöta rötter och lutande hällar är där säsongen tar slut för folk." } },
      { kind: 'ramp', metric: 'rain24', from: 4, slope: 2, cap: 22,
        label: { en: "soaked trails", sv: "blöta leder" },
        why: { en: "Yesterday's rain means ruts, and riding it wrecks the trail for everyone.", sv: "Gårdagens regn ger spårbildning, och att åka i det förstör leden för alla andra." } },
      { kind: 'ramp', metric: 'wind', from: 10, slope: 2.4, cap: 22,
        label: { en: "wind", sv: "vind" },
        why: { en: "Crosswind on the exposed upper sections, and the lift stops before you do.", sv: "Sidvind på de öppna partierna högst upp, och liften stannar före dig." } },
      { kind: 'ramp', metric: 'gust', from: 18, slope: 1.6, cap: 14,
        label: { en: "gusts", sv: "byvind" },
        why: { en: "A gust while you are in the air is a genuinely bad time.", sv: "En by när du är i luften är en genuint dålig upplevelse." } },
      { kind: 'ramp', metric: 'chill', from: -2, slope: 2.2, cap: 26,
        label: { en: "wind chill", sv: "vindkyla" },
        reads: { en: "feels-like below +2 °C", sv: "känns som under +2 °C" },
        why: { en: "You are doing 60 km/h downhill and generating no heat at all.", sv: "Du gör 60 km/h utför och alstrar ingen egenvärme alls." } },
      { kind: 'ramp', metric: 'feels', from: 26, slope: 1.6, cap: 10,
        label: { en: "heat", sv: "värme" },
        why: { en: "Full-face helmet and body armour in the sun.", sv: "Täckhjälm och skydd i solen." } },
      { kind: 'flag', flag: 'freezing', amount: 12,
        label: { en: "frozen ground", sv: "tjälad mark" },
        why: { en: "Frozen ruts and ice in the shade, on tyres meant for dirt.", sv: "Frusna spår och is i skuggan, på däck avsedda för jord." } },
      { kind: 'flag', flag: 'summitInCloud', amount: 10,
        label: { en: "fog on the trail", sv: "dimma på leden" },
        why: { en: "Blind corners at speed.", sv: "Blinda kurvor i fart." } },
      { kind: 'flag', flag: 'thunder', amount: 16,
        label: { en: "thunder risk", sv: "åskrisk" },
        why: { en: "A chairlift is the worst place on the mountain in a storm.", sv: "En stollift är det sämsta stället på berget i ett åskväder." } },
      { kind: 'flag', flag: 'night', amount: 38,
        label: { en: "park closed", sv: "parken stängd" },
        why: { en: "Outside daylight hours.", sv: "Utanför dagsljus." } },
    ],
  },
  {
    id: 'kite', base: 46, window: 4, requires: 'plateau',
    name: { en: "Snowkiting", sv: "Snowkiting" },
    short: { en: "Snowkite", sv: "Snowkite" },
    blurb: { en: "The one sport here that wants the wind the others are hiding from.", sv: "Den enda sporten här som vill ha vinden alla andra gömmer sig från." },
    season: { snowMin: 0.15, under: { en: "not enough snow to kite on", sv: "för lite snö att kita på" } },
    rules: [
      { kind: 'bonus', metric: 'wind', from: 5, slope: 3.4, cap: 36,
        label: { en: "usable wind", sv: "användbar vind" },
        why: { en: "Below about 5 m/s the kite will not fly. This is the only score on the site that rewards a gale.", sv: "Under ungefär 5 m/s flyger inte kiten. Det här är det enda betyget på sajten som belönar kuling." } },
      { kind: 'ramp', metric: 'wind', from: 18, slope: 4, cap: 42,
        label: { en: "overpowered", sv: "överpowrad" },
        why: { en: "Past 18 m/s you are a passenger, and the fjäll is not a forgiving place to be dragged across.", sv: "Efter 18 m/s är du passagerare, och fjället är ingen förlåtande plats att släpas över." } },
      { kind: 'ramp', metric: 'gustSpread', from: 5, slope: 3, cap: 22,
        label: { en: "gusty", sv: "byigt" },
        why: { en: "The gap between lull and gust is what breaks lines and shoulders — steady wind beats strong wind.", sv: "Glappet mellan lugn och by är det som slår av linor och axlar — jämn vind slår stark vind." } },
      { kind: 'bonus', metric: 'coverSurplus', from: 0, slope: 14, cap: 10,
        label: { en: "good cover", sv: "bra snötäcke" },
        why: { en: "Deep snow means the rocks and heather are gone.", sv: "Djup snö betyder att sten och ris är borta." } },
      { kind: 'ramp', metric: 'precip', from: 0, slope: 10, cap: 22,
        label: { en: "precipitation", sv: "nederbörd" },
        why: { en: "Wet lines, and visibility you need for speed.", sv: "Blöta linor, och sikt du behöver i fart." } },
      { kind: 'ramp', metric: 'chill', from: 15, slope: 1.4, cap: 16,
        label: { en: "severe cold", sv: "sträng kyla" },
        reads: { en: "feels-like below −15 °C", sv: "känns som under −15 °C" },
        why: { en: "Standing still rigging in a headwind is the coldest part of the day.", sv: "Att stå still och rigga i motvind är dagens kallaste stund." } },
      { kind: 'flag', flag: 'summitInCloud', amount: 14,
        label: { en: "whiteout", sv: "whiteout" },
        why: { en: "Speed plus no horizon is how people hit things.", sv: "Fart utan horisont är hur folk kör in i saker." } },
      { kind: 'flag', flag: 'night', amount: 30,
        label: { en: "darkness", sv: "mörker" },
        why: { en: "Outside daylight hours.", sv: "Utanför dagsljus." } },
    ],
  },
  {
    id: 'aurora', base: 90, window: 3, requires: null, night: true,
    name: { en: "Aurora watching", sv: "Norrsken" },
    short: { en: "Aurora", sv: "Norrsken" },
    blurb: { en: "Scores the sky, not the sun — clear, dark and moonless. Geomagnetic activity is not modelled.", sv: "Betygsätter himlen, inte solen — klart, mörkt och månlöst. Geomagnetisk aktivitet ingår inte." },
    season: null,
    rules: [
      { kind: 'flag', flag: 'night', amount: 70, invert: true,
        label: { en: "daylight", sv: "dagsljus" },
        why: { en: "The obvious one, and the reason this is out of the running for half the summer.", sv: "Det uppenbara, och skälet till att det här är ur leken halva sommaren." } },
      { kind: 'ramp', metric: 'cloud', from: 20, slope: 0.7, cap: 45,
        label: { en: "cloud cover", sv: "molntäcke" },
        why: { en: "The best display in a decade is invisible under stratus.", sv: "Det bästa utbrottet på tio år är osynligt under ett stratustäcke." } },
      { kind: 'ramp', metric: 'moon', from: 0.4, slope: 40, cap: 22,
        label: { en: "moonlight", sv: "månljus" },
        why: { en: "A gibbous moon washes out everything but the strongest arcs.", sv: "En nästan full måne tvättar bort allt utom de starkaste bågarna." } },
      { kind: 'ramp', metric: 'precip', from: 0, slope: 20, cap: 30,
        label: { en: "precipitation", sv: "nederbörd" },
        why: { en: "If it is falling on you, you are not seeing anything.", sv: "Faller det på dig ser du ingenting." } },
      { kind: 'ramp', metric: 'chill', from: 10, slope: 1.2, cap: 18,
        label: { en: "cold", sv: "kyla" },
        reads: { en: "feels-like below −10 °C", sv: "känns som under −10 °C" },
        why: { en: "Standing still for an hour, which is the whole activity.", sv: "Att stå still i en timme, vilket är hela aktiviteten." } },
      { kind: 'ramp', metric: 'wind', from: 10, slope: 1.8, cap: 16,
        label: { en: "wind", sv: "vind" },
        why: { en: "Camera shake, and no reason to be on an exposed summit for it.", sv: "Kameraskak, och ingen anledning att stå på en blåsig topp för det." } },
      { kind: 'flag', flag: 'summitInCloud', amount: 25,
        label: { en: "in cloud", sv: "inne i molnet" },
        why: { en: "Inside the cloud rather than under it.", sv: "Inuti molnet snarare än under det." } },
    ],
  },
];

/** Verdict words attached to a score. */
export const SCORING = {
  /** Score thresholds and the i18n key for the word attached to each. */
  labels: [[80, 'verdict.excellent'], [65, 'verdict.good'], [50, 'verdict.workable'], [32, 'verdict.marginal'], [0, 'verdict.poor']],
};

export const activityById = (id) => ACTIVITIES.find((a) => a.id === id) ?? ACTIVITIES[0];
/** Activities that make sense on a given peak. */
export const activitiesFor = (mtn) => ACTIVITIES.filter(
  (a) => !a.requires || (mtn.features ?? []).includes(a.requires),
);

/* ---------------------------------------------------------------------------
   Provenance. Every upstream source, its licence, and the credit it asks for.
   `verified` is the date these were last read from the provider's own page —
   licences change, so treat anything older than a few months as needing a look.
--------------------------------------------------------------------------- */
export const SOURCES = {
  verified: '2026-08-31',
  aggregator: {
    name: 'Open-Meteo',
    url: 'https://open-meteo.com',
    terms: 'https://open-meteo.com/en/terms',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    tier: {
      en: 'Free tier — no API key, non-commercial use only, under 10 000 API calls per day.',
      sv: 'Kostnadsfri nivå — ingen API-nyckel, endast icke-kommersiell användning, under 10 000 anrop per dygn.',
    },
  },
  providers: [
    {
      key: 'metno_seamless', org: 'MET Norway', product: 'MET Nordic (1 km)',
      country: 'Norway', licence: 'NLOD 2.0 and CC BY 4.0',
      credit: 'Data from MET Norway',
      url: 'https://api.met.no/', licenceUrl: 'https://api.met.no/doc/License',
    },
    {
      key: 'dmi_seamless', org: 'DMI', product: 'Harmonie AROME (2 km)',
      country: 'Denmark', licence: 'CC BY 4.0',
      credit: 'Atmospheric forecasts from the Danish Meteorological Institute',
      url: 'https://opendatadocs.dmi.govcloud.dk/', licenceUrl: 'https://opendatadocs.dmi.govcloud.dk/en/Terms_of_Use',
    },
    {
      key: 'icon_seamless', org: 'Deutscher Wetterdienst', product: 'ICON / ICON-EU / ICON-D2',
      country: 'Germany', licence: 'CC BY 4.0',
      credit: 'Deutscher Wetterdienst',
      url: 'https://opendata.dwd.de/', licenceUrl: 'https://www.dwd.de/EN/service/copyright/copyright_node.html',
    },
    {
      key: 'ecmwf_ifs025', org: 'ECMWF', product: 'IFS 0.25° open data',
      country: 'Europe', licence: 'CC BY 4.0',
      credit: 'Based on data and products of the European Centre for Medium-Range Weather Forecasts (ECMWF)',
      url: 'https://www.ecmwf.int/en/forecasts/datasets/open-data', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    },
    {
      key: 'ukmo_seamless', org: 'UK Met Office', product: 'Unified Model global (10 km)',
      country: 'United Kingdom',
      licence: { en: 'CC BY-SA 4.0 upstream — see the note below', sv: 'CC BY-SA 4.0 i ursprungskällan — se noteringen nedan' },
      credit: 'Contains public sector information licensed by the UK Met Office',
      url: 'https://registry.opendata.aws/met-office-global-deterministic/', licenceUrl: 'https://registry.opendata.aws/met-office-global-deterministic/',
      caveat: true,
    },
    {
      key: 'gfs_seamless', org: 'NOAA / NCEP', product: 'GFS and HRRR',
      country: 'United States',
      licence: { en: 'Public domain (US Government work)', sv: 'Fri från upphovsrätt (amerikansk myndighetsprodukt)' },
      credit: {
        en: 'NOAA National Centers for Environmental Prediction (credit given as a courtesy; not required)',
        sv: 'NOAA National Centers for Environmental Prediction (anges av hövlighet; krävs inte)',
      },
      url: 'https://www.nco.ncep.noaa.gov/pmb/products/gfs/', licenceUrl: 'https://www.weather.gov/disclaimer',
    },
  ],
  observations: {
    name: 'SMHI open data — meteorological observations',
    org: 'Sveriges meteorologiska och hydrologiska institut (SMHI)',
    licence: 'Creative Commons Erkännande 4.0 SE (CC BY 4.0)',
    credit: 'Observation data from SMHI',
    url: 'https://opendata.smhi.se/metobs/introduction',
    licenceUrl: 'https://www.smhi.se/data/om-smhis-data/villkor-for-anvandning',
    note: {
      en: 'Live station readings, used to sanity-check the forecast. Never blended into it.',
      sv: 'Aktuella stationsavläsningar som rimlighetskontroll av prognosen. Vägs aldrig in i den.',
    },
  },
  ensemble: {
    name: 'ICON-EU EPS / GFS ensemble', org: 'DWD and NOAA',
    note: {
      en: 'Used only for the p10–p90 spread and the probability of precipitation.',
      sv: 'Används bara för spridningen p10–p90 och nederbördsrisken.',
    },
  },
  reanalysis: {
    name: 'ERA5-Land', org: 'Copernicus Climate Change Service (C3S) / ECMWF',
    licence: {
      en: 'Creative Commons Attribution (CC BY) since 2 July 2025',
      sv: 'Creative Commons Erkännande (CC BY) sedan 2 juli 2025',
    },
    credit: 'Generated using Copernicus Climate Change Service information 2026',
    disclaimer: 'Neither the European Commission nor ECMWF is responsible for any use of the Copernicus information or data it contains.',
    url: 'https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land',
    licenceUrl: 'https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land?tab=overview',
    note: {
      en: 'Used as the training target for the bias correction, never shown as a forecast.',
      sv: 'Används som facit vid träning av biaskorrigeringen, visas aldrig som prognos.',
    },
  },
  projection: {
    name: 'CMIP6 HighResMIP',
    org: {
      en: 'Seven modelling centres, via Open-Meteo',
      sv: 'Sju modellcentra, via Open-Meteo',
    },
    scenario: 'SSP5-8.5',
    licence: 'CC BY 4.0',
    credit: 'CMIP6 model data, WCRP Coupled Model Intercomparison Project Phase 6',
    url: 'https://open-meteo.com/en/docs/climate-api',
    licenceUrl: 'https://pcmdi.llnl.gov/CMIP6/TermsOfUse/TermsOfUse6-1.html',
    note: {
      en: 'Historical runs 1950–2014, projections 2015–2050 under SSP5-8.5. Downscaled to 10 km and bias-corrected against ERA5 by Open-Meteo.',
      sv: 'Historiska körningar 1950–2014, projektioner 2015–2050 enligt SSP5-8.5. Nedskalade till 10 km och biaskorrigerade mot ERA5 av Open-Meteo.',
    },
  },
  fonts: [
    { name: 'Inter', author: 'The Inter Project Authors', licence: 'SIL Open Font License 1.1', url: 'https://rsms.me/inter/', file: 'fonts/LICENSE-Inter.txt' },
    { name: 'JetBrains Mono', author: 'JetBrains', licence: 'SIL Open Font License 1.1', url: 'https://www.jetbrains.com/lp/mono/', file: 'fonts/LICENSE-JetBrainsMono.txt' },
  ],
};


/* ---------------------------------------------------------------------------
   SMHI observations.

   Actual thermometers, as a reality check on the models. Licensed CC BY 4.0 SE:
   free to use and adapt, commercially too, as long as SMHI is credited and
   changes are declared.

   Their terms also ask that you use documented APIs only, and specifically that
   you avoid mass-downloading per location or fetching the same data twice. So
   this uses the `station-set/all` resource: one request returns the latest hour
   for every station in Sweden, which is then cached and reused for every
   mountain and both pages. Browsing all ten peaks costs the same five requests
   as browsing one.
--------------------------------------------------------------------------- */
export const SMHI = {
  base: 'https://opendata-download-metobs.smhi.se/api/version/1.0',
  /** Parameters worth showing, in display order. Numbers are SMHI's own. */
  parameters: [
    { id: 1, key: 'temp', name: 'Air temperature', unit: '°C' },
    { id: 4, key: 'wind', name: 'Wind speed', unit: 'm/s' },
    { id: 3, key: 'dir', name: 'Wind direction', unit: '°' },
    { id: 21, key: 'gust', name: 'Wind gust', unit: 'm/s' },
    { id: 6, key: 'rh', name: 'Relative humidity', unit: '%' },
  ],
  /** How many nearby stations to show per mountain. */
  show: 3,
  /** Consider stations within this many kilometres. */
  radiusKm: 60,
  /**
   * Station ranking. Distance dominates, but a station 800 m below the summit
   * tells you less about the mountain than one at a similar height, so the
   * elevation difference carries a cost too: `km + |Δz| / metresPerKm`.
   */
  metresPerKm: 120,
  /** Observations older than this are shown as stale rather than current. */
  maxAgeMinutes: 150,
  /** Rolling verification log kept in this browser. */
  logLimit: 600,
};

/* ---------------------------------------------------------------------------
   Contact.

   The address is not in this file, in the HTML, or anywhere else a crawler can
   read it — only a ciphertext is. The AES-GCM key is derived from the answer to
   the question below, so answering correctly is what produces the address; a
   wrong answer fails the authentication tag and decrypts to nothing.

   To be clear about what this does and does not do: it stops the bulk address
   harvesters that crawl static sites, which is the entire threat here. It would
   not stop somebody determined who simply reads the question and answers it.
--------------------------------------------------------------------------- */
export const CONTACT = {
  question: {
    en: 'How many metres above sea level is the summit of Åreskutan?',
    sv: 'Hur många meter över havet ligger toppen av Åreskutan?',
  },
  hint: {
    en: 'The number is on the mountain selector at the top of the forecast page.',
    sv: 'Siffran står i bergsväljaren högst upp på prognossidan.',
  },
  placeholder: { en: 'metres', sv: 'meter' },
  subject: 'ÅreWeather',
  issues: 'https://github.com/AntonAlin/AreWeather/issues',
  repo: 'https://github.com/AntonAlin/AreWeather',
  sealed: {
    salt: 'ycl9IgJBCb3If9JLIMA6Zw==',
    iv: 'nvLparx/AQfr9em+',
    ct: 'NXlxnN55NwkAKLlKaGT9o0oaNZNAmJJAKqtYXFF3DOceLn22',
    iterations: 310000,
  },
};

/* ---------------------------------------------------------------------------
   Other people's pages.

   A forecast is not the only thing that decides whether a day happens. The
   avalanche bulletin, whether the lift is turning, whether the road over to
   Storulvån is open, whether the hut is even staffed this month — none of that
   is weather, and all of it ends a plan.

   Links were checked on the date in `verified`. If one has moved, it has moved.
--------------------------------------------------------------------------- */
export const RESOURCES = {
  verified: '2026-08-31',
  groups: [
    {
      id: 'safety',
      title: { en: 'Avalanche and safety', sv: 'Lavin och säkerhet' },
      intro: {
        en: 'Read the bulletin before you go, every time. This app models the weather that builds a slab; it does not assess a snowpack.',
        sv: 'Läs lavinprognosen innan du åker, varje gång. Den här appen modellerar vädret som bygger flaksnö; den bedömer inte snötäcket.',
      },
      items: [
        {
          name: 'Lavinprognoser.se — Södra Jämtlandsfjällen',
          url: 'https://www.lavinprognoser.se/oversikt-alla-omraden/sodra_jamtlandsfjallen/',
          note: {
            en: 'The official Swedish avalanche forecast for the region covering Åre, Storulvån, Sylarna and Bydalen — every peak in this app. Published daily in season by Naturvårdsverket.',
            sv: 'Den officiella svenska lavinprognosen för området som täcker Åre, Storulvån, Sylarna och Bydalen — alla toppar i den här appen. Publiceras dagligen under säsong av Naturvårdsverket.',
          },
          primary: true,
        },
        {
          name: 'Lavinprognoser.se — Västra Härjedalsfjällen',
          url: 'https://www.lavinprognoser.se/oversikt-alla-omraden/vastra_harjedalsfjallen/',
          note: {
            en: 'The neighbouring forecast region to the south — Funäsdalen, Ramundberget, Helags. Worth reading if you are driving that way.',
            sv: 'Grannområdet söderut — Funäsdalen, Ramundberget, Helags. Värt att läsa om du kör åt det hållet.',
          },
        },
        {
          name: 'Naturvårdsverket — Säkerhet i fjällen',
          url: 'https://www.naturvardsverket.se/amnesomraden/friluftsliv/sakerhet-i-fjallen/',
          note: {
            en: 'Mountain safety, avalanche training and the reasoning behind the national forecast programme.',
            sv: 'Fjällsäkerhet, lavinutbildning och tankarna bakom det nationella prognosprogrammet.',
          },
        },
        {
          name: 'SOS Alarm — 112',
          url: 'https://www.sosalarm.se/',
          note: {
            en: 'Emergencies, including mountain rescue (fjällräddningen). Ask for it by name. Coverage in the fjäll is patchy — an SMS to 112 needs prior registration, so do that before the trip.',
            sv: 'Nödsituationer, inklusive fjällräddningen. Be om den vid namn. Täckningen i fjällen är ojämn — sms till 112 kräver att du registrerat dig i förväg, så gör det före turen.',
          },
        },
      ],
    },
    {
      id: 'live',
      title: { en: 'Webcams and live conditions', sv: 'Webbkameror och läget just nu' },
      intro: {
        en: 'A forecast is a claim about the future. A camera is a fact about the present, and often settles the argument faster.',
        sv: 'En prognos är ett påstående om framtiden. En kamera är ett faktum om nuet, och avgör ofta saken snabbare.',
      },
      items: [
        {
          name: { en: 'SkiStar Åre — weather, slopes and webcams', sv: 'SkiStar Åre — väder, backar och webbkameror' },
          url: 'https://www.skistar.com/sv/vara-skidorter/are/vinter-i-are/vader-och-backar/',
          note: {
            en: 'Live webcams across the resort, snow depth, and which lifts and slopes are actually open right now.',
            sv: 'Direktsända webbkameror i hela anläggningen, snödjup, och vilka liftar och backar som faktiskt är öppna just nu.',
          },
          primary: true,
        },
        {
          name: { en: 'Trafikverket — road traffic map', sv: 'Trafikverket — trafikkarta för väg' },
          url: 'https://www.trafikverket.se/trafikinformation/vag/',
          note: {
            en: 'Road cameras and conditions along the E14 and the roads into the fjäll. The camera at a weather station points at the road surface, which tells you more about the drive than any forecast.',
            sv: 'Vägkameror och väglag längs E14 och vägarna in mot fjället. Kameran vid en väderstation är riktad mot vägbanan, vilket säger mer om körningen än någon prognos.',
          },
        },
      ],
    },
    {
      id: 'lifts',
      title: { en: 'Lifts and opening hours', sv: 'Liftar och öppettider' },
      intro: {
        en: 'This app estimates when wind will hold the top lifts. Only SkiStar can tell you whether they are turning.',
        sv: 'Den här appen uppskattar när vinden stoppar topplifterna. Bara SkiStar kan säga om de faktiskt går.',
      },
      items: [
        {
          name: { en: 'Lift opening hours, winter', sv: 'Liftarnas öppettider, vinter' },
          url: 'https://www.skistar.com/sv/vara-skidorter/are/vinter-i-are/vader-och-backar/liftarnas-oppettider/',
          note: {
            en: 'Opening hours for every lift in Åre, Åre Björnen, Duved and Tegefjäll, from opening day to the end of the season.',
            sv: 'Öppettider för varje lift i Åre, Åre Björnen, Duved och Tegefjäll, från öppningsdagen till säsongens slut.',
          },
          primary: true,
        },
        {
          name: { en: 'Summer opening hours and the bike park', sv: 'Sommaröppettider och cykelparken' },
          url: 'https://www.skistar.com/sv/vara-skidorter/are/sommar-i-are/oppettider/',
          note: {
            en: 'The Kabinbanan, the bike park and summer activities. The downhill scores in this app assume the park is open — check here first.',
            sv: 'Kabinbanan, cykelparken och sommaraktiviteter. Cykelbetygen i appen förutsätter att parken är öppen — kolla här först.',
          },
        },
      ],
    },
    {
      id: 'huts',
      title: { en: 'Huts and trails', sv: 'Stugor och leder' },
      intro: {
        en: 'The mountain stations are not open all year, and the seasons have been getting shorter. Check before you plan a traverse around them.',
        sv: 'Fjällstationerna är inte öppna året runt, och säsongerna har blivit kortare. Kontrollera innan du planerar en tur runt dem.',
      },
      items: [
        {
          name: 'STF Storulvån',
          url: 'https://www.svenskaturistforeningen.se/boende/stf-storulvan-fjallstation/',
          note: {
            en: 'The road-accessible corner of the Jämtland triangle, and the usual start for Storsnasen and Getryggen.',
            sv: 'Det hörn av Jämtlandstriangeln som nås med bil, och den vanliga starten för Storsnasen och Getryggen.',
          },
        },
        {
          name: 'STF Sylarna',
          url: 'https://www.svenskaturistforeningen.se/boende/stf-sylarna-fjallstation/',
          note: { en: 'Under Storsylen, deep in the range and a long way from a road.', sv: 'Under Storsylen, långt inne i fjällen och långt från väg.' },
        },
        {
          name: 'STF Blåhammaren',
          url: 'https://www.svenskaturistforeningen.se/boende/stf-blahammaren/',
          note: {
            en: 'Sweden\'s highest mountain station. Services have been cut back in recent years — the kitchen is no longer what it was.',
            sv: 'Sveriges högst belägna fjällstation. Servicen har dragits ned de senaste åren — köket är inte vad det var.',
          },
        },
        {
          name: 'Jämtlandstriangeln',
          url: 'https://www.jamtlandstriangeln.se/',
          note: {
            en: 'The classic three-day circuit between Storulvån, Sylarna and Blåhammaren — the reason most visitors come here on foot.',
            sv: 'Den klassiska tredagarsrundan mellan Storulvån, Sylarna och Blåhammaren — anledningen till att de flesta besökare kommer hit till fots.',
          },
          primary: true,
        },
      ],
    },
    {
      id: 'local',
      title: { en: 'Local knowledge and etiquette', sv: 'Lokal kunskap och hänsyn' },
      intro: {
        en: 'These are working reindeer grazing lands, not a park. Knowing that is the difference between a visitor and a guest.',
        sv: 'Det här är renbetesmarker i bruk, inte en park. Att veta det är skillnaden mellan en besökare och en gäst.',
      },
      items: [
        {
          name: { en: 'Åre kommun — changes in the western Jämtland fjäll', sv: 'Åre kommun — förändringar i västra Jämtlandsfjällen' },
          url: 'https://are.se/uppleva-och-gora/natur-och-friluftsliv/vandring/forandringar-i-vastra-jamtlandsfjallen',
          note: {
            en: 'Why hut seasons and services have been reduced, and what is being asked of visitors in the reindeer herding areas.',
            sv: 'Varför stugsäsonger och service dragits ned, och vad som förväntas av besökare i renskötselområdena.',
          },
          primary: true,
        },
        {
          name: { en: 'Länsstyrelsen Jämtland — nature and outdoor life', sv: 'Länsstyrelsen Jämtland — natur och friluftsliv' },
          url: 'https://www.lansstyrelsen.se/jamtland/besoksmal/naturreservat.html',
          note: {
            en: 'Reserves, protected areas and the local rules that apply inside them.',
            sv: 'Naturreservat, skyddade områden och de regler som gäller i dem.',
          },
        },
        {
          name: { en: 'Naturvårdsverket — the right of public access', sv: 'Naturvårdsverket — allemansrätten' },
          url: 'https://www.naturvardsverket.se/amnesomraden/allemansratten/',
          note: {
            en: 'What you may and may not do. Do not disturb, do not destroy — and in the fjäll, give reindeer a very wide berth.',
            sv: 'Vad du får och inte får göra. Inte störa, inte förstöra — och i fjällen: håll gott om avstånd till renar.',
          },
        },
      ],
    },
    {
      id: 'official',
      title: { en: 'Official forecasts and warnings', sv: 'Officiella prognoser och varningar' },
      intro: {
        en: 'This app is not an authority and issues no warnings. When SMHI has something to say, it outranks anything here.',
        sv: 'Den här appen är ingen myndighet och utfärdar inga varningar. När SMHI säger något väger det tyngre än allt här.',
      },
      items: [
        {
          name: { en: 'SMHI — warnings and forecasts', sv: 'SMHI — varningar och prognoser' },
          url: 'https://www.smhi.se/vader',
          note: {
            en: 'The Swedish national weather service. Official warnings for wind, snow and ice, and the mountain forecast for the fjäll.',
            sv: 'Sveriges meteorologiska och hydrologiska institut. Officiella vädervarningar för vind, snö och is, samt fjällprognosen.',
          },
          primary: true,
        },
        {
          name: 'Yr — MET Norway',
          url: 'https://www.yr.no/',
          note: {
            en: 'The Norwegian service, whose MET Nordic model this app already leans on most heavily. A useful second opinion in plain form.',
            sv: 'Den norska tjänsten, vars modell MET Nordic den här appen redan väger tyngst. En användbar andra åsikt i enkel form.',
          },
        },
        {
          name: 'Open-Meteo',
          url: 'https://open-meteo.com/',
          note: {
            en: 'The aggregator every forecast on this site comes through. Their own charts are worth a look if you want the raw model output.',
            sv: 'Aggregatorn som alla prognoser på sajten går genom. Deras egna diagram är värda en titt om du vill se rå modellutdata.',
          },
        },
        {
          name: { en: 'SMHI open data — observations', sv: 'SMHI öppna data — observationer' },
          url: 'https://opendata.smhi.se/metobs/introduction',
          note: {
            en: 'The station readings behind the ground-truth panel, if you want to query them yourself.',
            sv: 'Stationsavläsningarna bakom panelen Verkligheten, om du vill hämta dem själv.',
          },
        },
      ],
    },
  ],
};
