"""Från dygnsvärden till en rad per ort och vinter.

Steg 1: bygg en sammanhängande dygnsserie per ort. SMHI-stationerna är
        sanningen där de finns, ERA5 fyller luckorna (höjdkorrigerat).
Steg 2: räkna säsongsmått per vinter (juli-juni).

Alla trösklar ligger i ``config.SEASON``. Ändra dem där, inte här.
"""

from __future__ import annotations

import logging

import numpy as np
import pandas as pd

from .config import RESORTS, SEASON, SeasonRules

log = logging.getLogger(__name__)

DAILY_COLUMNS = ("t_mean", "t_min", "t_max", "precip", "snow_depth")


# ---------------------------------------------------------------------------
# Steg 1: en dygnsserie per ort
# ---------------------------------------------------------------------------


def _pick_station_series(obs: pd.DataFrame, stations: pd.DataFrame, resort: str, variable: str) -> pd.Series | None:
    """Slår ihop flera stationers värden till en serie: bästa stationen först,
    övriga fyller bara luckor.

    "Bäst" = längst serie, med avstånd som skiljedomare. En station som stod
    uppe 1961-2023 slår en som stått uppe sedan 2019, även om den nya är
    närmare. Trender kräver längd, inte närhet.
    """
    sub = obs[(obs["resort"] == resort) & (obs["variable"] == variable)]
    if sub.empty:
        return None
    st = stations[(stations["resort"] == resort) & (stations["variable"] == variable)].copy()
    st = st.sort_values(["n_obs", "distance_km"], ascending=[False, True])
    combined: pd.Series | None = None
    for key in st["station_key"]:
        s = sub[sub["station_key"] == key].set_index("date")["value"].sort_index()
        s = s[~s.index.duplicated()]
        combined = s if combined is None else combined.combine_first(s)
    return combined


def lapse_adjust(t: pd.Series, from_elevation: float, to_elevation: float, rules: SeasonRules = SEASON) -> pd.Series:
    """Flytta en temperaturserie i höjdled med fast lapse rate.

    Inversioner finns, men i ett dygnsmedel över 60 år jämnar de ut sig.
    Vill du ha inversioner får du hämta timdata och en radiosond.
    """
    if not np.isfinite(from_elevation) or not np.isfinite(to_elevation):
        return t
    return t - rules.lapse_rate * (to_elevation - from_elevation) / 100.0


