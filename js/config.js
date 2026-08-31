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
    blurb: 'The home mountain. Village-to-summit is 1040 m of vert in 6 km — the standard test piece for both running and skinning.',
    tags: ['Trail running', 'Ski mountaineering', 'Lift access'],
    features: ['lift', 'forest'],
  },
  {
    id: 'mullfjallet', name: 'Mullfjället', lat: 63.4180, lon: 12.9300,
    summit: 1120, base: 450, exposure: 1.24,
    blurb: 'Duved’s quiet neighbour. Broad north-east bowls hold snow late and the ridge line runs fast and dry in summer.',
    tags: ['Ski touring', 'Trail running'],
    features: ['forest', 'bowl'],
  },
  {
    id: 'renfjallet', name: 'Renfjället', lat: 63.3480, lon: 13.1200,
    summit: 1054, base: 400, exposure: 1.18,
    blurb: 'South of the lake, so it catches sun and loses snow first. Reliable shoulder-season running when the north side is still white.',
    tags: ['Trail running'],
    features: ['forest'],
  },
  {
    id: 'ottfjallet', name: 'Ottfjället', lat: 63.2500, lon: 13.2450,
    summit: 1246, base: 500, exposure: 1.22,
    blurb: 'The Vålådalen gateway. Long rolling approach, wind-scoured plateau up top.',
    tags: ['Trail running', 'Ski touring'],
    features: ['plateau', 'forest'],
  },
  {
    id: 'hundshogen', name: 'Hundshögen', lat: 63.2670, lon: 12.7350,
    summit: 1372, base: 600, exposure: 1.30,
    blurb: 'Steep east-facing lines above Ånn and a summit that sees the raw westerly before anywhere else in the valley.',
    tags: ['Ski mountaineering'],
    features: ['plateau', 'steep'],
  },
  {
    id: 'blahammaren', name: 'Blåhammaren', lat: 63.2010, lon: 12.4040,
    summit: 1086, base: 620, exposure: 1.32,
    blurb: 'Sweden’s highest mountain station. Famously exposed — the wind here is the wind everyone else gets an hour later.',
    tags: ['Ski touring', 'Hut to hut'],
    features: ['plateau'],
  },
  {
    id: 'storsnasen', name: 'Storsnasen', lat: 63.1780, lon: 12.5060,
    summit: 1462, base: 700, exposure: 1.36,
    blurb: 'The Snasahögarna high point. Big alpine feel, corniced ridges, the classic Storulvån day tour.',
    tags: ['Ski mountaineering', 'Trail running'],
    features: ['plateau', 'steep'],
  },
  {
    id: 'getryggen', name: 'Getryggen', lat: 63.1160, lon: 12.4380,
    summit: 1250, base: 700, exposure: 1.28,
    blurb: 'The knife-edge between Storulvån and Sylarna. Narrow, loaded on the lee side, a serious place in wind.',
    tags: ['Ski mountaineering'],
    features: ['plateau', 'steep'],
  },
  {
    id: 'bunnerstoten', name: 'Bunnerstöten', lat: 63.0720, lon: 12.5700,
    summit: 1372, base: 700, exposure: 1.30,
    blurb: 'Bunnerfjällen’s high point above the twin lakes — remote, long approach, superb spring corn.',
    tags: ['Ski mountaineering'],
    features: ['plateau', 'steep'],
  },
  {
    id: 'storsylen', name: 'Storsylen', lat: 63.0330, lon: 12.2230,
    summit: 1728, base: 800, exposure: 1.40,
    blurb: 'The roof of the region, right on the Norwegian border. Real mountaineering terrain and the harshest weather in the area.',
    tags: ['Ski mountaineering', 'Alpine'],
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
    id: 'trail', name: 'Trail running', short: 'Trail run', base: 100, window: 3,
    requires: null, season: { snowMax: 0.45, over: 'too much snow underfoot' },
    blurb: 'Moving fast in light kit, so wind chill and wet arrive quickly.',
    rules: [
      { kind: 'ramp', metric: 'precip', from: 0, slope: 16, cap: 42, label: 'precipitation', why: 'Wet rock and wet feet, and it only gets colder with height.' },
      { kind: 'ramp', metric: 'wind', from: 6, slope: 3.4, cap: 34, label: 'wind', why: 'Above about 6 m/s a headwind starts costing real pace on an exposed ridge.' },
      { kind: 'ramp', metric: 'gust', from: 15, slope: 1.7, cap: 15, label: 'gusts', why: 'Gusts are what actually knock you off a line, not the mean wind.' },
      { kind: 'ramp', metric: 'chill', from: 0, slope: 2.3, cap: 30, label: 'wind chill', reads: 'feels-like below 0 °C', why: 'Below freezing on skin, a running kit stops being enough.' },
      { kind: 'ramp', metric: 'feels', from: 20, slope: 2.6, cap: 24, label: 'heat', why: 'Rare in the fjäll, punishing when it happens.' },
      { kind: 'ramp', metric: 'snowDepth', from: 0.25, slope: 60, cap: 26, label: 'deep snow underfoot', why: 'Modelled snow cover deep enough to wreck footing.' },
      { kind: 'flag', flag: 'summitInCloud', amount: 9, label: 'summit in cloud', why: 'No view, and navigation by feel.' },
      { kind: 'flag', flag: 'night', amount: 13, label: 'darkness', why: 'Headlamp territory — outside sunrise and sunset for that day.' },
      { kind: 'flag', flag: 'sleet', amount: 7, label: 'sleet', why: 'The single worst thing to be wet in.' },
      { kind: 'flag', flag: 'thunder', amount: 10, label: 'thunder risk', why: 'CAPE above 700 J/kg — get off the high ground.' },
    ],
  },
  {
    id: 'hike', name: 'Hiking', short: 'Hike', base: 100, window: 5,
    requires: null, season: null,
    blurb: 'Slower than running, so more hours exposed — but carrying layers for it.',
    rules: [
      { kind: 'ramp', metric: 'precip', from: 0, slope: 10, cap: 30, label: 'precipitation', why: 'You have a shell, but a whole day in it still grinds.' },
      { kind: 'ramp', metric: 'wind', from: 8, slope: 2.6, cap: 28, label: 'wind', why: 'Walking pace into a headwind is survivable in a way that running is not.' },
      { kind: 'ramp', metric: 'gust', from: 18, slope: 1.4, cap: 12, label: 'gusts', why: 'Enough to stagger you on a loaded pack.' },
      { kind: 'ramp', metric: 'chill', from: 3, slope: 1.8, cap: 26, label: 'cold', reads: 'feels-like below −3 °C', why: 'Slow movement generates little heat; this is where hypothermia starts.' },
      { kind: 'ramp', metric: 'feels', from: 24, slope: 2, cap: 16, label: 'heat', why: 'Little shade above the treeline.' },
      { kind: 'ramp', metric: 'snowDepth', from: 0.3, slope: 45, cap: 24, label: 'deep snow', why: 'Post-holing turns five kilometres into a day.' },
      { kind: 'flag', flag: 'summitInCloud', amount: 7, label: 'summit in cloud', why: 'The view was the point, and navigation gets serious.' },
      { kind: 'flag', flag: 'night', amount: 10, label: 'darkness', why: 'Outside sunrise and sunset for that day.' },
      { kind: 'flag', flag: 'thunder', amount: 14, label: 'thunder risk', why: 'You are slower than a storm, and there is nowhere to get to.' },
    ],
  },
  {
    id: 'thru', name: 'Hut to hut', short: 'Thru-hike', base: 100, window: 8,
    requires: null, season: null,
    blurb: 'Jämtlandstriangeln and the long routes — a whole day out, then a night in it.',
    rules: [
      { kind: 'ramp', metric: 'precip', from: 0, slope: 13, cap: 34, label: 'precipitation', why: 'Everything you own is wet by hut two, and it stays wet.' },
      { kind: 'ramp', metric: 'rain24', from: 5, slope: 1.6, cap: 20, label: 'saturated ground', why: 'Yesterday\'s rain is today\'s bog and tomorrow\'s river crossing.' },
      { kind: 'ramp', metric: 'wind', from: 9, slope: 2.4, cap: 26, label: 'wind', why: 'Hours of it, with a pack, across open fjäll.' },
      { kind: 'ramp', metric: 'chill', from: 5, slope: 1.6, cap: 24, label: 'cold', reads: 'feels-like below −5 °C', why: 'A full day of it, and the night after.' },
      { kind: 'ramp', metric: 'feels', from: 25, slope: 1.8, cap: 12, label: 'heat', why: 'Water between huts becomes the planning problem.' },
      { kind: 'ramp', metric: 'snowDepth', from: 0.25, slope: 40, cap: 22, label: 'deep snow', why: 'Summer routes under snow are a different trip entirely.' },
      { kind: 'flag', flag: 'summitInCloud', amount: 8, label: 'cloud on the tops', why: 'Route-finding between cairns you cannot see.' },
      { kind: 'flag', flag: 'thunder', amount: 12, label: 'thunder risk', why: 'Long exposed traverses with no shelter for hours.' },
      { kind: 'flag', flag: 'night', amount: 8, label: 'darkness', why: 'Walking a stage in the dark is a choice, rarely a good one.' },
    ],
  },
  {
    id: 'skimo', name: 'Ski mountaineering', short: 'Ski tour', base: 74, window: 4,
    requires: null, season: { snowMin: 0.05, under: 'no snow cover' },
    blurb: 'Earning the turns. Wind loading matters as much as the weather does.',
    rules: [
      { kind: 'ramp', metric: 'coverDeficit', from: 0, slope: 90, cap: 28, label: 'thin cover', reads: 'snow depth below 0.30 m', why: 'Below 30 cm the rocks are still in play.' },
      { kind: 'bonus', metric: 'coverSurplus', from: 0, slope: 22, cap: 14, label: 'good base', reads: 'snow depth above 0.30 m', why: 'A deep base covers the sharks.' },
      { kind: 'bonus', metric: 'newSnow24', from: 0, slope: 1.6, cap: 18, label: 'fresh snow', why: 'The entire point of the exercise.' },
      { kind: 'ramp', metric: 'wind', from: 8, slope: 3.1, cap: 36, label: 'wind', why: 'Skinning into 15 m/s on a plateau is its own kind of misery.' },
      { kind: 'ramp', metric: 'gust', from: 18, slope: 1.5, cap: 14, label: 'gusts', why: 'Gusts on a corniced ridge are a safety problem, not a comfort one.' },
      { kind: 'ramp', metric: 'rain', from: 0, slope: 18, cap: 38, label: 'rain on snow', why: 'Ruins the surface and soaks the pack.' },
      { kind: 'ramp', metric: 'chill', from: 20, slope: 1.6, cap: 18, label: 'severe cold', reads: 'feels-like below −20 °C', why: 'Exposed skin has minutes.' },
      { kind: 'ramp', metric: 'temp', from: 3, slope: 5, cap: 16, label: 'warm, wet snow', why: 'Isothermal mush, and a wet-loose problem in steep terrain.' },
      { kind: 'ramp', metric: 'drift', from: 45, slope: 0.35, cap: 18, label: 'wind slab building', why: 'Meteorological wind loading — see the avalanche warning.' },
      { kind: 'flag', flag: 'summitInCloud', amount: 15, label: 'flat light, no visibility', why: 'You cannot read terrain you cannot see.' },
      { kind: 'flag', flag: 'overcastOnly', amount: 7, label: 'flat light', why: 'Cloud above the summit still kills the contrast.' },
      { kind: 'flag', flag: 'night', amount: 12, label: 'darkness', why: 'Outside sunrise and sunset for that day.' },
    ],
  },
  {
    id: 'alpine', name: 'Alpine skiing', short: 'Piste', base: 78, window: 5,
    requires: 'lift', season: { snowMin: 0.08, under: 'no snow cover' },
    blurb: 'Lift-served. The thing that ends the day here is wind, not cold.',
    rules: [
      { kind: 'bonus', metric: 'newSnow24', from: 0, slope: 1.4, cap: 16, label: 'fresh snow', why: 'A powder morning is why you booked the week.' },
      { kind: 'bonus', metric: 'coverSurplus', from: 0, slope: 18, cap: 12, label: 'deep base', why: 'Everything open, nothing showing through.' },
      { kind: 'ramp', metric: 'wind', from: 12, slope: 3.6, cap: 40, label: 'wind — lift holds', why: 'The top lifts on Åreskutan stop in a strong westerly long before the skiing gets bad.' },
      { kind: 'ramp', metric: 'gust', from: 20, slope: 2.2, cap: 20, label: 'gusts', why: 'Gusts are what actually put a chairlift on hold.' },
      { kind: 'ramp', metric: 'rain', from: 0, slope: 20, cap: 40, label: 'rain', why: 'Rain on piste is the worst day of the season.' },
      { kind: 'ramp', metric: 'chill', from: 18, slope: 1.5, cap: 16, label: 'severe cold', reads: 'feels-like below −18 °C', why: 'Twelve minutes on an exposed chair changes your plans.' },
      { kind: 'ramp', metric: 'temp', from: 4, slope: 4, cap: 14, label: 'slush', why: 'Spring snow goes from perfect to unskiable in an hour.' },
      { kind: 'flag', flag: 'summitInCloud', amount: 16, label: 'flat light', why: 'Above the treeline in cloud you cannot see the terrain at all.' },
      { kind: 'flag', flag: 'overcastOnly', amount: 6, label: 'dull light', why: 'Contrast still suffers under thick cloud.' },
      { kind: 'flag', flag: 'night', amount: 26, label: 'lifts closed', why: 'Outside daylight, with only limited evening skiing.' },
    ],
  },
  {
    id: 'bike', name: 'Downhill biking', short: 'Bike park', base: 92, window: 4,
    requires: 'lift', season: { snowMax: 0.05, over: 'snow on the trails' },
    blurb: 'Åre Bike Park. Grip, sight lines, and how cold 60 km/h is.',
    rules: [
      { kind: 'ramp', metric: 'precip', from: 0, slope: 14, cap: 34, label: 'rain', why: 'Wet roots and off-camber rock are where the season ends for people.' },
      { kind: 'ramp', metric: 'rain24', from: 4, slope: 2, cap: 22, label: 'soaked trails', why: 'Yesterday\'s rain means ruts, and riding it wrecks the trail for everyone.' },
      { kind: 'ramp', metric: 'wind', from: 10, slope: 2.4, cap: 22, label: 'wind', why: 'Crosswind on the exposed upper sections, and the lift stops before you do.' },
      { kind: 'ramp', metric: 'gust', from: 18, slope: 1.6, cap: 14, label: 'gusts', why: 'A gust while you are in the air is a genuinely bad time.' },
      { kind: 'ramp', metric: 'chill', from: -2, slope: 2.2, cap: 26, label: 'wind chill', reads: 'feels-like below +2 °C', why: 'You are doing 60 km/h downhill and generating no heat at all.' },
      { kind: 'ramp', metric: 'feels', from: 26, slope: 1.6, cap: 10, label: 'heat', why: 'Full-face helmet and body armour in the sun.' },
      { kind: 'flag', flag: 'freezing', amount: 12, label: 'frozen ground', why: 'Frozen ruts and ice in the shade, on tyres meant for dirt.' },
      { kind: 'flag', flag: 'summitInCloud', amount: 10, label: 'fog on the trail', why: 'Blind corners at speed.' },
      { kind: 'flag', flag: 'thunder', amount: 16, label: 'thunder risk', why: 'A chairlift is the worst place on the mountain in a storm.' },
      { kind: 'flag', flag: 'night', amount: 38, label: 'park closed', why: 'Outside daylight hours.' },
    ],
  },
  {
    id: 'kite', name: 'Snowkiting', short: 'Snowkite', base: 46, window: 4,
    requires: 'plateau', season: { snowMin: 0.15, under: 'not enough snow to kite on' },
    blurb: 'The one sport here that wants the wind the others are hiding from.',
    rules: [
      { kind: 'bonus', metric: 'wind', from: 5, slope: 3.4, cap: 36, label: 'usable wind', why: 'Below about 5 m/s the kite will not fly. This is the only score on the site that rewards a gale.' },
      { kind: 'ramp', metric: 'wind', from: 18, slope: 4, cap: 42, label: 'overpowered', why: 'Past 18 m/s you are a passenger, and the fjäll is not a forgiving place to be dragged across.' },
      { kind: 'ramp', metric: 'gustSpread', from: 5, slope: 3, cap: 22, label: 'gusty', why: 'The gap between lull and gust is what breaks lines and shoulders — steady wind beats strong wind.' },
      { kind: 'bonus', metric: 'coverSurplus', from: 0, slope: 14, cap: 10, label: 'good cover', why: 'Deep snow means the rocks and heather are gone.' },
      { kind: 'ramp', metric: 'precip', from: 0, slope: 10, cap: 22, label: 'precipitation', why: 'Wet lines, and visibility you need for speed.' },
      { kind: 'ramp', metric: 'chill', from: 15, slope: 1.4, cap: 16, label: 'severe cold', reads: 'feels-like below −15 °C', why: 'Standing still rigging in a headwind is the coldest part of the day.' },
      { kind: 'flag', flag: 'summitInCloud', amount: 14, label: 'whiteout', why: 'Speed plus no horizon is how people hit things.' },
      { kind: 'flag', flag: 'night', amount: 30, label: 'darkness', why: 'Outside daylight hours.' },
    ],
  },
  {
    id: 'aurora', name: 'Aurora watching', short: 'Aurora', base: 90, window: 3,
    requires: null, season: null,
    night: true,
    blurb: 'Scores the sky, not the sun — clear, dark and moonless. Geomagnetic activity is not modelled.',
    rules: [
      { kind: 'flag', flag: 'night', invert: true, amount: 70, label: 'daylight', why: 'The obvious one, and the reason this is out of the running for half the summer.' },
      { kind: 'ramp', metric: 'cloud', from: 20, slope: 0.7, cap: 45, label: 'cloud cover', why: 'The best display in a decade is invisible under stratus.' },
      { kind: 'ramp', metric: 'moon', from: 0.4, slope: 40, cap: 22, label: 'moonlight', why: 'A gibbous moon washes out everything but the strongest arcs.' },
      { kind: 'ramp', metric: 'precip', from: 0, slope: 20, cap: 30, label: 'precipitation', why: 'If it is falling on you, you are not seeing anything.' },
      { kind: 'ramp', metric: 'chill', from: 10, slope: 1.2, cap: 18, label: 'cold', reads: 'feels-like below −10 °C', why: 'Standing still for an hour, which is the whole activity.' },
      { kind: 'ramp', metric: 'wind', from: 10, slope: 1.8, cap: 16, label: 'wind', why: 'Camera shake, and no reason to be on an exposed summit for it.' },
      { kind: 'flag', flag: 'summitInCloud', amount: 25, label: 'in cloud', why: 'Inside the cloud rather than under it.' },
    ],
  },
];

