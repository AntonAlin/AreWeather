"""Kommandoraden. Tre steg som kan köras var för sig eller i följd.

    python run_pipeline.py download            # SMHI + ERA5 + CMIP6 + GISTEMP
    python run_pipeline.py features            # bygg dygnsserier och vintertabell
    python run_pipeline.py analyze             # statistik, ML, figurer, summary.md
    python run_pipeline.py all --synthetic     # hela kedjan på påhittad data

Allt hamnar under --data-dir (default ./data).
"""

from __future__ import annotations

import argparse
import logging
import sys

import pandas as pd

from . import analysis, features, report, store, synthetic
from .config import RESORTS, Paths

log = logging.getLogger("skiclimate")


def _resorts(arg: str) -> list[str]:
    if arg == "all":
        return list(RESORTS)
    keys = [k.strip() for k in arg.split(",")]
    bad = [k for k in keys if k not in RESORTS]
    if bad:
        sys.exit(f"Okända orter: {bad}. Välj bland {list(RESORTS)}")
    return keys


# ---------------------------------------------------------------------------
# download
# ---------------------------------------------------------------------------


def cmd_download(a: argparse.Namespace, paths: Paths) -> None:
    keys = _resorts(a.resorts)

    if a.synthetic:
        log.warning("SYNTETISK DATA. Ingenting här är uppmätt. Bra för att testa koden, värdelöst för slutsatser.")
        era5, obs, st, cmip = [], [], [], []
        for k in keys:
            e = synthetic.synthetic_era5(k)
            o, s = synthetic.synthetic_smhi(k, e)
            era5.append(e)
            obs.append(o)
            st.append(s)
            if not a.no_cmip6:
                cmip.append(synthetic.synthetic_cmip6(k))
        store.save(pd.concat(era5), paths.raw / "era5_daily")
        store.save(pd.concat(obs), paths.raw / "smhi_obs")
        store.save(pd.concat(st), paths.raw / "smhi_stations")
        if cmip:
            store.save(pd.concat(cmip), paths.raw / "cmip6_daily")
        store.save(synthetic.synthetic_gistemp(), paths.raw / "gistemp")
        return

    from . import openmeteo, smhi  # nätverksmoduler, importeras bara när de behövs

    if not a.no_smhi:
        obs, st = smhi.download_all(keys, hourly=a.smhi_hourly)
        store.save(obs, paths.raw / "smhi_obs")
        store.save(st, paths.raw / "smhi_stations")

    if not a.no_era5:
        frames = []
        for k in keys:
            df, _ = openmeteo.fetch_era5_daily(RESORTS[k])
            frames.append(df)
        store.save(pd.concat(frames, ignore_index=True), paths.raw / "era5_daily")

    if a.era5_snow:
        frames = [openmeteo.fetch_era5_snow_depth(RESORTS[k]) for k in keys]
        store.save(pd.concat(frames, ignore_index=True), paths.raw / "era5_snow")

    if not a.no_cmip6:
        frames = []
        for k in keys:
            df, _ = openmeteo.fetch_cmip6(RESORTS[k])
            frames.append(df)
        store.save(pd.concat(frames, ignore_index=True), paths.raw / "cmip6_daily")

    try:
        store.save(openmeteo.fetch_gistemp(), paths.raw / "gistemp")
    except Exception as e:  # noqa: BLE001
        log.warning("GISTEMP gick inte att hämta (%s). Analysen kör utan global koppling.", e)


# ---------------------------------------------------------------------------
# features
# ---------------------------------------------------------------------------


def cmd_features(a: argparse.Namespace, paths: Paths) -> None:
    keys = _resorts(a.resorts)
    obs = store.load(paths.raw / "smhi_obs")
    st = store.load(paths.raw / "smhi_stations")
    era5 = store.load(paths.raw / "era5_daily")
    era5_snow = store.load(paths.raw / "era5_snow")
    cmip = store.load(paths.raw / "cmip6_daily")
    if obs is None and era5 is None:
        sys.exit("Ingen rådata. Kör `download` först.")

    daily_frames, winter_frames, cmip_frames = [], [], []
    for k in keys:
        target = RESORTS[k].top_elevation if a.elevation == "top" else RESORTS[k].base_elevation
        d = features.build_daily(k, obs, st, era5, era5_snow, target_elevation=target)
        daily_frames.append(d)
        w = features.winter_table(d)
        winter_frames.append(w)
        log.info("%s: %d dygn, %d vintrar (%d–%d)", RESORTS[k].name, len(d), len(w), w["winter"].min(), w["winter"].max())
        if cmip is not None and not cmip.empty:
            cmip_frames.append(features.cmip6_winter_table(cmip, k, target_elevation=target))

    store.save(pd.concat(daily_frames, ignore_index=True), paths.processed / "daily")
    store.save(pd.concat(winter_frames, ignore_index=True), paths.processed / "winters")
    if cmip_frames:
        store.save(pd.concat(cmip_frames, ignore_index=True), paths.processed / "cmip6_winters")


