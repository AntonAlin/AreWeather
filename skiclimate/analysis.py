"""Statistik och ML på vintertabellen.

Fyra frågor, fyra verktyg:

1. Finns det en trend?            -> Theil-Sen + Mann-Kendall, OLS med HAC-fel
2. När bröt det?                  -> en brytpunkt i medelnivå, bootstrappad
3. Hur känslig är säsongen?       -> säsongsdagar per °C vintertemperatur, och
                                     lokal vintertemperatur per °C global
4. Hur långa blir säsongerna?     -> gradient boosting tränad på observationer,
                                     applicerad på biaskorrigerade CMIP6-vintrar

Inget här är en prognos för nästa vinter. Det är klimat, inte väder.
"""

from __future__ import annotations

import logging
from dataclasses import asdict, dataclass

import numpy as np
import pandas as pd
from scipy import stats

from .config import PERIODS

log = logging.getLogger(__name__)

#: mått värda att trenda. Ordning = ordning i rapporten.
TREND_METRICS = (
    "season_days_30cm",
    "season_core_30cm",
    "cover_days",
    "thermal_winter_length",
    "t_mean_winter",
    "frost_days",
    "thaw_days_core",
    "snowmaking_days",
    "max_depth_cm",
    "rain_on_snow_days",
    "snow_fraction",
)


# ---------------------------------------------------------------------------
# 1. Trender
# ---------------------------------------------------------------------------


def mann_kendall(x: np.ndarray) -> tuple[float, float, float]:
    """Mann-Kendall-test för monoton trend. Returnerar (S, z, p).

    Icke-parametriskt: bryr sig inte om fördelningen, bara om senare värden
    tenderar att vara större än tidigare. Tie-korrigerad varians enligt
    Kendall (1975). Ingen autokorrelationskorrigering – vintrar är hyfsat
    oberoende av varandra, till skillnad från dagar.
    """
    x = np.asarray(x, dtype=float)
    x = x[np.isfinite(x)]
    n = len(x)
    if n < 4:
        return np.nan, np.nan, np.nan
    s = 0.0
    for i in range(n - 1):
        s += np.sign(x[i + 1 :] - x[i]).sum()
    _, counts = np.unique(x, return_counts=True)
    tie_term = np.sum(counts * (counts - 1) * (2 * counts + 5))
    var_s = (n * (n - 1) * (2 * n + 5) - tie_term) / 18.0
    if var_s <= 0:
        return s, 0.0, 1.0
    z = (s - 1) / np.sqrt(var_s) if s > 0 else (s + 1) / np.sqrt(var_s) if s < 0 else 0.0
    p = 2 * (1 - stats.norm.cdf(abs(z)))
    return float(s), float(z), float(p)


@dataclass
class TrendResult:
    resort: str
    metric: str
    n: int
    first_year: int
    last_year: int
    mean: float
    #: Theil-Sen-lutning per decennium, med 95 % konfidensintervall
    sen_slope_per_decade: float
    sen_lo: float
    sen_hi: float
    #: Mann-Kendall p-värde
    mk_p: float
    #: OLS-lutning per decennium med Newey-West-standardfel (lag 2) och p
    ols_slope_per_decade: float
    ols_se: float
    ols_p: float
    #: total förändring över perioden enligt Theil-Sen
    total_change: float


def trend(series: pd.Series, years: pd.Series, resort: str, metric: str) -> TrendResult | None:
    ok = np.isfinite(series.to_numpy(dtype=float))
    y = series.to_numpy(dtype=float)[ok]
    t = years.to_numpy(dtype=float)[ok]
    if len(y) < 10:
        return None
    sen = stats.theilslopes(y, t, alpha=0.95)
    _, _, mk_p = mann_kendall(y)

    import statsmodels.api as sm  # tungt att importera, gör det bara här

    X = sm.add_constant(t)
    ols = sm.OLS(y, X).fit(cov_type="HAC", cov_kwds={"maxlags": 2})
    return TrendResult(
        resort=resort,
        metric=metric,
        n=int(len(y)),
        first_year=int(t.min()),
        last_year=int(t.max()),
        mean=float(y.mean()),
        sen_slope_per_decade=float(sen.slope * 10),
        sen_lo=float(sen.low_slope * 10),
        sen_hi=float(sen.high_slope * 10),
        mk_p=float(mk_p),
        ols_slope_per_decade=float(ols.params[1] * 10),
        ols_se=float(ols.bse[1] * 10),
        ols_p=float(ols.pvalues[1]),
        total_change=float(sen.slope * (t.max() - t.min())),
    )


