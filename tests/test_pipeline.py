"""Hela kedjan på syntetisk data, in i en tmp-katalog. Tar ~15 s."""

from pathlib import Path

import pandas as pd

from skiclimate.cli import main


def test_end_to_end_synthetic(tmp_path: Path):
    main(["all", "--synthetic", "--resorts", "are,tarnaby", "--data-dir", str(tmp_path)])
    out = tmp_path / "output"
    assert (out / "summary.md").exists()
    assert (out / "projection_by_decade.csv").exists()
    w = pd.read_parquet(tmp_path / "processed" / "winters.parquet")
    assert set(w["resort"]) == {"are", "tarnaby"}
    assert w["winter"].min() >= 1962 and len(w) > 100
    trends = pd.read_csv(out / "trends.csv")
    # syntetisk data har inbyggd uppvärmning på 0,04 °C/år; om den inte syns är trendkoden trasig
    t = trends[(trends["metric"] == "t_mean_winter")]
    assert (t["sen_slope_per_decade"] > 0.2).all()
    assert (t["mk_p"] < 0.05).all()
    assert (out / "projection_season_days_30cm.png").stat().st_size > 10_000
