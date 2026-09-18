"""Läs och skriv datamängder. Parquet om pyarrow finns, annars gzippad CSV.

Colab och Fabric har båda pyarrow. En naken Python på en Windowsburk kanske
inte har det, och då ska pipelinen ändå funka.
"""

from __future__ import annotations

import logging
from pathlib import Path

import pandas as pd

log = logging.getLogger(__name__)

try:
    import pyarrow  # noqa: F401

    _HAVE_PARQUET = True
except ImportError:  # pragma: no cover
    _HAVE_PARQUET = False


def save(df: pd.DataFrame, path: Path) -> Path:
    """Sparar och returnerar den faktiska sökvägen (ändelsen kan bytas)."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    if _HAVE_PARQUET:
        target = path.with_suffix(".parquet")
        df.to_parquet(target, index=False)
    else:
        target = path.with_suffix(".csv.gz")
        df.to_csv(target, index=False, compression="gzip")
    log.info("Sparade %d rader -> %s", len(df), target)
    return target


def load(path: Path) -> pd.DataFrame | None:
    """Hittar filen oavsett vilken ändelse ``save`` råkade välja."""
    path = Path(path)
    for cand in (path.with_suffix(".parquet"), path.with_suffix(".csv.gz"), path):
        if cand.exists():
            if cand.suffix == ".parquet":
                return pd.read_parquet(cand)
            df = pd.read_csv(cand)
            for col in ("date", "first_obs", "last_obs"):
                if col in df.columns:
                    df[col] = pd.to_datetime(df[col])
            return df
    return None