def all_trends(winters: pd.DataFrame, metrics: tuple[str, ...] = TREND_METRICS) -> pd.DataFrame:
    rows = []
    for resort, g in winters.groupby("resort"):
        for m in metrics:
            if m not in g:
                continue
            r = trend(g[m], g["winter"], resort, m)
            if r is not None:
                rows.append(asdict(r))
    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# 2. Brytpunkt
# ---------------------------------------------------------------------------


def _best_split(y: np.ndarray, min_seg: int) -> tuple[int, float]:
    """Index och SSE-minskning för bästa enkla nivåskifte."""
    n = len(y)
    total = ((y - y.mean()) ** 2).sum()
    best_k, best_gain = -1, 0.0
    cs = np.cumsum(y)
    cs2 = np.cumsum(y**2)
    for k in range(min_seg, n - min_seg + 1):
        left = cs2[k - 1] - cs[k - 1] ** 2 / k
        right = (cs2[-1] - cs2[k - 1]) - (cs[-1] - cs[k - 1]) ** 2 / (n - k)
        gain = total - left - right
        if gain > best_gain:
            best_k, best_gain = k, gain
    return best_k, best_gain


def changepoint(series: pd.Series, years: pd.Series, min_seg: int = 10, n_boot: int = 999, seed: int = 0) -> dict:
    """En brytpunkt i medelnivå, p-värde via permutation.

    Nollhypotes: ingen brytpunkt, vintrarna är utbytbara. Vi blandar om
    serien 999 gånger och ser hur ofta slumpen hittar ett lika bra skifte.
    Bara medelnivå – en gradvis trend kan också ge en "brytpunkt" i mitten,
    så läs den ihop med trendtestet, inte istället för.
    """
    ok = np.isfinite(series.to_numpy(dtype=float))
    y = series.to_numpy(dtype=float)[ok]
    t = years.to_numpy()[ok]
    if len(y) < 2 * min_seg + 2:
        return {"year": np.nan, "before": np.nan, "after": np.nan, "shift": np.nan, "p": np.nan}
    k, gain = _best_split(y, min_seg)
    rng = np.random.default_rng(seed)
    hits = 0
    for _ in range(n_boot):
        _, g = _best_split(rng.permutation(y), min_seg)
        hits += g >= gain
    p = (hits + 1) / (n_boot + 1)
    return {
        "year": int(t[k]),
        "before": float(y[:k].mean()),
        "after": float(y[k:].mean()),
        "shift": float(y[k:].mean() - y[:k].mean()),
        "p": float(p),
    }


def all_changepoints(winters: pd.DataFrame, metrics: tuple[str, ...] = ("season_days_30cm", "t_mean_winter", "thermal_winter_length")) -> pd.DataFrame:
    rows = []
    for resort, g in winters.groupby("resort"):
        for m in metrics:
            if m in g:
                r = changepoint(g[m], g["winter"])
                r.update(resort=resort, metric=m)
                rows.append(r)
    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# Periodjämförelse (1961-1990 mot 1991-2020)
# ---------------------------------------------------------------------------


