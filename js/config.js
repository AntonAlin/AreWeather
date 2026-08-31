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

/* Peaks and massifs around Åre that people actually run up or ski off.
   `summit` / `base` in metres, `exposure` is the terrain wind acceleration
   factor at the summit (1.0 = sheltered forest, 1.4 = bare exposed dome). */
export const MOUNTAINS = [
  {
    id: 'areskutan', name: 'Åreskutan', lat: 63.4262, lon: 13.0665,
    summit: 1420, base: 380, exposure: 1.34,
    blurb: 'The home mountain. Village-to-summit is 1040 m of vert in 6 km — the standard test piece for both running and skinning.',
    tags: ['Trail running', 'Ski mountaineering', 'Lift access'],
  },
  {
    id: 'mullfjallet', name: 'Mullfjället', lat: 63.4180, lon: 12.9300,
    summit: 1120, base: 450, exposure: 1.24,
    blurb: 'Duved’s quiet neighbour. Broad north-east bowls hold snow late and the ridge line runs fast and dry in summer.',
    tags: ['Ski touring', 'Trail running'],
  },
  {
    id: 'renfjallet', name: 'Renfjället', lat: 63.3480, lon: 13.1200,
    summit: 1054, base: 400, exposure: 1.18,
    blurb: 'South of the lake, so it catches sun and loses snow first. Reliable shoulder-season running when the north side is still white.',
    tags: ['Trail running'],
  },
  {
    id: 'ottfjallet', name: 'Ottfjället', lat: 63.2500, lon: 13.2450,
    summit: 1246, base: 500, exposure: 1.22,
    blurb: 'The Vålådalen gateway. Long rolling approach, wind-scoured plateau up top.',
    tags: ['Trail running', 'Ski touring'],
  },
  {
    id: 'hundshogen', name: 'Hundshögen', lat: 63.2670, lon: 12.7350,
    summit: 1372, base: 600, exposure: 1.30,
    blurb: 'Steep east-facing lines above Ånn and a summit that sees the raw westerly before anywhere else in the valley.',
    tags: ['Ski mountaineering'],
  },
  {
    id: 'blahammaren', name: 'Blåhammaren', lat: 63.2010, lon: 12.4040,
    summit: 1086, base: 620, exposure: 1.32,
    blurb: 'Sweden’s highest mountain station. Famously exposed — the wind here is the wind everyone else gets an hour later.',
    tags: ['Ski touring', 'Hut to hut'],
  },
  {
    id: 'storsnasen', name: 'Storsnasen', lat: 63.1780, lon: 12.5060,
    summit: 1462, base: 700, exposure: 1.36,
    blurb: 'The Snasahögarna high point. Big alpine feel, corniced ridges, the classic Storulvån day tour.',
    tags: ['Ski mountaineering', 'Trail running'],
  },
  {
    id: 'getryggen', name: 'Getryggen', lat: 63.1160, lon: 12.4380,
    summit: 1250, base: 700, exposure: 1.28,
    blurb: 'The knife-edge between Storulvån and Sylarna. Narrow, loaded on the lee side, a serious place in wind.',
    tags: ['Ski mountaineering'],
  },
  {
    id: 'bunnerstoten', name: 'Bunnerstöten', lat: 63.0720, lon: 12.5700,
    summit: 1372, base: 700, exposure: 1.30,
    blurb: 'Bunnerfjällen’s high point above the twin lakes — remote, long approach, superb spring corn.',
    tags: ['Ski mountaineering'],
  },
  {
    id: 'storsylen', name: 'Storsylen', lat: 63.0330, lon: 12.2230,
    summit: 1728, base: 800, exposure: 1.40,
    blurb: 'The roof of the region, right on the Norwegian border. Real mountaineering terrain and the harshest weather in the area.',
    tags: ['Ski mountaineering', 'Alpine'],
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