def build_daily(
    resort_key: str,
    smhi_obs: pd.DataFrame | None,
    smhi_stations: pd.DataFrame | None,
    era5: pd.DataFrame | None,
    era5_snow: pd.DataFrame | None = None,
    target_elevation: int | None = None,
    rules: SeasonRules = SEASON,
) -> pd.DataFrame:
    """En rad per dag, kolumner enligt ``DAILY_COLUMNS`` plus ``source_*``-flaggor.

    ``target_elevation`` är höjden vi vill beskriva (byn som standard).
    Stationer lapse-justeras till den från sin egen höjd, ERA5 från sin gridhöjd.
    """
    resort = RESORTS[resort_key]
    target = target_elevation if target_elevation is not None else resort.base_elevation

    frames: dict[str, pd.Series] = {}
    sources: dict[str, pd.Series] = {}

    # --- ERA5 som botten
    if era5 is not None and not era5.empty:
        e = era5[era5["resort"] == resort_key].set_index("date").sort_index()
        e = e[~e.index.duplicated()]
        grid_z = float(e["grid_elevation"].iloc[0]) if "grid_elevation" in e else float("nan")
        for col in ("t_mean", "t_min", "t_max"):
            if col in e:
                frames[col] = lapse_adjust(e[col], grid_z, target, rules)
                sources[col] = pd.Series("era5", index=e.index)
        if "precip" in e:
            frames["precip"] = e["precip"]
            sources["precip"] = pd.Series("era5", index=e.index)
    if era5_snow is not None and not era5_snow.empty:
        s = era5_snow[era5_snow["resort"] == resort_key].set_index("date").sort_index()
        frames["snow_depth"] = s["snow_depth_era5_max_cm"]
        sources["snow_depth"] = pd.Series("era5", index=s.index)

    # --- SMHI-stationer ovanpå: där de finns vinner de
    if smhi_obs is not None and not smhi_obs.empty and smhi_stations is not None:
        for var in DAILY_COLUMNS:
            s = _pick_station_series(smhi_obs, smhi_stations, resort_key, var)
            if s is None or s.empty:
                continue
            if var.startswith("t_"):
                st = smhi_stations[(smhi_stations["resort"] == resort_key) & (smhi_stations["variable"] == var)]
                st = st.sort_values(["n_obs", "distance_km"], ascending=[False, True])
                z = float(st["height"].iloc[0]) if not st.empty else float("nan")
                # OBS: alla stationer får den bästa stationens höjd. Fel, men litet
                # fel, eftersom sekundärstationerna bara fyller luckor.
                s = lapse_adjust(s, z, target, rules)
            src = pd.Series("smhi", index=s.index)
            if var in frames:
                frames[var] = s.combine_first(frames[var])
                sources[var] = src.combine_first(sources[var])
            else:
                frames[var] = s
                sources[var] = src

    if not frames:
        raise ValueError(f"Ingen data alls för {resort.name}")

    daily = pd.DataFrame(frames)
    full_index = pd.date_range(daily.index.min(), daily.index.max(), freq="D")
    daily = daily.reindex(full_index)
    daily.index.name = "date"
    for var, src in sources.items():
        daily[f"source_{var}"] = src.reindex(full_index)

    # t_min/t_max saknas ibland hos stationerna (bara dygnsmedel mätt). Fyll
    # från t_mean med typisk dygnsamplitud i fjällen på vintern, ~3 °C åt varje håll.
    # Grov men bättre än NaN som dödar hela vintern.
    if "t_mean" in daily:
        if "t_min" not in daily:
            daily["t_min"] = daily["t_mean"] - 3.0
        else:
            daily["t_min"] = daily["t_min"].fillna(daily["t_mean"] - 3.0)
        if "t_max" not in daily:
            daily["t_max"] = daily["t_mean"] + 3.0
        else:
            daily["t_max"] = daily["t_max"].fillna(daily["t_mean"] + 3.0)

    # Korta luckor (≤3 dagar) i temperatur interpoleras. Längre får vara NaN.
    for col in ("t_mean", "t_min", "t_max"):
        if col in daily:
            daily[col] = daily[col].interpolate(limit=3, limit_area="inside")

    daily["resort"] = resort_key
    daily["target_elevation"] = target
    return daily.reset_index()


# ---------------------------------------------------------------------------
# Snömodell där snödjup saknas
# ---------------------------------------------------------------------------


def degree_day_snowpack(t_mean: np.ndarray, precip: np.ndarray, rules: SeasonRules = SEASON) -> np.ndarray:
    """Graddagsmodell. Snöar när det är kallt, smälter proportionellt mot plusgrader.

    Samma modell som webbsidans warming-vy, så siffrorna går att jämföra.
    Den vet inget om vind, sol eller att solen står 3° över horisonten i
    januari. Det är en bokföringsmodell, inte fysik. Räcker för trender.
    """
    n = len(t_mean)
    swe = np.zeros(n)  # mm vattenekvivalent i snötäcket
    cur = 0.0
    for i in range(n):
        t = t_mean[i]
        p = precip[i]
        if np.isnan(t):
            swe[i] = np.nan
            continue
        if not np.isnan(p) and t < rules.snow_temp_threshold:
            cur += p
        if t > 0:
            cur = max(0.0, cur - rules.melt_factor * t)
        swe[i] = cur
    # mm vatten -> cm snö: mm / (densitet/1000) / 10
    return swe / (rules.pack_density / 1000.0) / 10.0


# ---------------------------------------------------------------------------
# Steg 2: vintermått
# ---------------------------------------------------------------------------


