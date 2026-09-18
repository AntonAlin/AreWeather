"""SMHI:s öppna observationsdata (metobs).

Två saker händer här:

1. Hitta stationer nära en ort som mäter en given parameter.
2. Ladda ner hela det korrigerade arkivet (CSV) plus de senaste månaderna,
   och göra om SMHI:s hemsnickrade CSV-dialekt till en vanlig DataFrame.

SMHI:s CSV är inte en CSV. Den är tre metadatablock, en tom rad, och sedan
en tabell vars kolumner heter olika saker beroende på parameter. Parsern nedan
letar reda på tabellen istället för att gissa var den börjar.
"""

from __future__ import annotations

import io
import logging
import math
import time
from dataclasses import dataclass

import pandas as pd
import requests

from .config import (
    RESORTS,
    SMHI_BASE,
    SMHI_DAILY_PARAMETERS,
    SMHI_HOURLY_PARAMETERS,
    SMHI_KEEP_QUALITY,
    Resort,
)

log = logging.getLogger(__name__)

_SESSION = requests.Session()
_SESSION.headers.update({"User-Agent": "skiclimate/0.1 (github.com/antonalin/AreWeather)"})


def _get(url: str, retries: int = 4, timeout: int = 120) -> requests.Response:
    """GET med backoff. SMHI:s servrar har dåliga dagar precis som alla andra."""
    delay = 2.0
    last: Exception | None = None
    for attempt in range(retries):
        try:
            r = _SESSION.get(url, timeout=timeout)
            if r.status_code == 404:
                r.raise_for_status()
            if r.status_code >= 500:
                raise requests.HTTPError(f"{r.status_code} från SMHI", response=r)
            r.raise_for_status()
            return r
        except requests.HTTPError as e:
            if e.response is not None and e.response.status_code == 404:
                raise
            last = e
        except requests.RequestException as e:
            last = e
        log.warning("SMHI %s misslyckades (försök %d/%d): %s", url, attempt + 1, retries, last)
        time.sleep(delay)
        delay *= 2
    raise RuntimeError(f"Gav upp på {url}: {last}")


