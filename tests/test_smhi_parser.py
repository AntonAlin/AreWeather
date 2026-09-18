"""SMHI:s CSV är ett minfält. De här testerna är kartan."""

from pathlib import Path

import pandas as pd

from skiclimate.smhi import haversine_km, parse_smhi_csv

FIX = Path(__file__).parent / "fixtures"


def test_parses_snow_depth_daily_with_clock():
    df = parse_smhi_csv((FIX / "smhi_daily_snow.csv").read_text(encoding="utf-8"), parameter=8)
    # tom rad (1961-01-04) och orange kvalitet (1961-01-05) ska bort, G och Y kvar
    assert list(df["quality"]) == ["G", "G", "Y"]
    assert list(df["value"]) == [0.10, 0.12, 0.15]
    # klockslaget ska vara bortkastat, dagen kvar
    assert df["date"].iloc[0] == pd.Timestamp("1961-01-01")
    assert df["date"].dt.tz is None


def test_parses_representative_day_format_and_decimal_comma():
    df = parse_smhi_csv((FIX / "smhi_daily_tmean.csv").read_text(encoding="utf-8"), parameter=2)
    assert len(df) == 3
    assert df["date"].iloc[2] == pd.Timestamp("1961-01-03")
    assert df["value"].iloc[2] == -12.4  # decimalkomma, för det är Sverige


def test_parses_hourly_keeps_timestamp():
    df = parse_smhi_csv((FIX / "smhi_hourly_temp.csv").read_text(encoding="utf-8"), parameter=1)
    assert len(df) == 3
    assert df["date"].iloc[1].hour == 1
    assert df["date"].dt.tz is not None  # UTC, som SMHI säger


def test_garbage_raises():
    try:
        parse_smhi_csv("hej;hopp\n1;2\n", parameter=8)
    except ValueError as e:
        assert "datatabell" in str(e)
    else:
        raise AssertionError("borde ha kastat")


def test_haversine_are_to_salen():
    # Åre–Sälen fågelvägen är ~250 km. Om detta blir 2 500 har någon glömt radianer.
    d = haversine_km(63.399, 13.081, 61.16, 13.262)
    assert 245 < d < 255
