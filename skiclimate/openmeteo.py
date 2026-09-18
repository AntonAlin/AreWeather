"""Open-Meteo: ERA5-reanalys bakåt till 1940 och CMIP6-projektioner till 2050.

ERA5 är inte en mätning, det är en väderprognos som körts baklänges med alla
observationer inmatade. Den täcker varje dag sedan 1940 utan luckor, vilket
ingen svensk fjällstation gör. Priset är en gridruta på ~10-25 km som inte
skiljer på dalbotten och topp. Därför sparar vi rutans egen höjd och låter
feature-steget lapse-korrigera till den höjd vi faktiskt bryr oss om.

CMIP6-datat är sju HighResMIP-modeller, nedskalade och biaskorrigerade av
Open-Meteo. Bara SSP5-8.5 finns. Det är det varmaste scenariot – behandla
resultatet som en övre gräns, inte en prognos.
"""

from __future__ import annotations

import logging
import time
from datetime import date

import pandas as pd
import requests

from .config import (
    CMIP6_DAILY_VARIABLES,
    CMIP6_END,
    CMIP6_MODELS,
    CMIP6_START,
    ERA5_DAILY_VARIABLES,
    ERA5_HOURLY_SNOW_VARIABLE,
    ERA5_START,
    GISTEMP_URL,
    OPENMETEO_ARCHIVE,
    OPENMETEO_CLIMATE,
    Resort,
)

log = logging.getLogger(__name__)

_SESSION = requests.Session()
_SESSION.headers.update({"User-Agent": "skiclimate/0.1 (github.com/antonalin/AreWeather)"})


def _get_json(url: str, params: dict, retries: int = 5, timeout: int = 180) -> dict:
    """Open-Meteo svarar 429 när man är för ivrig. Då väntar vi. Länge."""
    delay = 3.0
    last: Exception | None = None
    for attempt in range(retries):
        try:
            r = _SESSION.get(url, params=params, timeout=timeout)
            if r.status_code == 429:
                raise requests.HTTPError("429 – för många anrop", response=r)
            r.raise_for_status()
            payload = r.json()
            if payload.get("error"):
                raise RuntimeError(payload.get("reason", "okänt fel från Open-Meteo"))
            return payload
        except (requests.RequestException, RuntimeError, ValueError) as e:
            last = e
            log.warning("Open-Meteo %s (försök %d/%d): %s", url, attempt + 1, retries, e)
            time.sleep(delay)
            delay *= 2
    raise RuntimeError(f"Gav upp på {url} {params}: {last}")


def _daily_frame(payload: dict) -> pd.DataFrame:
    daily = payload["daily"]
    df = pd.DataFrame(daily)
    df["date"] = pd.to_datetime(df.pop("time"))
    return df


# ---------------------------------------------------------------------------
# ERA5
# ---------------------------------------------------------------------------


def _year_chunks(start: str, end: str, years_per_chunk: int) -> list[tuple[str, str]]:
    s, e = pd.Timestamp(start), pd.Timestamp(end)
    chunks = []
    cur = s
    while cur <= e:
        nxt = min(pd.Timestamp(year=cur.year + years_per_chunk, month=1, day=1) - pd.Timedelta(days=1), e)
        chunks.append((cur.strftime("%Y-%m-%d"), nxt.strftime("%Y-%m-%d")))
        cur = nxt + pd.Timedelta(days=1)
    return chunks


def fetch_era5_daily(
    resort: Resort,
    start: str = ERA5_START,
    end: str | None = None,
    years_per_chunk: int = 15,
    pause_s: float = 1.0,
) -> tuple[pd.DataFrame, float]:
    """Dygnsvärden från ERA5 för ortens koordinat. Returnerar ``(df, grid_elevation)``.

    Hela 1940-idag i ett anrop går oftast bra, men Open-Meteo har ett
    timeout-humör, så vi delar upp i bitar och slipper börja om från noll.
    """
    end = end or (date.today() - pd.Timedelta(days=6)).strftime("%Y-%m-%d")  # ERA5 släpar ~5 dagar
    frames = []
    elevation = float("nan")
    for s, e in _year_chunks(start, end, years_per_chunk):
        payload = _get_json(
            OPENMETEO_ARCHIVE,
            {
                "latitude": resort.lat,
                "longitude": resort.lon,
                "start_date": s,
                "end_date": e,
                "daily": ",".join(ERA5_DAILY_VARIABLES),
                "timezone": "Europe/Stockholm",
                "models": "era5_land",  # 9 km istället för 25 – terrängen märks
            },
        )
        elevation = float(payload.get("elevation", elevation))
        frames.append(_daily_frame(payload))
        log.info("ERA5 %s %s..%s klart", resort.name, s, e)
        time.sleep(pause_s)
    df = pd.concat(frames, ignore_index=True).drop_duplicates("date").sort_values("date")
    df = df.rename(
        columns={
            "temperature_2m_mean": "t_mean",
            "temperature_2m_max": "t_max",
            "temperature_2m_min": "t_min",
            "precipitation_sum": "precip",
            "rain_sum": "rain",
            "snowfall_sum": "snowfall_cm",  # Open-Meteo ger cm snö, inte mm vatten
            "wind_speed_10m_max": "wind_max",
            "shortwave_radiation_sum": "radiation",
        }
    )
    df["resort"] = resort.key
    df["source"] = "era5_land"
    df["grid_elevation"] = elevation
    return df.reset_index(drop=True), elevation


