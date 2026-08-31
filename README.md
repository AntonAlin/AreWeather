# ÅreWeather

An elevation-resolved mountain weather forecast for the Åre fjäll in Jämtland, Sweden — built for
trail runners and ski mountaineers, and small enough to host on GitHub Pages as plain static files.

No build step, no framework, no API key, no server. Open `index.html` and it works.

![Ten peaks from Åreskutan to Storsylen, each with a full elevation profile](https://img.shields.io/badge/peaks-10-4fd1ff) ![Static site](https://img.shields.io/badge/stack-vanilla%20JS-a78bfa)

## What it actually does

Most weather sites give you one number for a mountain. A mountain is not one number: on Åreskutan
the summit and the village are 1040 m apart, which on a normal day is 6–7 °C — and on an inversion
day the summit is *warmer* than the village. This app forecasts every 100 m band separately.

- **Six numerical weather models** per peak via [Open-Meteo](https://open-meteo.com): MET Norway
  MET Nordic (1 km — the best model over Scandinavian terrain), DMI Harmonie AROME (2 km), DWD ICON,
  ECMWF IFS, UKMO UM and NOAA GFS.
- **A real sounding, not a lapse-rate guess.** Temperature, humidity and wind on pressure levels
  from 1000 to 500 hPa, with their geopotential heights, give the true vertical structure — so
  inversions, isothermal layers and shear come through instead of being averaged away.
- **Physical downscaling.** The sounding is anchored to the surface ensemble at model height and
  interpolated to every band. Wind blends from the surface boundary layer into the free atmosphere
  and is multiplied by a per-peak terrain exposure factor. Precipitation gets orographic
  enhancement with height.
- **Phase from wet-bulb temperature**, which is what actually decides rain versus snow, then a
  temperature-dependent snow ratio to turn millimetres into centimetres.
- **Machine learning trained in your browser.** 45 days of archived forecasts from every model are
  scored against ERA5-Land reanalysis at that exact point. A ridge regression learns the residual
  temperature and wind bias, a logistic model calibrates precipitation probability, and a softmax
  over measured error decides how much each model is worth. All of it is validated on a hold-out
  block and **switched off automatically if it does not beat the raw ensemble** — the learning log
  panel reports that honestly either way.
- **Ensemble probabilities** from a 20–30 member ICON-EU / GFS ensemble for the p10–p90 bands.
- **Activity verdicts** for trail running and ski mountaineering, each with the specific factor
  that is limiting it and the best window in the next 48 hours.
- **Works with no signal.** The last forecast for each peak is cached in `localStorage` and a
  service worker caches the app shell, so the page opens at the trailhead and tells you how old
  the data is.

## Deploying to GitHub Pages

Everything is static at the repository root, so either method works:

**Option A — deploy from a branch (simplest)**
1. Push this repository to GitHub.
2. *Settings → Pages → Source: Deploy from a branch*, pick your branch and `/ (root)`.
3. The site appears at `https://<user>.github.io/<repo>/`.

**Option B — GitHub Actions**
`.github/workflows/pages.yml` is included and deploys the root on every push to `main`. Set
*Settings → Pages → Source: GitHub Actions* and it runs itself.

`.nojekyll` is present so Jekyll does not touch the files. There is nothing to build and no
dependency to install.

## Running it locally

```bash
python3 -m http.server 8000     # any static server; ES modules need http://, not file://
```

## Verifying changes

```bash
node tools/selftest.mjs
```

The self-test feeds synthetic Open-Meteo-shaped payloads through the real physics, ML and assembly
code with no network access, and asserts the results are physically sensible: dew point behaviour,
the textbook wet-bulb case, recovery of an injected lapse rate, inversion detection, the snow line
landing between base and summit, and — importantly — that the ridge regression actually recovers a
deliberately injected model bias and improves hold-out error.

## Adding or editing a mountain

Everything about a peak lives in one object in [`js/config.js`](js/config.js):

```js
{
  id: 'areskutan', name: 'Åreskutan', lat: 63.4262, lon: 13.0665,
  summit: 1420, base: 380, exposure: 1.34,
  blurb: '…', tags: ['Trail running', 'Ski mountaineering'],
}
```

`exposure` is the terrain wind-acceleration factor at the summit (≈1.0 for a sheltered forested top,
≈1.4 for a bare exposed dome). Nothing else in the codebase knows about specific mountains.

Physical tunables — lapse-rate fallback, anchor decay scale, orographic enhancement, wet-bulb phase
thresholds, snow-drift threshold — are all together in the `PHYS` block of the same file.

## Layout

```
index.html          shell
styles.css          design system
js/config.js        peaks, models, endpoints, physical tunables
js/api.js           Open-Meteo fetching, progressive fallback, caching
js/physics.js       thermodynamics, soundings, elevation downscaling
js/ml.js            ridge / logistic regression, model skill weighting, validation
js/forecast.js      assembles everything into one view model, activity scoring
js/charts.js        hand-rolled SVG: elevation matrix, vertical profile, hourly
js/ui.js            panels
js/main.js          state and wiring
sw.js               offline app shell
tools/selftest.mjs  offline physics + ML test harness
```

## Honest limitations

- ERA5-Land reanalysis is a ~9 km grid estimate, not a summit weather station. The learned
  correction removes systematic model bias; it cannot know about the last few hundred metres of
  local terrain effect.
- Terrain exposure factors are hand-set per peak, not measured.
- Elevations and coordinates are approximate summit positions.
- **This is not an avalanche forecast.** Wind-loading and new-snow figures are meteorological
  indices only. For avalanche danger in the Swedish fjäll use
  [lavinprognoser.se](https://www.lavinprognoser.se); for official warnings, [SMHI](https://www.smhi.se).

## Credits

Weather data from [Open-Meteo](https://open-meteo.com) (CC BY 4.0), aggregating MET Norway, DMI,
DWD, ECMWF, UKMO, NOAA and ERA5-Land. No tracking, no analytics, no accounts.
