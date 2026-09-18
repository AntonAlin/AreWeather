"""Diagram och en markdown-sammanfattning. Inget interaktivt – detta är PNG:er
man kan klistra in i en rapport eller visa i en notebook.

Designregler som följs: en ort = en fast färg, en y-axel per diagram, tunna
linjer, ingen regnbåge, ingen sekundäraxel. Textfärg är alltid textfärg.
"""

from __future__ import annotations

import logging
from pathlib import Path

import matplotlib

matplotlib.use("Agg")  # ingen skärm på servern, och ingen i Fabric heller
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from scipy import stats  # noqa: E402

from .config import PERIODS, RESORTS, RESORT_COLORS, SEASON  # noqa: E402

log = logging.getLogger(__name__)

_TEXT = "#0b0b0b"
_MUTED = "#52514e"
_GRID = "#e6e5e1"
_SURFACE = "#fcfcfb"

METRIC_LABELS = {
    "season_days_30cm": "Dagar med ≥30 cm snö",
    "season_core_30cm": "Längsta sammanhängande period ≥30 cm (dagar)",
    "cover_days": "Dagar med snötäcke",
    "thermal_winter_length": "Termisk vinter (dagar)",
    "t_mean_winter": "Medeltemperatur dec–mar (°C)",
    "frost_days": "Frostnätter",
    "thaw_days_core": "Tödagar dec–mar",
    "snowmaking_days": "Snökanondagar nov–mar",
    "max_depth_cm": "Största snödjup (cm)",
    "rain_on_snow_days": "Regn-på-snö-dagar",
    "snow_fraction": "Andel nederbörd som snö",
}


def _style(ax: plt.Axes, ylabel: str = "") -> None:
    ax.set_facecolor(_SURFACE)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    for side in ("left", "bottom"):
        ax.spines[side].set_color(_GRID)
    ax.grid(axis="y", color=_GRID, linewidth=0.8)
    ax.tick_params(colors=_MUTED, labelsize=9)
    ax.set_ylabel(ylabel, color=_MUTED, fontsize=9)


def _resort_label(key: str) -> str:
    return RESORTS[key].name if key in RESORTS else key


def plot_metric_trends(winters: pd.DataFrame, metric: str, out: Path) -> Path:
    """Små multiplar: en panel per ort, årsvärden som punkter, Theil-Sen-linje,
    och 1961–1990 / 1991–2020-medel som två horisontella streck."""
    resorts = [r for r in RESORTS if r in set(winters["resort"])]
    fig, axes = plt.subplots(1, len(resorts), figsize=(4.2 * len(resorts), 3.6), sharey=True, facecolor=_SURFACE)
    axes = np.atleast_1d(axes)
    for ax, r in zip(axes, resorts):
        g = winters[winters["resort"] == r].dropna(subset=[metric]).sort_values("winter")
        color = RESORT_COLORS.get(r, "#2a78d6")
        ax.plot(g["winter"], g[metric], color=color, linewidth=1.2, alpha=0.6)
        ax.scatter(g["winter"], g[metric], color=color, s=12, zorder=3)
        if len(g) >= 10:
            sen = stats.theilslopes(g[metric], g["winter"])
            xs = np.array([g["winter"].min(), g["winter"].max()])
            ax.plot(xs, sen.intercept + sen.slope * xs, color=_TEXT, linewidth=2)
            ax.text(
                0.02, 0.96, f"{sen.slope * 10:+.1f} per decennium", transform=ax.transAxes,
                fontsize=9, color=_TEXT, va="top",
            )
        for pid, (a, b) in (("past", PERIODS["past"]), ("present", PERIODS["present"])):
            m = g[g["winter"].between(a, b)][metric].mean()
            if np.isfinite(m):
                ax.hlines(m, a, b, color=_MUTED, linewidth=1, linestyle="--")
        ax.set_title(_resort_label(r), color=_TEXT, fontsize=11, loc="left")
        _style(ax, METRIC_LABELS.get(metric, metric) if ax is axes[0] else "")
    fig.suptitle(METRIC_LABELS.get(metric, metric), color=_TEXT, fontsize=12, x=0.01, ha="left")
    fig.tight_layout()
    path = out / f"trend_{metric}.png"
    fig.savefig(path, dpi=150, facecolor=_SURFACE)
    plt.close(fig)
    return path