def period_comparison(winters: pd.DataFrame, metrics: tuple[str, ...] = TREND_METRICS) -> pd.DataFrame:
    a0, a1 = PERIODS["past"]
    b0, b1 = PERIODS["present"]
    rows = []
    for resort, g in winters.groupby("resort"):
        past = g[(g["winter"] >= a0) & (g["winter"] <= a1)]
        pres = g[(g["winter"] >= b0) & (g["winter"] <= b1)]
        for m in metrics:
            if m not in g:
                continue
            x, y = past[m].dropna(), pres[m].dropna()
            if len(x) < 5 or len(y) < 5:
                continue
            welch = stats.ttest_ind(x, y, equal_var=False)
            mw = stats.mannwhitneyu(x, y, alternative="two-sided")
            rows.append(
                {
                    "resort": resort, "metric": m,
                    "past_mean": float(x.mean()), "present_mean": float(y.mean()),
                    "diff": float(y.mean() - x.mean()), "n_past": len(x), "n_present": len(y),
                    "welch_p": float(welch.pvalue), "mannwhitney_p": float(mw.pvalue),
                }
            )
    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# 3. Känslighet
# ---------------------------------------------------------------------------


def season_sensitivity(winters: pd.DataFrame, target: str = "season_days_30cm") -> pd.DataFrame:
    """Säsongsdagar per °C vintertemperatur (och per 100 mm nederbörd), per ort.

    OLS med två prediktorer. Koefficienten på temperatur är den siffra alla
    egentligen vill ha: "en grad varmare = så här många dagar kortare".
    """
    import statsmodels.api as sm

    rows = []
    for resort, g in winters.groupby("resort"):
        d = g[[target, "t_mean_winter", "precip_total"]].dropna()
        if len(d) < 15:
            continue
        X = sm.add_constant(np.column_stack([d["t_mean_winter"], d["precip_total"] / 100.0]))
        fit = sm.OLS(d[target].to_numpy(), X).fit(cov_type="HAC", cov_kwds={"maxlags": 2})
        rows.append(
            {
                "resort": resort, "target": target, "n": len(d),
                "days_per_degC": float(fit.params[1]), "days_per_degC_se": float(fit.bse[1]), "p_temp": float(fit.pvalues[1]),
                "days_per_100mm": float(fit.params[2]), "p_precip": float(fit.pvalues[2]),
                "r2": float(fit.rsquared),
            }
        )
    return pd.DataFrame(rows)


def global_coupling(winters: pd.DataFrame, gistemp: pd.DataFrame | None) -> pd.DataFrame:
    """Lokal vintertemperatur mot global anomali: lutning = förstärkningsfaktor.

    Skandinaviska vintrar värms ungefär dubbelt så fort som globen. Om vi
    får ~2 här är det ett tecken på att datat inte är trasigt.
    """
    if gistemp is None or gistemp.empty:
        return pd.DataFrame()
    import statsmodels.api as sm

    rows = []
    for resort, g in winters.groupby("resort"):
        d = g.merge(gistemp, left_on="winter", right_on="year", how="inner")
        d = d[["t_mean_winter", "global_anom_djf", "season_days_30cm"]].dropna()
        if len(d) < 15:
            continue
        X = sm.add_constant(d["global_anom_djf"].to_numpy())
        f_t = sm.OLS(d["t_mean_winter"].to_numpy(), X).fit(cov_type="HAC", cov_kwds={"maxlags": 2})
        f_s = sm.OLS(d["season_days_30cm"].to_numpy(), X).fit(cov_type="HAC", cov_kwds={"maxlags": 2})
        rows.append(
            {
                "resort": resort, "n": len(d),
                "local_degC_per_global_degC": float(f_t.params[1]), "se": float(f_t.bse[1]), "p": float(f_t.pvalues[1]), "r2_temp": float(f_t.rsquared),
                "season_days_per_global_degC": float(f_s.params[1]), "p_season": float(f_s.pvalues[1]), "r2_season": float(f_s.rsquared),
            }
        )
    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# 4. Projektion
# ---------------------------------------------------------------------------

#: prediktorer som finns både i observerade vintrar och i CMIP6-vintrar
PROJECTION_FEATURES = (
    "t_mean_winter",
    "t_mean_nov_apr",
    "frost_days",
    "thaw_days_core",
    "snowmaking_days",
    "cold_sum",
    "warm_sum_core",
    "precip_total",
    "snowfall_mm_we",
)