/** Verdict words attached to a score. */
export const SCORING = {
  labels: [[80, 'Excellent'], [65, 'Good'], [50, 'Workable'], [32, 'Marginal'], [0, 'Poor']],
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
    tier: 'Free tier — no API key, non-commercial use only, under 10 000 API calls per day.',
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
      country: 'United Kingdom', licence: 'CC BY-SA 4.0 upstream — see the note below',
      credit: 'Contains public sector information licensed by the UK Met Office',
      url: 'https://registry.opendata.aws/met-office-global-deterministic/', licenceUrl: 'https://registry.opendata.aws/met-office-global-deterministic/',
      caveat: true,
    },
    {
      key: 'gfs_seamless', org: 'NOAA / NCEP', product: 'GFS and HRRR',
      country: 'United States', licence: 'Public domain (US Government work)',
      credit: 'NOAA National Centers for Environmental Prediction (credit given as a courtesy; not required)',
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
    note: 'Live station readings, used to sanity-check the forecast. Never blended into it.',
  },
  ensemble: {
    name: 'ICON-EU EPS / GFS ensemble', org: 'DWD and NOAA',
    note: 'Used only for the p10–p90 spread and the probability of precipitation.',
  },
  reanalysis: {
    name: 'ERA5-Land', org: 'Copernicus Climate Change Service (C3S) / ECMWF',
    licence: 'Creative Commons Attribution (CC BY) since 2 July 2025',
    credit: 'Generated using Copernicus Climate Change Service information 2026',
    disclaimer: 'Neither the European Commission nor ECMWF is responsible for any use of the Copernicus information or data it contains.',
    url: 'https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land',
    licenceUrl: 'https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land?tab=overview',
    note: 'Used as the training target for the bias correction, never shown as a forecast.',
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
  question: 'How many metres above sea level is the summit of Åreskutan?',
  hint: 'The number is on the mountain selector at the top of the forecast page.',
  placeholder: 'metres',
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