def plot_sensitivity(winters: pd.DataFrame, out: Path, target: str = "season_days_30cm") -> Path:
    """Säsongsdagar mot vintertemperatur, en regressionslinje per ort."""
    fig, ax = plt.subplots(figsize=(7, 4.5), facecolor=_SURFACE)
    for r in RESORTS:
        g = winters[winters["resort"] == r].dropna(subset=[target, "t_mean_winter"])
        if g.empty:
            continue
        color = RESORT_COLORS[r]
        ax.scatter(g["t_mean_winter"], g[target], color=color, s=16, alpha=0.7, label=_resort_label(r))
        if len(g) >= 10:
            slope, intercept = np.polyfit(g["t_mean_winter"], g[target], 1)
            xs = np.linspace(g["t_mean_winter"].min(), g["t_mean_winter"].max(), 20)
            ax.plot(xs, intercept + slope * xs, color=color, linewidth=2)
            ax.text(xs[-1], intercept + slope * xs[-1], f" {slope:+.0f} d/°C", color=_TEXT, fontsize=9, va="center")
    ax.axhline(SEASON.reliable_days, color=_MUTED, linestyle="--", linewidth=1)
    ax.text(ax.get_xlim()[1], SEASON.reliable_days, "100-dagarsregeln ", color=_MUTED, fontsize=8, va="bottom", ha="right")
    ax.set_xlabel("Medeltemperatur dec–mar (°C)", color=_MUTED, fontsize=9)
    _style(ax, METRIC_LABELS.get(target, target))
    ax.legend(frameon=False, fontsize=9, labelcolor=_TEXT)
    ax.set_title("Hur mycket säsong kostar en grad?", color=_TEXT, fontsize=12, loc="left")
    fig.tight_layout()
    path = out / "sensitivity.png"
    fig.savefig(path, dpi=150, facecolor=_SURFACE)
    plt.close(fig)
    return path


def plot_projection(winters: pd.DataFrame, proj: pd.DataFrame, out: Path, target: str = "season_days_30cm") -> Path | None:
    """Observerat till idag, sedan ensemblemedian med modellspridning som band.

    Bandet är min–max mellan de sju modellerna (10-års glidande), inte ett
    konfidensintervall. Sju modeller är inte ett stickprov ur något.
    """
    if proj.empty:
        return None
    resorts = [r for r in RESORTS if r in set(proj["resort"])]
    fig, axes = plt.subplots(1, len(resorts), figsize=(4.2 * len(resorts), 3.8), sharey=True, facecolor=_SURFACE)
    axes = np.atleast_1d(axes)
    for ax, r in zip(axes, resorts):
        color = RESORT_COLORS[r]
        o = winters[winters["resort"] == r].dropna(subset=[target]).sort_values("winter")
        ax.plot(o["winter"], o[target].rolling(10, center=True, min_periods=5).mean(), color=color, linewidth=2, label="observerat, 10-årsmedel")
        ax.scatter(o["winter"], o[target], color=color, s=8, alpha=0.4)
        p = proj[proj["resort"] == r].pivot_table(index="winter", columns="model", values="pred")
        p = p.rolling(10, center=True, min_periods=5).mean()
        ax.fill_between(p.index, p.min(axis=1), p.max(axis=1), color=color, alpha=0.15, linewidth=0, label="spridning, 7 CMIP6-modeller")
        ax.plot(p.index, p.median(axis=1), color=_TEXT, linewidth=1.5, linestyle="--", label="ensemblemedian")
        ax.axhline(SEASON.reliable_days, color=_MUTED, linewidth=1, linestyle=":")
        ax.axvline(o["winter"].max(), color=_GRID, linewidth=1)
        ax.set_title(_resort_label(r), color=_TEXT, fontsize=11, loc="left")
        _style(ax, METRIC_LABELS.get(target, target) if ax is axes[0] else "")
    handles, labels = axes[0].get_legend_handles_labels()
    fig.legend(handles, labels, frameon=False, fontsize=8, labelcolor=_TEXT, loc="lower center", ncol=3, bbox_to_anchor=(0.5, 0.0))
    fig.suptitle("Projicerad säsongslängd, SSP5-8.5 (varmaste scenariot)", color=_TEXT, fontsize=12, x=0.01, ha="left")
    fig.tight_layout(rect=(0, 0.07, 1, 1))
    path = out / f"projection_{target}.png"
    fig.savefig(path, dpi=150, facecolor=_SURFACE)
    plt.close(fig)
    return path


