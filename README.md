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
- **A ground-truth panel** reading live SMHI station observations, showing what the nearest
  thermometers actually report against what the forecast claims at their exact elevation — plus a
  rolling verification log kept in your browser, so after a few days the app can state its own
  measured bias at that peak. Observations are never blended into the forecast.
- **Eight activities scored side by side** — trail running, hiking, hut-to-hut, ski mountaineering,
  alpine skiing, downhill biking, snowkiting and aurora watching — ranked by how good each one is
  right now, each with the specific factor limiting it and its best window. Every sport has its own
  window length, its own season, and its own idea of good: snowkiting is the only score on the site
  that *rewards* a gale, and aurora watching is the only one scored after dark. Activities are
  gated on terrain, so a bike park lap is not offered on a peak with no lift.
- **A comparison view** answering the question people actually have — *where should I go on
  Saturday?* — by scoring all ten peaks across the next seven days in one grid, with the best
  three-hour daylight window on each day. Two small requests per peak, three at a time, sharing the
  same cache as the detail view, and switching activity re-scores without refetching anything.
- **Works with no signal.** The last forecast for each peak is cached in `localStorage` and a
  service worker caches the app shell, so the page opens at the trailhead and tells you how old
  the data is.

## Deploying to GitHub Pages

Live at **https://antonalin.github.io/AreWeather/**

Everything is static at the repository root, so deployment is a repository setting and nothing
else: *Settings → Pages → Source: **Deploy from a branch**, branch `main`, folder `/ (root)`*.
Every push to `main` republishes automatically.

`.nojekyll` is present so Jekyll does not touch the files. There is no build step, no workflow and
no dependency to install — which is the point.

## Putting it on your own domain