def winter_year(dates: pd.Series, rules: SeasonRules = SEASON) -> pd.Series:
    """Vintern 2019/20 heter 2020: året januari ligger i."""
    d = pd.DatetimeIndex(dates)
    return pd.Series(np.where(d.month >= rules.year_start_month, d.year + 1, d.year), index=dates.index)


def _longest_run(mask: np.ndarray) -> int:
    best = cur = 0
    for v in mask:
        cur = cur + 1 if v else 0
        best = max(best, cur)
    return best


def _first_run_start(mask: np.ndarray, run: int) -> int | None:
    """Index där första sviten av ``run`` sanna värden börjar, annars None."""
    cur = 0
    for i, v in enumerate(mask):
        cur = cur + 1 if v else 0
        if cur >= run:
            return i - run + 1
    return None


def _last_run_end(mask: np.ndarray, run: int) -> int | None:
    rev = _first_run_start(mask[::-1], run)
    return None if rev is None else len(mask) - 1 - rev


def _in_months(month: np.ndarray, span: tuple[int, int]) -> np.ndarray:
    a, b = span
    return (month >= a) | (month <= b) if a > b else (month >= a) & (month <= b)


def winter_metrics(w: pd.DataFrame, rules: SeasonRules = SEASON) -> dict:
    """Alla mått för en enskild vinter (en DataFrame med dygnsrader jul-jun)."""
    w = w.sort_values("date")
    month = w["date"].dt.month.to_numpy()
    tm = w["t_mean"].to_numpy(dtype=float)
    tmin = w["t_min"].to_numpy(dtype=float)
    tmax = w["t_max"].to_numpy(dtype=float)
    p = w["precip"].to_numpy(dtype=float) if "precip" in w else np.full(len(w), np.nan)
    core = _in_months(month, rules.core_winter)
    making = _in_months(month, rules.making_season)
    n_days = len(w)
    valid_t = np.isfinite(tm)

    out: dict = {
        "n_days": n_days,
        "t_coverage": float(valid_t.mean()) if n_days else 0.0,
        "p_coverage": float(np.isfinite(p).mean()) if n_days else 0.0,
    }

    # --- temperatur
    out["t_mean_winter"] = float(np.nanmean(tm[core])) if core.any() else np.nan       # dec-mar
    out["t_mean_nov_apr"] = float(np.nanmean(tm[_in_months(month, (11, 4))]))
    out["frost_days"] = int(np.nansum(tmin < 0))
    out["ice_days"] = int(np.nansum(tmax < 0))
    out["thaw_days_core"] = int(np.nansum((tmax > rules.thaw_above) & core))
    out["snowmaking_days"] = int(np.nansum((tmin <= rules.snowmaking_tmin) & making))
    out["cold_sum"] = float(-np.nansum(np.minimum(tm, 0.0)))  # "frysgraddagar", hur mycket kyla vintern samlade
    out["warm_sum_core"] = float(np.nansum(np.maximum(tm[core], 0.0)))

    # --- termisk vinter: första/sista svit på run_length dygn under 0
    below = np.where(valid_t, tm < 0, False)
    start = _first_run_start(below, rules.run_length)
    end = _last_run_end(below, rules.run_length)
    out["thermal_winter_start_doy"] = int(start) if start is not None else np.nan  # dagar sedan 1 juli
    out["thermal_winter_end_doy"] = int(end) if end is not None else np.nan
    out["thermal_winter_length"] = (
        int(end - start + 1) if start is not None and end is not None else 0
    )

    # --- nederbörd
    out["precip_total"] = float(np.nansum(p)) if np.isfinite(p).any() else np.nan
    snow_mask = np.isfinite(p) & (tm < rules.snow_temp_threshold)
    out["snowfall_mm_we"] = float(np.nansum(p[snow_mask])) if np.isfinite(p).any() else np.nan
    out["snow_fraction"] = (
        out["snowfall_mm_we"] / out["precip_total"] if out.get("precip_total") and out["precip_total"] > 0 else np.nan
    )
    out["rain_on_snow_days"] = np.nan  # fylls i när vi vet snödjup

    # --- snödjup: observerat om det finns, annars graddagsmodell
    obs_depth = w["snow_depth"].to_numpy(dtype=float) if "snow_depth" in w else np.full(n_days, np.nan)
    depth_cov = float(np.isfinite(obs_depth).mean()) if n_days else 0.0
    if depth_cov >= 0.8:
        depth = pd.Series(obs_depth).interpolate(limit=5, limit_area="inside").to_numpy()
        out["snow_source"] = "observed"
    else:
        depth = degree_day_snowpack(tm, p, rules)
        out["snow_source"] = "modelled"
    out["snow_depth_coverage"] = depth_cov

    reliable = np.where(np.isfinite(depth), depth >= rules.reliable_depth_cm, False)
    cover = np.where(np.isfinite(depth), depth >= rules.cover_depth_cm, False)
    out["season_days_30cm"] = int(reliable.sum())
    out["season_core_30cm"] = int(_longest_run(reliable))
    out["cover_days"] = int(cover.sum())
    out["snow_reliable"] = bool(out["season_days_30cm"] >= rules.reliable_days)
    first = np.argmax(reliable) if reliable.any() else None
    last = (n_days - 1 - np.argmax(reliable[::-1])) if reliable.any() else None
    out["season_start_doy"] = int(first) if first is not None else np.nan
    out["season_end_doy"] = int(last) if last is not None else np.nan
    out["season_span"] = int(last - first + 1) if first is not None else 0
    out["max_depth_cm"] = float(np.nanmax(depth)) if np.isfinite(depth).any() else np.nan
    out["depth_feb1_cm"] = float(depth[(month == 2)][0]) if (month == 2).any() and np.isfinite(depth[(month == 2)]).any() else np.nan
    out["rain_on_snow_days"] = int(np.nansum((p >= 1.0) & (tm > rules.snow_temp_threshold) & cover))
    return out