def plot_global_coupling(winters: pd.DataFrame, gistemp: pd.DataFrame | None, out: Path) -> Path | None:
    if gistemp is None or gistemp.empty:
        return None
    fig, ax = plt.subplots(figsize=(7, 4.5), facecolor=_SURFACE)
    for r in RESORTS:
        g = winters[winters["resort"] == r].merge(gistemp, left_on="winter", right_on="year").dropna(subset=["t_mean_winter", "global_anom_djf"])
        if len(g) < 10:
            continue
        color = RESORT_COLORS[r]
        ax.scatter(g["global_anom_djf"], g["t_mean_winter"], color=color, s=16, alpha=0.7, label=_resort_label(r))
        slope, intercept = np.polyfit(g["global_anom_djf"], g["t_mean_winter"], 1)
        xs = np.linspace(g["global_anom_djf"].min(), g["global_anom_djf"].max(), 20)
        ax.plot(xs, intercept + slope * xs, color=color, linewidth=2)
        ax.text(xs[-1], intercept + slope * xs[-1], f" ×{slope:.1f}", color=_TEXT, fontsize=9, va="center")
    ax.set_xlabel("Global vinteranomali DJF, GISTEMP (°C mot 1951–1980)", color=_MUTED, fontsize=9)
    _style(ax, "Lokal medeltemperatur dec–mar (°C)")
    ax.legend(frameon=False, fontsize=9, labelcolor=_TEXT)
    ax.set_title("Lokal vinter mot global uppvärmning", color=_TEXT, fontsize=12, loc="left")
    fig.tight_layout()
    path = out / "global_coupling.png"
    fig.savefig(path, dpi=150, facecolor=_SURFACE)
    plt.close(fig)
    return path


# ---------------------------------------------------------------------------
# Markdown
# ---------------------------------------------------------------------------


def _fmt(x, nd=1) -> str:
    if x is None or (isinstance(x, float) and not np.isfinite(x)):
        return "–"
    return f"{x:.{nd}f}"


def _sig(p: float) -> str:
    if not np.isfinite(p):
        return ""
    return "***" if p < 0.001 else "**" if p < 0.01 else "*" if p < 0.05 else ""


