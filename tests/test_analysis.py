import numpy as np
import pandas as pd

from skiclimate import analysis


def test_mann_kendall_detects_monotone_trend():
    y = np.arange(30, dtype=float) + np.random.default_rng(0).normal(0, 1, 30)
    s, z, p = analysis.mann_kendall(y)
    assert s > 0 and p < 0.001


def test_mann_kendall_flat_is_not_significant():
    y = np.random.default_rng(1).normal(0, 1, 40)
    _, _, p = analysis.mann_kendall(y)
    assert p > 0.05


def test_trend_result_direction():
    years = pd.Series(np.arange(1970, 2020))
    y = pd.Series(100 - 0.5 * (years - 1970) + np.random.default_rng(2).normal(0, 3, 50))
    r = analysis.trend(y, years, "are", "x")
    assert r is not None
    assert -6.5 < r.sen_slope_per_decade < -3.5
    assert r.mk_p < 0.01


def test_changepoint_finds_step():
    years = pd.Series(np.arange(1960, 2020))
    y = pd.Series(np.where(years < 1990, 100.0, 70.0) + np.random.default_rng(3).normal(0, 4, 60))
    cp = analysis.changepoint(y, years, n_boot=199)
    assert 1988 <= cp["year"] <= 1992
    assert cp["shift"] < -20
    assert cp["p"] < 0.05


def test_bias_correct_matches_reference_moments():
    winters = np.arange(1991, 2021)
    obs = pd.DataFrame({"resort": "are", "winter": winters, "t_mean_winter": np.random.default_rng(4).normal(-6, 2, 30)})
    cm = pd.DataFrame({"resort": "are", "model": "m", "winter": np.arange(1950, 2051)})
    cm["t_mean_winter"] = np.random.default_rng(5).normal(-3, 1, len(cm)) + 0.03 * (cm["winter"] - 1950)
    out = analysis.bias_correct(cm, obs, features=("t_mean_winter",))
    ref = out[out["winter"].between(1991, 2020)]["t_mean_winter"]
    assert abs(ref.mean() - obs["t_mean_winter"].mean()) < 1e-9
    assert abs(ref.std(ddof=1) - obs["t_mean_winter"].std(ddof=1)) < 1e-9
    # trenden ska överleva korrigeringen
    assert out[out["winter"] > 2040]["t_mean_winter"].mean() > out[out["winter"] < 1960]["t_mean_winter"].mean()


def test_first_unreliable_decade_only_looks_forward():
    s = pd.DataFrame({"resort": ["are"] * 4, "decade": [2000, 2010, 2020, 2030], "share_reliable": [0.2, 0.9, 0.8, 0.3]})
    r = analysis.first_unreliable_decade(s)
    assert r["first_unreliable_decade"].iloc[0] == 2030 and not r["already"].iloc[0]