def fetch_era5_snow_depth(
    resort: Resort,
    start: str = ERA5_START,
    end: str | None = None,
    pause_s: float = 1.5,
) -> pd.DataFrame:
    """Snödjup från ERA5-Land, timme för timme, år för år, ner till dygnsmedel/max.

    Ett år per anrop är 8 760 rader; 85 år är 85 anrop. Det tar en stund.
    Sätt på kaffet. Modellsnö är dessutom vattenekvivalent omräknad med en
    fast densitet, så absolutnivån är tveksam – trenden är det intressanta.
    """
    end = end or (date.today() - pd.Timedelta(days=6)).strftime("%Y-%m-%d")
    frames = []
    for s, e in _year_chunks(start, end, 1):
        payload = _get_json(
            OPENMETEO_ARCHIVE,
            {
                "latitude": resort.lat,
                "longitude": resort.lon,
                "start_date": s,
                "end_date": e,
                "hourly": ERA5_HOURLY_SNOW_VARIABLE,
                "timezone": "Europe/Stockholm",
                "models": "era5_land",
            },
        )
        h = pd.DataFrame(payload["hourly"])
        h["time"] = pd.to_datetime(h["time"])
        h["date"] = h["time"].dt.normalize()
        d = h.groupby("date")[ERA5_HOURLY_SNOW_VARIABLE].agg(["mean", "max"]).reset_index()
        d.columns = ["date", "snow_depth_era5_mean_cm", "snow_depth_era5_max_cm"]
        d[["snow_depth_era5_mean_cm", "snow_depth_era5_max_cm"]] *= 100.0  # meter -> cm
        frames.append(d)
        log.info("ERA5 snödjup %s %s klart", resort.name, s[:4])
        time.sleep(pause_s)
    df = pd.concat(frames, ignore_index=True)
    df["resort"] = resort.key
    return df


# ---------------------------------------------------------------------------
# CMIP6
# ---------------------------------------------------------------------------


def fetch_cmip6(resort: Resort, models: tuple[str, ...] = CMIP6_MODELS, pause_s: float = 2.0) -> tuple[pd.DataFrame, float]:
    """En modell per anrop så kolumnnamnen inte får modellnamnet fastklistrat."""
    frames = []
    elevation = float("nan")
    for m in models:
        payload = _get_json(
            OPENMETEO_CLIMATE,
            {
                "latitude": resort.lat,
                "longitude": resort.lon,
                "start_date": CMIP6_START,
                "end_date": CMIP6_END,
                "models": m,
                "daily": ",".join(CMIP6_DAILY_VARIABLES),
                "timezone": "Europe/Stockholm",
            },
        )
        elevation = float(payload.get("elevation", elevation))
        df = _daily_frame(payload)
        # När man bara begär en modell ska kolumnerna vara rena, men Open-Meteo
        # har bytt åsikt om det förr. Skala av suffixet om det dyker upp.
        df.columns = [c.replace(f"_{m}", "") for c in df.columns]
        df = df.rename(
            columns={
                "temperature_2m_mean": "t_mean",
                "temperature_2m_max": "t_max",
                "temperature_2m_min": "t_min",
                "precipitation_sum": "precip",
                "snowfall_sum": "snowfall_cm",
            }
        )
        df["model"] = m
        frames.append(df)
        log.info("CMIP6 %s %s klart (%d dagar)", resort.name, m, len(df))
        time.sleep(pause_s)
    out = pd.concat(frames, ignore_index=True)
    out["resort"] = resort.key
    out["grid_elevation"] = elevation
    return out, elevation


# ---------------------------------------------------------------------------
# Global temperatur (NASA GISTEMP)
# ---------------------------------------------------------------------------


def fetch_gistemp() -> pd.DataFrame:
    """Global anomali relativt 1951-1980, per år: helår (J-D) och vinter (DJF).

    DJF för år Y hos GISS betyder dec(Y-1)+jan(Y)+feb(Y), vilket råkar vara
    exakt samma vinteretikett som vi använder. Tack, NASA.
    """
    r = _SESSION.get(GISTEMP_URL, timeout=60)
    r.raise_for_status()
    df = pd.read_csv(pd.io.common.StringIO(r.text), skiprows=1, na_values=["***", "****"])
    df = df.rename(columns={"Year": "year", "J-D": "global_anom_annual", "DJF": "global_anom_djf"})
    return df[["year", "global_anom_annual", "global_anom_djf"]].astype(float)
