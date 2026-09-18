import numpy as np
import pandas as pd

from skiclimate import features
from skiclimate.config import SEASON


def _winter(t_mean, precip=None, snow=None, start="2019-07-01"):
    n = len(t_mean)
    dates = pd.date_range(start, periods=n, freq="D")
    df = pd.DataFrame({"date": dates, "t_mean": t_mean, "t_min": np.array(t_mean) - 3, "t_max": np.array(t_mean) + 3})
    df["precip"] = precip if precip is not None else 0.0
    if snow is not None:
        df["snow_depth"] = snow
    df["resort"] = "are"
    return df


def test_winter_year_label():
    d = pd.Series(pd.to_datetime(["2019-06-30", "2019-07-01", "2020-01-15", "2020-06-30", "2020-07-01"]))
    assert list(features.winter_year(d)) == [2019, 2020, 2020, 2020, 2021]


def test_degree_day_snowpack_accumulates_and_melts():
    t = np.array([-5, -5, -5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5], dtype=float)
    p = np.array([10, 10, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], dtype=float)
    d = features.degree_day_snowpack(t, p)
    # 30 mm vatten vid 300 kg/m³ = 10 cm snö
    assert np.isclose(d[2], 10.0)
    # 3.5 mm/°C/dag * 5 °C = 17.5 mm/dag -> borta efter två dagar
    assert d[3] > 0 and np.isclose(d[5], 0.0)
    assert (d >= 0).all()


def test_winter_metrics_with_observed_snow():
    n = 365
    t = np.full(n, -5.0)
    t[:90] = 8.0     # jul-sep varmt
    t[300:] = 8.0    # maj-jun varmt
    snow = np.zeros(n)
    snow[120:260] = 40.0   # 140 dagar med 40 cm
    snow[180:185] = 10.0   # ett hål i mitten, som ett riktigt tövädersgenombrott
    w = _winter(t, precip=2.0, snow=snow)
    m = features.winter_metrics(w)
    assert m["snow_source"] == "observed"
    assert m["season_days_30cm"] == 135
    assert m["season_core_30cm"] == 75   # 185..259
    assert m["snow_reliable"] is True
    assert m["season_start_doy"] == 120 and m["season_end_doy"] == 259
    assert m["season_span"] == 140
    assert m["frost_days"] == 210   # dagar med t_min < 0: 90..299
    assert m["thermal_winter_length"] == 210
    assert m["thaw_days_core"] == 0
    assert m["max_depth_cm"] == 40.0


def test_winter_metrics_falls_back_to_model_when_snow_missing():
    n = 365
    t = np.full(n, -5.0)
    t[:90] = 8.0
    t[300:] = 8.0
    w = _winter(t, precip=3.0)  # inget snödjup alls
    m = features.winter_metrics(w)
    assert m["snow_source"] == "modelled"
    assert m["season_days_30cm"] > 0
    assert m["cover_days"] > m["season_days_30cm"]


def test_winter_table_drops_partial_winters_and_low_coverage():
    n = 365 * 3
    t = -5 + 10 * np.sin(np.arange(n) / 58.0)
    w = _winter(t, precip=2.0, start="2018-07-01")
    gone = (w["date"] >= "2020-01-01") & (w["date"] < "2020-07-01")  # termometern gick sönder i ett halvår
    w.loc[gone, ["t_mean", "t_min", "t_max"]] = np.nan
    tbl = features.winter_table(w)
    # 2019 komplett, 2020 halvt NaN (kastas), 2021 komplett
    assert set(tbl["winter"]) == {2019, 2021}


def test_lapse_adjust_direction():
    s = pd.Series([0.0, 10.0])
    up = features.lapse_adjust(s, 400, 1400)
    assert np.allclose(up, [-6.5, 3.5])   # 1000 m upp = 6,5 grader kallare
    assert features.lapse_adjust(s, np.nan, 1400).equals(s)


def test_build_daily_station_beats_era5_and_fills_gaps():
    dates = pd.date_range("2020-01-01", "2020-01-10")
    era5 = pd.DataFrame({"date": dates, "t_mean": 0.0, "t_min": -3.0, "t_max": 3.0, "precip": 1.0, "resort": "are", "grid_elevation": 380.0})
    obs = pd.DataFrame(
        {"date": dates[[0, 1, 2, 5]], "value": [-10.0, -10.0, -10.0, -10.0], "quality": "G", "resort": "are",
         "parameter": 2, "variable": "t_mean", "unit": "°C", "station_key": 1}
    )
    st = pd.DataFrame([{"resort": "are", "parameter": 2, "variable": "t_mean", "station_key": 1, "name": "x", "lat": 0, "lon": 0,
                        "height": 380.0, "distance_km": 1.0, "active": True, "from_year": 2020, "to_year": 2020, "n_obs": 4,
                        "first_obs": dates[0], "last_obs": dates[5]}])
    d = features.build_daily("are", obs, st, era5)
    assert d["t_mean"].iloc[0] == -10.0 and d["source_t_mean"].iloc[0] == "smhi"
    assert d["t_mean"].iloc[3] == 0.0 and d["source_t_mean"].iloc[3] == "era5"
    assert len(d) == 10