1. **Buy the domain** anywhere. Nothing about the site depends on the registrar.
2. **Point DNS at GitHub Pages.** For an apex domain (`areweather.se`), four A records and four
   AAAA records; for a subdomain (`www.areweather.se`), a single CNAME to `antonalin.github.io`.
   The current addresses are in
   [GitHub's docs](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site) —
   check them there rather than trusting a copy in a README.
   Delete any default A record the registrar created for you first.
3. **Update the repository** so the absolute URLs it publishes match:

   ```bash
   node tools/set-domain.mjs areweather.se   # writes CNAME, sitemap.xml, robots.txt, README
   git commit -am "Point the site at areweather.se" && git push
   ```

4. **Set the domain** in *Settings → Pages → Custom domain*, wait for the DNS check to pass, then
   tick **Enforce HTTPS** (the certificate is issued automatically; it can take up to a day).

**The one trap.** Setting the domain in Settings writes a `CNAME` file directly to the deploy
branch. A later push from a branch without that file silently deletes it and the domain stops
working, usually days later when nobody connects the two events. That is exactly why
`set-domain.mjs` commits `CNAME` into the repository — keep it there.

The site itself is path-agnostic: every link, script and font reference is relative, so it works
at `example.com/` and at `user.github.io/repo/` without changes. The only exceptions are the
absolute URLs the script rewrites, and `404.html`, which resolves its own base at runtime because
a 404 is served from an arbitrary path where relative links cannot be trusted.

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
  features: ['lift', 'forest'],
  blurb: '…', tags: ['Trail running', 'Ski mountaineering'],
}
```

`exposure` is the terrain wind-acceleration factor at the summit (≈1.0 for a sheltered forested top,
≈1.4 for a bare exposed dome). `features` decides which activities are offered: `lift` unlocks
alpine skiing and the bike park, `plateau` unlocks snowkiting. Nothing else in the codebase knows
about specific mountains.

## Adding a sport

Activities are data too, in the `ACTIVITIES` array of the same file. A rule is one of three shapes:

```js
{ kind: 'ramp',  metric: 'wind', from: 6,  slope: 3.4, cap: 34, label: 'wind', why: '…' }
{ kind: 'bonus', metric: 'wind', from: 5,  slope: 3.4, cap: 36, label: 'usable wind', why: '…' }
{ kind: 'flag',  flag: 'night', invert: true, amount: 70, label: 'daylight', why: '…' }
```

A `ramp` costs `clamp((value − from) × slope, 0, cap)` points, a `bonus` adds the same, and a `flag`
costs a flat amount when its condition holds — or when it does not, if `invert` is set. Add
`season: { snowMin }` or `{ snowMax }` and the activity reports *out of season* instead of a
misleading number; add `requires: 'lift'` to gate it on terrain; set `night: true` and its best
window is picked after dark. The scorer, the comparison grid and the method page all read the same
definition, so documentation cannot drift from behaviour.

Physical tunables — lapse-rate fallback, anchor decay scale, orographic enhancement, wet-bulb phase
thresholds, snow-drift threshold — are all together in the `PHYS` block of the same file.

## Layout

```
index.html          single-peak forecast
compare.html        all ten peaks, scored side by side for the week
methods.html        every calculation, source and licence
styles.css          design system
js/config.js        peaks, models, endpoints, physical tunables
js/api.js           Open-Meteo fetching, progressive fallback, caching
js/physics.js       thermodynamics, soundings, elevation downscaling
js/ml.js            ridge / logistic regression, model skill weighting, validation
js/forecast.js      assembles everything into one view model, activity scoring
js/charts.js        hand-rolled SVG: elevation matrix, vertical profile, hourly
js/ui.js            panels
js/main.js          state and wiring for the single-peak view
js/observations.js  SMHI station selection, comparison and the verification log
js/compare.js       state and wiring for the comparison view
js/methods.js       renders the method page from the live configuration
sw.js               offline app shell
tools/selftest.mjs  offline physics + ML test harness
```

## Sources, licences and terms

There is a full [method and sources page](methods.html) in the app itself, generated from the same
configuration the forecast runs on, covering every formula and every licence. The short version:

| Source | Used for | Licence | Credit |
| --- | --- | --- | --- |
| [Open-Meteo](https://open-meteo.com) | Serves every model below | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | Free tier: **non-commercial only**, under 10 000 calls/day, no API key |
| [MET Norway](https://api.met.no/doc/License) | MET Nordic 1 km | NLOD 2.0 / CC BY 4.0 | Data from MET Norway |
| [DMI](https://opendatadocs.dmi.govcloud.dk/) | Harmonie AROME 2 km | CC BY 4.0 | Danish Meteorological Institute |
| [DWD](https://www.dwd.de/EN/service/copyright/copyright_node.html) | ICON | CC BY 4.0 | Deutscher Wetterdienst |
| [ECMWF](https://www.ecmwf.int/en/forecasts/datasets/open-data) | IFS 0.25° | CC BY 4.0 | Based on data and products of ECMWF |
| [UK Met Office](https://registry.opendata.aws/met-office-global-deterministic/) | UM global 10 km | CC BY-**SA** upstream — see note | Contains public sector information licensed by the UK Met Office |
| [NOAA/NCEP](https://www.weather.gov/disclaimer) | GFS | Public domain | Credit as a courtesy |
| [Copernicus C3S](https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land) | ERA5-Land, the ML training target | CC BY (since 2 Jul 2025) | Generated using Copernicus Climate Change Service information |
| [SMHI](https://www.smhi.se/data/om-smhis-data/villkor-for-anvandning) | Live station observations | CC BY 4.0 SE | Observation data from SMHI |

CC BY 4.0 requires three things and the site does all three, in the footer of both pages: credit the
source, link the licence, and **state that changes were made** — which they emphatically are, since
nothing displayed is a raw model value.

**Two things to keep an eye on if you fork or extend this:**

1. **Commercial use.** Adding advertising, a subscription, or bundling this into a paid product moves
   you off the Open-Meteo free tier and you would need a paid plan. As published it is non-commercial:
   no ads, no accounts, nothing sold.
2. **The UK Met Office share-alike question.** Open-Meteo serves its API output under CC BY 4.0, but
   the upstream UKMO global data is published under CC BY-**SA**, which asks that adapted material be
   released under the same terms. Since this app adapts heavily, you either accept that and license
   the displayed forecast CC BY-SA, or drop that model — one line, removing `ukmo_seamless` from
   `MODELS` in `js/config.js`. It is the lowest-weighted of the six over Jämtland, so it costs almost
   nothing. It is currently **left in**, and flagged in the app rather than hidden.

Licences were last verified on the date in `SOURCES.verified` in `js/config.js`. They change; re-check
if that date is old.

## Privacy

- No analytics, cookies, accounts or logs — there is no server to log with.
- Exactly two external hosts are contacted, both weather services: `open-meteo.com` for forecasts
  and `opendata-download-metobs.smhi.se` for station observations. No third-party fonts, scripts,
  analytics or embeds of any kind. Typefaces (Inter and JetBrains Mono, both
  [OFL 1.1](fonts/)) are self-hosted specifically so that loading the page does not send visitors'
  IP addresses to a font CDN — relevant under GDPR for an EU-facing site.
- `localStorage` holds the last forecast per mountain, the unit preference, and the trained weights.
  Nothing leaves the browser.
- Geolocation is never requested. Open-Meteo only ever sees fixed summit coordinates from a public
  list.

## Honest limitations

- ERA5-Land reanalysis is a ~9 km grid estimate, not a summit weather station. The learned
  correction removes systematic model bias; it cannot know about the last few hundred metres of
  local terrain effect.
- Terrain exposure factors are hand-set per peak, not measured.
- Elevations and coordinates are approximate summit positions.
- **This is not an avalanche forecast.** Wind-loading and new-snow figures are meteorological
  indices only. For avalanche danger in the Swedish fjäll use
  [lavinprognoser.se](https://www.lavinprognoser.se); for official warnings, [SMHI](https://www.smhi.se).

## Contact

The email address is not present in any served file — only an AES-GCM ciphertext is, with the key
derived (PBKDF2, 310 000 iterations) from the answer to a question on the
[contact section](methods.html#contact) of the method page. A wrong answer fails the authentication
tag and produces nothing; there is no comparison to bypass. It stops bulk address harvesters, which
is the whole threat model — it would not stop a person who reads the question and answers it.

To change the address or the question, re-seal it and replace `CONTACT.sealed` in `js/config.js`:

```bash
node tools/seal-contact.mjs 'you@example.com' '1420'
```

For bugs, [GitHub issues](https://github.com/AntonAlin/AreWeather/issues) is the better channel.

## Credits

Weather data from [Open-Meteo](https://open-meteo.com) (CC BY 4.0), aggregating MET Norway, DMI,
DWD, ECMWF, UKMO, NOAA and ERA5-Land. No tracking, no analytics, no accounts.