def bias_correct(cmip6_winters: pd.DataFrame, obs_winters: pd.DataFrame, features: tuple[str, ...] = PROJECTION_FEATURES, ref: tuple[int, int] = PERIODS["present"]) -> pd.DataFrame:
    """Delta-korrigering per modell och ort: skjut varje modells fördelning så
    att medel och spridning matchar observationerna under referensperioden.

    Open-Meteo har redan biaskorrigerat mot ERA5, men ERA5:s gridruta är inte
    vår station. Ett andra lager är billigt och gör siffrorna jämförbara.
    Kvantilmappning vore finare; med 30 referensvintrar är det mest brus.
    """
    out = []
    a, b = ref
    for (resort, model), g in cmip6_winters.groupby(["resort", "model"]):
        g = g.copy()
        o = obs_winters[(obs_winters["resort"] == resort) & (obs_winters["winter"].between(a, b))]
        m = g[g["winter"].between(a, b)]
        if len(o) < 10 or len(m) < 10:
            out.append(g)
            continue
        for f in features:
            if f not in g or f not in o:
                continue
            o_mu, o_sd = o[f].mean(), o[f].std(ddof=1)
            m_mu, m_sd = m[f].mean(), m[f].std(ddof=1)
            scale = (o_sd / m_sd) if m_sd and np.isfinite(m_sd) and m_sd > 1e-9 else 1.0
            g[f] = o_mu + (g[f] - m_mu) * scale
            # räknade dagar kan inte bli negativa hur mycket vi än korrigerar
            if f.endswith("_days") or f.endswith("_sum") or f in ("precip_total", "snowfall_mm_we"):
                g[f] = g[f].clip(lower=0)
        out.append(g)
    return pd.concat(out, ignore_index=True)


@dataclass
class ProjectionModel:
    resort: str
    target: str
    cv_mae_gbr: float
    cv_mae_linear: float
    cv_mae_climatology: float
    chosen: str
    n_train: int


def _cv_mae(model_factory, X: np.ndarray, y: np.ndarray, n_splits: int = 5) -> float:
    from sklearn.model_selection import TimeSeriesSplit

    tss = TimeSeriesSplit(n_splits=n_splits)
    errs = []
    for tr, te in tss.split(X):
        m = model_factory()
        m.fit(X[tr], y[tr])
        errs.append(np.abs(m.predict(X[te]) - y[te]).mean())
    return float(np.mean(errs))