def winter_table(daily: pd.DataFrame, rules: SeasonRules = SEASON, min_coverage: float = 0.9) -> pd.DataFrame:
    """En rad per (resort, vinter). Vintrar med för dålig täckning kastas."""
    df = daily.copy()
    df["winter"] = winter_year(df["date"], rules)
    rows = []
    for (resort, wy), w in df.groupby(["resort", "winter"]):
        if len(w) < 300:  # halvvintrar i början/slutet av serien är inte vintrar
            continue
        m = winter_metrics(w, rules)
        m["resort"] = resort
        m["winter"] = int(wy)
        rows.append(m)
    table = pd.DataFrame(rows)
    if table.empty:
        return table
    bad = table["t_coverage"] < min_coverage
    if bad.any():
        log.info("Kastar %d vintrar med temperaturtäckning < %.0f%%", int(bad.sum()), min_coverage * 100)
    table = table[~bad]
    cols = ["resort", "winter"] + [c for c in table.columns if c not in ("resort", "winter")]
    return table[cols].sort_values(["resort", "winter"]).reset_index(drop=True)


def cmip6_winter_table(
    cmip6: pd.DataFrame,
    resort_key: str,
    target_elevation: int | None = None,
    rules: SeasonRules = SEASON,
) -> pd.DataFrame:
    """Samma vintermått, per klimatmodell. Snö alltid via graddagsmodell,
    så jämförelsen med observerade vintrar ska göras mot ``snow_source == modelled``
    eller via temperatur, inte via observerat snödjup."""
    resort = RESORTS[resort_key]
    target = target_elevation if target_elevation is not None else resort.base_elevation
    sub = cmip6[cmip6["resort"] == resort_key].copy()
    grid_z = float(sub["grid_elevation"].iloc[0]) if "grid_elevation" in sub and not sub.empty else float("nan")
    frames = []
    for model, m in sub.groupby("model"):
        d = m[["date", "t_mean", "t_min", "t_max", "precip"]].copy()
        for col in ("t_mean", "t_min", "t_max"):
            d[col] = lapse_adjust(d[col], grid_z, target, rules)
        d["resort"] = resort_key
        t = winter_table(d, rules)
        t["model"] = model
        frames.append(t)
    return pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()
