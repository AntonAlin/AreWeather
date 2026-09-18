"""Påhittad men trovärdig data, för att testa pipelinen utan nätverk.

Ingen av siffrorna här är en mätning. Det är ett årstidssinus, en linjär
uppvärmning, lite AR(1)-brus och en graddagsmodell. Om resultatet ser ut
som riktiga data är det för att riktiga data också mest är sinus och brus.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from .config import CMIP6_MODELS, RESORTS

#: ungefärlig årsmedeltemperatur i byn och amplitud, per ort
_CLIMATE = {
    "salen": {"mean": 3.0, "amp": 11.0, "precip_mm_day": 2.0},
    "are": {"mean": 2.5, "amp": 11.5, "precip_mm_day": 2.3},
    "tarnaby": {"mean": 0.8, "amp": 12.5, "precip_mm_day": 2.1},
}


def _daily_temp(dates: pd.DatetimeIndex, mean: float, amp: float, trend_per_year: float, rng: np.random.Generator, start_year: int) -> np.ndarray:
    doy = dates.dayofyear.to_numpy()
    years = (dates.year + doy / 365.25).to_numpy() - start_year
    seasonal = mean - amp * np.cos(2 * np.pi * (doy - 15) / 365.25)  # kallast runt 15 jan
    # AR(1) med phi 0.8: vädret minns gårdagen, inte förra veckan
    noise = np.empty(len(dates))
    noise[0] = rng.normal(0, 3)
    eps = rng.normal(0, 2.0, len(dates))
    for i in range(1, len(dates)):
        noise[i] = 0.8 * noise[i - 1] + eps[i]
    return seasonal + trend_per_year * years + noise


def synthetic_era5(resort_key: str, start: str = "1961-01-01", end: str = "2025-06-30", seed: int = 0, trend_per_year: float = 0.04) -> pd.DataFrame:
    rng = np.random.default_rng(seed + hash(resort_key) % 1000)
    r = RESORTS[resort_key]
    c = _CLIMATE[resort_key]
    dates = pd.date_range(start, end, freq="D")
    tm = _daily_temp(dates, c["mean"], c["amp"], trend_per_year, rng, pd.Timestamp(start).year)
    precip = rng.gamma(0.7, c["precip_mm_day"] / 0.7, len(dates)) * (rng.random(len(dates)) < 0.55)
    df = pd.DataFrame(
        {
            "date": dates,
            "t_mean": tm,
            "t_min": tm - rng.uniform(2, 5, len(dates)),
            "t_max": tm + rng.uniform(2, 5, len(dates)),
            "precip": precip,
            "rain": np.where(tm > 1, precip, 0.0),
            "snowfall_cm": np.where(tm <= 1, precip * 1.0, 0.0),
            "wind_max": rng.gamma(4, 2, len(dates)),
            "radiation": np.clip(10 + 12 * np.sin(2 * np.pi * (dates.dayofyear - 80) / 365.25), 0, None),
            "resort": resort_key,
            "source": "synthetic",
            "grid_elevation": float(r.base_elevation + 150),
        }
    )
    return df


def synthetic_smhi(resort_key: str, era5: pd.DataFrame, seed: int = 1) -> tuple[pd.DataFrame, pd.DataFrame]:
    """En 'station' i byn med snödjup från graddagsmodellen + brus, temperatur = ERA5 + brus.

    Stationen saknar 8 % av dagarna slumpmässigt och ett helt år (1975), så
    att lucklogiken faktiskt får jobba.
    """
    from .features import degree_day_snowpack  # sen import, annars cirkel

    rng = np.random.default_rng(seed)
    r = RESORTS[resort_key]
    e = era5.set_index("date")
    depth = degree_day_snowpack(e["t_mean"].to_numpy(), e["precip"].to_numpy())
    depth = np.clip(depth * rng.normal(1.0, 0.15, len(depth)) + rng.normal(0, 1.5, len(depth)), 0, None)
    variables = {
        2: ("t_mean", e["t_mean"] + rng.normal(0, 0.5, len(e))),
        19: ("t_min", e["t_min"] + rng.normal(0, 0.5, len(e))),
        20: ("t_max", e["t_max"] + rng.normal(0, 0.5, len(e))),
        5: ("precip", e["precip"] * rng.normal(1.0, 0.1, len(e))),
        8: ("snow_depth", pd.Series(depth, index=e.index)),
    }
    keep = rng.random(len(e)) > 0.08
    keep &= e.index.year != 1975
    obs, st = [], []
    station_key = 100000 + abs(hash(resort_key)) % 9000
    for pid, (var, series) in variables.items():
        s = series[keep]
        obs.append(
            pd.DataFrame(
                {"date": s.index, "value": s.to_numpy(), "quality": "G", "resort": resort_key,
                 "parameter": pid, "variable": var, "unit": "?", "station_key": station_key}
            )
        )
        st.append(
            {"resort": resort_key, "parameter": pid, "variable": var, "station_key": station_key,
             "name": f"{r.name} (syntetisk)", "lat": r.lat, "lon": r.lon, "height": float(r.base_elevation),
             "distance_km": 0.5, "active": True, "from_year": s.index.min().year, "to_year": s.index.max().year,
             "n_obs": len(s), "first_obs": s.index.min(), "last_obs": s.index.max()}
        )
    return pd.concat(obs, ignore_index=True), pd.DataFrame(st)


def synthetic_cmip6(resort_key: str, seed: int = 2) -> pd.DataFrame:
    """Sju 'modeller' 1950-2050 med olika klimatkänslighet. SSP5-8.5-ish: 0.05-0.08 °C/år."""
    r = RESORTS[resort_key]
    c = _CLIMATE[resort_key]
    frames = []
    for i, m in enumerate(CMIP6_MODELS):
        rng = np.random.default_rng(seed * 100 + i + hash(resort_key) % 100)
        dates = pd.date_range("1950-01-01", "2050-12-31", freq="D")
        trend = 0.05 + 0.005 * i
        tm = _daily_temp(dates, c["mean"] - 0.3, c["amp"], trend, rng, 1950)
        precip = rng.gamma(0.7, c["precip_mm_day"] / 0.7, len(dates)) * (rng.random(len(dates)) < 0.55)
        frames.append(
            pd.DataFrame(
                {"date": dates, "t_mean": tm, "t_min": tm - 3.5, "t_max": tm + 3.5, "precip": precip,
                 "snowfall_cm": np.where(tm <= 1, precip, 0.0), "model": m, "resort": resort_key,
                 "grid_elevation": float(r.base_elevation + 200)}
            )
        )
    return pd.concat(frames, ignore_index=True)


def synthetic_gistemp(start: int = 1880, end: int = 2025, seed: int = 3) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    years = np.arange(start, end + 1)
    # ungefär den riktiga kurvan: platt till 1970, sedan ~0.02 °C/år
    anom = np.where(years < 1970, -0.1, -0.1 + 0.02 * (years - 1970)) + rng.normal(0, 0.08, len(years))
    return pd.DataFrame({"year": years, "global_anom_annual": anom, "global_anom_djf": anom + rng.normal(0, 0.1, len(years))})