# ---------------------------------------------------------------------------
# Stationer
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Station:
    key: int
    name: str
    lat: float
    lon: float
    height: float
    active: bool
    from_year: int
    to_year: int
    distance_km: float


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Storcirkelavstånd. Jorden är rund, oavsett vad kommentarsfältet säger."""
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def list_stations(parameter: int) -> list[dict]:
    """Alla stationer som någonsin mätt parametern, rakt från SMHI."""
    r = _get(f"{SMHI_BASE}/parameter/{parameter}.json")
    return r.json().get("station", [])


def stations_near(resort: Resort, parameter: int, min_years: int = 10) -> list[Station]:
    """Stationer inom radien, sorterade på (föredragen först, sedan avstånd).

    ``min_years`` kastar stationer som bara stod uppe ett par säsonger; de
    tillför inget till en trendanalys men kostar en nedladdning var.
    """
    found: list[Station] = []
    for s in list_stations(parameter):
        d = haversine_km(resort.lat, resort.lon, s["latitude"], s["longitude"])
        if d > resort.station_radius_km:
            continue
        # SMHI ger epoch-millisekunder; ett år är ungefär så här många av dem
        from_year = pd.to_datetime(s["from"], unit="ms").year
        to_year = pd.to_datetime(s["to"], unit="ms").year
        if to_year - from_year < min_years:
            continue
        found.append(
            Station(
                key=int(s["key"]),
                name=s["name"],
                lat=s["latitude"],
                lon=s["longitude"],
                height=float(s.get("height", float("nan"))),
                active=bool(s.get("active", False)),
                from_year=from_year,
                to_year=to_year,
                distance_km=round(d, 1),
            )
        )

    prefs = tuple(p.lower() for p in resort.preferred_stations)

    def rank(st: Station) -> tuple[int, float]:
        hit = any(p in st.name.lower() for p in prefs)
        return (0 if hit else 1, st.distance_km)

    return sorted(found, key=rank)


# ---------------------------------------------------------------------------
# CSV-parsern
# ---------------------------------------------------------------------------

_DATE_COLUMNS = ("Representativt dygn", "Datum")
_META_COLUMNS = {"Kvalitet", "Tidsutsnitt:", "", "Tid (UTC)", "Från Datum Tid (UTC)", "Till Datum Tid (UTC)"}


def parse_smhi_csv(text: str, parameter: int) -> pd.DataFrame:
    """Gör en DataFrame ``[date, value, quality]`` av SMHI:s CSV-export.

    Fungerar för både dygns- och timparametrar. För timparametrar blir
    ``date`` en full tidsstämpel, för dygn en ren dag.
    """
    lines = text.splitlines()
    header_idx = None
    for i, line in enumerate(lines):
        if line.startswith("Datum;") or line.startswith("Från Datum"):
            header_idx = i
            break
    if header_idx is None:
        raise ValueError("Hittade ingen datatabell i SMHI-svaret – formatet har ändrats eller filen är tom")

    table = "\n".join(lines[header_idx:])
    df = pd.read_csv(io.StringIO(table), sep=";", dtype=str, keep_default_na=False)
    # Sista kolumnerna är SMHI:s kvalitetsförklaring, en per rad, helt värdelös här
    df.columns = [c.strip() for c in df.columns]

    date_col = next((c for c in _DATE_COLUMNS if c in df.columns), None)
    if date_col is None:
        raise ValueError(f"Ingen datumkolumn bland {list(df.columns)}")

    value_col = next(
        (c for c in df.columns if c not in _META_COLUMNS and c not in _DATE_COLUMNS and not c.startswith("Unnamed")),
        None,
    )
    if value_col is None:
        raise ValueError(f"Ingen värdekolumn bland {list(df.columns)}")

    out = pd.DataFrame()
    if date_col == "Datum" and "Tid (UTC)" in df.columns:
        # Timdata: datum och tid i två kolumner, för att livet ska kännas längre
        out["date"] = pd.to_datetime(df["Datum"] + " " + df["Tid (UTC)"], errors="coerce", utc=True)
        if parameter in SMHI_DAILY_PARAMETERS:
            # dygnsparametrar med klockslag (snödjup kl 06, nederbörd kl 06): kasta klockan
            out["date"] = out["date"].dt.tz_localize(None).dt.normalize()
    else:
        out["date"] = pd.to_datetime(df[date_col], errors="coerce")

    out["value"] = pd.to_numeric(df[value_col].str.replace(",", "."), errors="coerce")
    out["quality"] = df["Kvalitet"].str.strip() if "Kvalitet" in df.columns else "G"
    out = out.dropna(subset=["date", "value"])
    out = out[out["quality"].isin(SMHI_KEEP_QUALITY)]
    return out.reset_index(drop=True)


def _fetch_period(parameter: int, station_key: int, period: str) -> pd.DataFrame | None:
    url = f"{SMHI_BASE}/parameter/{parameter}/station/{station_key}/period/{period}/data.csv"
    try:
        r = _get(url)
    except requests.HTTPError as e:
        if e.response is not None and e.response.status_code == 404:
            # Stationen har inte den perioden. Helt normalt, inget att gråta över.
            return None
        raise
    # SMHI säger utf-8. Ibland ljuger de. Å, ä och ö får stå sitt kast.
    try:
        text = r.content.decode("utf-8")
    except UnicodeDecodeError:
        text = r.content.decode("latin-1")
    return parse_smhi_csv(text, parameter)


def fetch_station_series(parameter: int, station_key: int) -> pd.DataFrame:
    """Korrigerat arkiv + senaste månaderna, ihopslagna utan dubbletter.

    Arkivet släpar ett par månader; ``latest-months`` täcker glappet. Där de
    överlappar vinner arkivet, eftersom det är granskat.
    """
    parts = []
    archive = _fetch_period(parameter, station_key, "corrected-archive")
    if archive is not None and not archive.empty:
        parts.append(archive)
    recent = _fetch_period(parameter, station_key, "latest-months")
    if recent is not None and not recent.empty:
        if parts:
            recent = recent[recent["date"] > parts[0]["date"].max()]
        parts.append(recent)
    if not parts:
        return pd.DataFrame(columns=["date", "value", "quality"])
    df = pd.concat(parts, ignore_index=True)
    return df.drop_duplicates("date", keep="first").sort_values("date").reset_index(drop=True)


# ---------------------------------------------------------------------------
# Hela nedladdningen för en ort
# ---------------------------------------------------------------------------


def download_resort(
    resort: Resort,
    parameters: dict[int, tuple[str, str, float]] | None = None,
    max_stations_per_parameter: int = 6,
    pause_s: float = 0.5,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Returnerar ``(observations, stations)`` i långt format.

    observations: resort, parameter, variable, station_key, date, value, quality
    stations:     resort, parameter, station_key, name, lat, lon, height, distance_km, ...
    """
    parameters = parameters or SMHI_DAILY_PARAMETERS
    obs_frames: list[pd.DataFrame] = []
    station_rows: list[dict] = []

    for pid, (variable, unit, scale) in parameters.items():
        try:
            candidates = stations_near(resort, pid)
        except Exception as e:  # noqa: BLE001 – vi vill logga och gå vidare, inte dö
            log.error("Kunde inte lista stationer för %s param %d: %s", resort.name, pid, e)
            continue
        log.info("%s: %d stationer för %s (param %d)", resort.name, len(candidates), variable, pid)

        for st in candidates[:max_stations_per_parameter]:
            try:
                series = fetch_station_series(pid, st.key)
            except Exception as e:  # noqa: BLE001
                log.error("%s/%s param %d: %s", resort.name, st.name, pid, e)
                continue
            time.sleep(pause_s)  # vi är gäster hos en myndighet, uppför oss
            if series.empty:
                continue
            series = series.assign(
                resort=resort.key,
                parameter=pid,
                variable=variable,
                unit=unit,
                station_key=st.key,
                value=series["value"] * scale,
            )
            obs_frames.append(series)
            station_rows.append(
                {
                    "resort": resort.key,
                    "parameter": pid,
                    "variable": variable,
                    "station_key": st.key,
                    "name": st.name,
                    "lat": st.lat,
                    "lon": st.lon,
                    "height": st.height,
                    "distance_km": st.distance_km,
                    "active": st.active,
                    "from_year": st.from_year,
                    "to_year": st.to_year,
                    "n_obs": len(series),
                    "first_obs": series["date"].min(),
                    "last_obs": series["date"].max(),
                }
            )
            log.info(
                "  %s (%d): %d värden %s..%s, %.0f m ö.h., %.0f km bort",
                st.name, st.key, len(series), series["date"].min().date(), series["date"].max().date(),
                st.height, st.distance_km,
            )

    obs = pd.concat(obs_frames, ignore_index=True) if obs_frames else pd.DataFrame(
        columns=["date", "value", "quality", "resort", "parameter", "variable", "unit", "station_key"]
    )
    return obs, pd.DataFrame(station_rows)


def download_all(resort_keys: list[str] | None = None, hourly: bool = False) -> tuple[pd.DataFrame, pd.DataFrame]:
    keys = resort_keys or list(RESORTS)
    params = dict(SMHI_DAILY_PARAMETERS)
    if hourly:
        params.update(SMHI_HOURLY_PARAMETERS)
    obs_all, st_all = [], []
    for k in keys:
        o, s = download_resort(RESORTS[k], params)
        obs_all.append(o)
        st_all.append(s)
    return pd.concat(obs_all, ignore_index=True), pd.concat(st_all, ignore_index=True)