def write_summary(
    out: Path,
    winters: pd.DataFrame,
    trends: pd.DataFrame,
    changepoints: pd.DataFrame,
    periods: pd.DataFrame,
    sensitivity: pd.DataFrame,
    coupling: pd.DataFrame,
    proj_summary: pd.DataFrame,
    unreliable: pd.DataFrame,
    model_notes: list,
    figures: list[Path],
    data_note: str = "",
) -> Path:
    L: list[str] = []
    L.append("# Skidorternas vintrar – Sälen, Åre, Tärnaby\n")
    if data_note:
        L.append(f"> {data_note}\n")
    L.append("Vinter *N* = juli *N−1* till juni *N*. Signifikans: \\* p<0,05, \\*\\* p<0,01, \\*\\*\\* p<0,001 (Mann-Kendall).\n")

    L.append("## Datatäckning\n")
    L.append("| Ort | Vintrar | Första | Sista | Snödjup observerat (andel vintrar) |")
    L.append("|---|---|---|---|---|")
    for r, g in winters.groupby("resort"):
        obs_share = (g["snow_source"] == "observed").mean() if "snow_source" in g else float("nan")
        L.append(f"| {_resort_label(r)} | {len(g)} | {g['winter'].min()} | {g['winter'].max()} | {_fmt(obs_share * 100, 0)} % |")
    L.append("")

    L.append("## Trender (Theil-Sen per decennium, 95 % KI)\n")
    L.append("| Ort | Mått | Period | Medel | Per decennium | KI | Totalt | MK |")
    L.append("|---|---|---|---|---|---|---|---|")
    for _, t in trends.iterrows():
        L.append(
            f"| {_resort_label(t['resort'])} | {METRIC_LABELS.get(t['metric'], t['metric'])} | {t['first_year']}–{t['last_year']} | "
            f"{_fmt(t['mean'])} | {t['sen_slope_per_decade']:+.2f} | [{_fmt(t['sen_lo'], 2)}, {_fmt(t['sen_hi'], 2)}] | "
            f"{t['total_change']:+.1f} | {_sig(t['mk_p'])} |"
        )
    L.append("")

    if not periods.empty:
        p0, p1 = PERIODS["past"], PERIODS["present"]
        L.append(f"## {p0[0]}–{p0[1]} mot {p1[0]}–{p1[1]}\n")
        L.append("| Ort | Mått | Då | Nu | Skillnad | Welch p | Mann-Whitney p |")
        L.append("|---|---|---|---|---|---|---|")
        for _, t in periods.iterrows():
            L.append(
                f"| {_resort_label(t['resort'])} | {METRIC_LABELS.get(t['metric'], t['metric'])} | {_fmt(t['past_mean'])} | "
                f"{_fmt(t['present_mean'])} | {t['diff']:+.1f} | {_fmt(t['welch_p'], 3)} | {_fmt(t['mannwhitney_p'], 3)} |"
            )
        L.append("")

    if not changepoints.empty:
        L.append("## Brytpunkter (nivåskifte, permutationstest)\n")
        L.append("| Ort | Mått | År | Före | Efter | Skifte | p |")
        L.append("|---|---|---|---|---|---|---|")
        for _, t in changepoints.iterrows():
            yr = int(t["year"]) if np.isfinite(t["year"]) else "–"
            L.append(
                f"| {_resort_label(t['resort'])} | {METRIC_LABELS.get(t['metric'], t['metric'])} | {yr} | {_fmt(t['before'])} | "
                f"{_fmt(t['after'])} | {t['shift']:+.1f} | {_fmt(t['p'], 3)} |"
            )
        L.append("")

    if not sensitivity.empty:
        L.append("## Känslighet: säsongsdagar per grad\n")
        L.append("| Ort | Dagar per °C (dec–mar) | SE | p | Dagar per 100 mm nederbörd | R² |")
        L.append("|---|---|---|---|---|---|")
        for _, t in sensitivity.iterrows():
            L.append(
                f"| {_resort_label(t['resort'])} | {t['days_per_degC']:+.1f} | {_fmt(t['days_per_degC_se'])} | {_fmt(t['p_temp'], 3)} | "
                f"{t['days_per_100mm']:+.1f} | {_fmt(t['r2'], 2)} |"
            )
        L.append("")

    if not coupling.empty:
        L.append("## Koppling till global uppvärmning (NASA GISTEMP, DJF)\n")
        L.append("| Ort | Lokal °C per global °C | SE | p | R² | Säsongsdagar per global °C | p |")
        L.append("|---|---|---|---|---|---|---|")
        for _, t in coupling.iterrows():
            L.append(
                f"| {_resort_label(t['resort'])} | {t['local_degC_per_global_degC']:.2f} | {_fmt(t['se'], 2)} | {_fmt(t['p'], 3)} | "
                f"{_fmt(t['r2_temp'], 2)} | {t['season_days_per_global_degC']:+.1f} | {_fmt(t['p_season'], 3)} |"
            )
        L.append("")

    if model_notes:
        L.append("## Projektionsmodell (tidsserie-CV, MAE i dagar)\n")
        L.append("| Ort | Gradient boosting | Ridge | Klimatologi | Vald | Träningsvintrar |")
        L.append("|---|---|---|---|---|---|")
        for m in model_notes:
            L.append(f"| {_resort_label(m.resort)} | {_fmt(m.cv_mae_gbr)} | {_fmt(m.cv_mae_linear)} | {_fmt(m.cv_mae_climatology)} | {m.chosen} | {m.n_train} |")
        L.append("")
        L.append("Om ingen modell slår klimatologin är projektionen för den orten inte värd papperet.\n")

    if not proj_summary.empty:
        L.append("## Projicerad säsongslängd per decennium (dagar ≥30 cm, SSP5-8.5)\n")
        L.append("| Ort | Decennium | Ensemblemedian | Lägsta modell | Högsta modell | Andel vintrar ≥100 dagar |")
        L.append("|---|---|---|---|---|---|")
        for _, t in proj_summary.iterrows():
            L.append(
                f"| {_resort_label(t['resort'])} | {t['decade']}-talet | {_fmt(t['median'], 0)} | {_fmt(t['min_model'], 0)} | "
                f"{_fmt(t['max_model'], 0)} | {_fmt(t['share_reliable'] * 100, 0)} % |"
            )
        L.append("")
        for _, u in unreliable.iterrows():
            d = u["first_unreliable_decade"]
            if d and u.get("already"):
                msg = f"ligger redan på {int(d)}-talet under 50 % vintrar med 100 dagar. Frågan är inte när, utan sedan när – se trendtabellen."
            elif d:
                msg = f"första decenniet där under hälften av modellvintrarna klarar 100-dagarsregeln: **{int(d)}-talet**."
            else:
                msg = "klarar 100-dagarsregeln i majoriteten av modellvintrar hela vägen till 2050."
            L.append(f"- **{_resort_label(u['resort'])}**: {msg}")
        L.append("")
        L.append(
            "Scenariot är SSP5-8.5, det varmaste som finns tillgängligt. Verkligheten ligger sannolikt under. "
            "Bandet mellan modellerna är en spridning, inte ett konfidensintervall.\n"
        )

    if figures:
        L.append("## Figurer\n")
        for f in figures:
            if f is not None:
                L.append(f"![{f.stem}]({f.name})")
        L.append("")

    path = out / "summary.md"
    path.write_text("\n".join(L), encoding="utf-8")
    return path