# ---------------------------------------------------------------------------
# analyze
# ---------------------------------------------------------------------------


def cmd_analyze(a: argparse.Namespace, paths: Paths) -> None:
    winters = store.load(paths.processed / "winters")
    if winters is None:
        sys.exit("Ingen vintertabell. Kör `features` först.")
    cmip_w = store.load(paths.processed / "cmip6_winters")
    gistemp = store.load(paths.raw / "gistemp")
    out = paths.output

    trends = analysis.all_trends(winters)
    cps = analysis.all_changepoints(winters)
    periods = analysis.period_comparison(winters)
    sens = analysis.season_sensitivity(winters)
    coupling = analysis.global_coupling(winters, gistemp)
    for name, df in (("trends", trends), ("changepoints", cps), ("period_comparison", periods), ("sensitivity", sens), ("global_coupling", coupling)):
        if not df.empty:
            df.to_csv(out / f"{name}.csv", index=False)

    proj, notes, proj_summary, unreliable = pd.DataFrame(), [], pd.DataFrame(), pd.DataFrame()
    if cmip_w is not None and not cmip_w.empty:
        corrected = analysis.bias_correct(cmip_w, winters)
        proj, notes = analysis.fit_projection(winters, corrected)
        if not proj.empty:
            proj.to_csv(out / "projection_winters.csv", index=False)
            proj_summary = analysis.summarise_projection(proj)
            proj_summary.to_csv(out / "projection_by_decade.csv", index=False)
            unreliable = analysis.first_unreliable_decade(proj_summary)

    figures = [report.plot_metric_trends(winters, m, out) for m in ("season_days_30cm", "t_mean_winter", "thaw_days_core", "snowmaking_days", "thermal_winter_length")]
    figures.append(report.plot_sensitivity(winters, out))
    figures.append(report.plot_global_coupling(winters, gistemp, out))
    figures.append(report.plot_projection(winters, proj, out))

    note = "SYNTETISK DATA – siffrorna nedan är påhittade och finns bara för att visa att pipelinen fungerar." if a.synthetic else ""
    path = report.write_summary(out, winters, trends, cps, periods, sens, coupling, proj_summary, unreliable, notes, [f for f in figures if f], note)
    log.info("Sammanfattning: %s", path)
    print(path.read_text(encoding="utf-8"))


# ---------------------------------------------------------------------------


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="skiclimate", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("command", choices=("download", "features", "analyze", "all"))
    p.add_argument("--resorts", default="all", help="kommaseparerat: salen,are,tarnaby (default alla)")
    p.add_argument("--data-dir", default="data")
    p.add_argument("--synthetic", action="store_true", help="påhittad data istället för nätverk (test/demo)")
    p.add_argument("--elevation", choices=("base", "top"), default="base", help="vilken höjd säsongen beskrivs på")
    p.add_argument("--no-smhi", action="store_true")
    p.add_argument("--no-era5", action="store_true")
    p.add_argument("--no-cmip6", action="store_true")
    p.add_argument("--era5-snow", action="store_true", help="hämta ERA5-snödjup per timme (långsamt, ~85 anrop per ort)")
    p.add_argument("--smhi-hourly", action="store_true", help="hämta även timdata från SMHI (stora filer)")
    p.add_argument("-v", "--verbose", action="store_true")
    return p


def main(argv: list[str] | None = None) -> None:
    a = build_parser().parse_args(argv)
    logging.basicConfig(level=logging.DEBUG if a.verbose else logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s", datefmt="%H:%M:%S")
    paths = Paths(root=__import__("pathlib").Path(a.data_dir)).ensure()
    steps = {"download": cmd_download, "features": cmd_features, "analyze": cmd_analyze}
    for name in (("download", "features", "analyze") if a.command == "all" else (a.command,)):
        log.info("==== %s ====", name)
        steps[name](a, paths)
