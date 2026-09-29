"""Analog days: past evenings whose conditions looked most like this one.

What happened next on those nights is a hint about tonight, and when the
analogs disagree with each other the forecast is less certain.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

ANALOG_FEATURES = [
    'temp', 'dew_depression', 'wind', 'pressure', 'pressure_change_3h',
    'clearness_6h', 'rh', 'rain_24h', 'doy_sin', 'doy_cos',
]
# Season counts double: a calm clear night in May is not a calm clear night in January.
WEIGHTS = {'doy_sin': 2.0, 'doy_cos': 2.0}


def _scaled(table: pd.DataFrame) -> pd.DataFrame:
    x = table[ANALOG_FEATURES].astype(float)
    spread = x.std().replace(0, 1).fillna(1)
    scaled = (x - x.mean()) / spread
    for col, w in WEIGHTS.items():
        scaled[col] *= w
    return scaled


def find_analogs(evenings: pd.DataFrame, date: str, count: int = 5, exclude_days: int = 3,
                 query: pd.Series | None = None) -> pd.DataFrame:
    """The `count` most similar earlier evenings to `date` (or to `query`).

    Only evenings before `date` minus `exclude_days` are searched, as they
    would have been at the time, and only evenings whose night is known.
    """
    table = evenings.copy()
    if query is not None:
        table.loc[date, ANALOG_FEATURES] = query[ANALOG_FEATURES].to_numpy(dtype=float)
    scaled = _scaled(table)
    target = scaled.loc[date].to_numpy(dtype=float)

    cutoff = (pd.Timestamp(date) - pd.Timedelta(days=exclude_days)).strftime('%Y-%m-%d')
    candidates = table[(table.index < cutoff) & table['night_min'].notna()].index
    if len(candidates) == 0:
        return table.iloc[0:0].assign(distance=[])
    diffs = scaled.loc[candidates].to_numpy(dtype=float) - target
    usable = ~np.isnan(diffs)
    # Mean squared difference over the inputs both evenings have.
    distance = np.sqrt(np.where(usable, diffs ** 2, 0).sum(axis=1) / np.maximum(usable.sum(axis=1), 1))
    distance[usable.sum(axis=1) < len(ANALOG_FEATURES) // 2] = np.inf
    order = np.argsort(distance)[:count]
    picked = table.loc[candidates[order]].copy()
    picked['distance'] = distance[order]
    return picked[np.isfinite(picked['distance'])]