def fit_projection(
    obs_winters: pd.DataFrame,
    cmip6_winters: pd.DataFrame,
    target: str = "season_days_30cm",
    features: tuple[str, ...] = PROJECTION_FEATURES,
    seed: int = 0,
) -> tuple[pd.DataFrame, list[ProjectionModel]]:
    """Tränar per ort, väljer den modell som vinner tidsserie-CV, och kör den
    på varje CMIP6-modells vintrar. Returnerar (projektioner, modellsammanfattning).

    Kandidater:
      * HistGradientBoosting (icke-linjär, hanterar trösklar i snö bra)
      * Ridge (linjär, tråkig, svårslagen på 60 datapunkter)
      * klimatologi (medelvärdet – om vi inte slår den ska vi skämmas)

    Osäkerhet: kvantil-GBR för p10/p50/p90 ovanpå vinnaren, plus spridningen
    mellan de sju klimatmodellerna. Den senare är oftast större.
    """
    from sklearn.ensemble import GradientBoostingRegressor, HistGradientBoostingRegressor
    from sklearn.linear_model import Ridge
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler

    feats = [f for f in features if f in obs_winters and f in cmip6_winters]
    projections, summaries = [], []

    for resort, g in obs_winters.groupby("resort"):
        d = g[[*feats, target, "winter"]].dropna().sort_values("winter")
        if len(d) < 20:
            log.warning("%s: bara %d vintrar, hoppar projektion", resort, len(d))
            continue
        X, y = d[feats].to_numpy(dtype=float), d[target].to_numpy(dtype=float)

        gbr_factory = lambda: HistGradientBoostingRegressor(  # noqa: E731
            max_depth=3, learning_rate=0.05, max_iter=300, min_samples_leaf=5, l2_regularization=1.0, random_state=seed
        )
        lin_factory = lambda: make_pipeline(StandardScaler(), Ridge(alpha=1.0))  # noqa: E731

        class _Clim:
            def fit(self, X, y):
                self.mu = y.mean()
                return self

            def predict(self, X):
                return np.full(len(X), self.mu)

        mae = {
            "gbr": _cv_mae(gbr_factory, X, y),
            "linear": _cv_mae(lin_factory, X, y),
            "climatology": _cv_mae(_Clim, X, y),
        }
        chosen = min(("gbr", "linear"), key=mae.get)
        if mae[chosen] >= mae["climatology"]:
            log.warning("%s: ingen modell slår klimatologin (MAE %.1f). Säsongsprojektionen är värdelös här.", resort, mae["climatology"])
        summaries.append(ProjectionModel(resort, target, mae["gbr"], mae["linear"], mae["climatology"], chosen, len(d)))

        point = (gbr_factory() if chosen == "gbr" else lin_factory()).fit(X, y)
        quantiles = {}
        for q in (0.1, 0.5, 0.9):
            quantiles[q] = GradientBoostingRegressor(
                loss="quantile", alpha=q, n_estimators=300, max_depth=2, learning_rate=0.05, min_samples_leaf=5, random_state=seed
            ).fit(X, y)

        c = cmip6_winters[cmip6_winters["resort"] == resort].dropna(subset=feats)
        if c.empty:
            continue
        Xc = c[feats].to_numpy(dtype=float)
        pred = c[["resort", "model", "winter"]].copy()
        pred["pred"] = np.clip(point.predict(Xc), 0, None)
        for q, m in quantiles.items():
            pred[f"p{int(q * 100)}"] = np.clip(m.predict(Xc), 0, None)
        pred["target"] = target
        projections.append(pred)

    return (pd.concat(projections, ignore_index=True) if projections else pd.DataFrame()), summaries


def summarise_projection(proj: pd.DataFrame, reliable_days: int = 100) -> pd.DataFrame:
    """Per ort och decennium: ensemblemedian, spridning mellan modeller, och
    andelen modellvintrar som klarar 100-dagarsregeln."""
    if proj.empty:
        return proj
    p = proj.copy()
    p["decade"] = (p["winter"] // 10) * 10
    rows = []
    for (resort, dec), g in p.groupby(["resort", "decade"]):
        per_model = g.groupby("model")["pred"].mean()
        rows.append(
            {
                "resort": resort, "decade": int(dec), "n_models": int(per_model.size),
                "median": float(per_model.median()), "min_model": float(per_model.min()), "max_model": float(per_model.max()),
                "p10": float(g["p10"].mean()), "p90": float(g["p90"].mean()),
                "share_reliable": float((g["pred"] >= reliable_days).mean()),
            }
        )
    return pd.DataFrame(rows)


def first_unreliable_decade(summary: pd.DataFrame, threshold: float = 0.5, from_decade: int = 2020) -> pd.DataFrame:
    """Första decenniet från ``from_decade`` där under hälften av modellvintrarna
    klarar 100 dagar. ``already`` säger om orten redan låg under vid startdecenniet –
    då är frågan inte "när" utan "sedan när", och den svarar observationerna på."""
    rows = []
    for resort, g in summary.groupby("resort"):
        g = g[g["decade"] >= from_decade].sort_values("decade")
        hit = g[g["share_reliable"] < threshold]
        first = int(hit["decade"].iloc[0]) if not hit.empty else None
        rows.append({"resort": resort, "first_unreliable_decade": first, "already": bool(first == from_decade)})
    return pd.DataFrame(rows)
