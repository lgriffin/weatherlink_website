"""The two "dumb" forecasts every model has to beat.

- Climatology: "it will be a normal day for the date", from the training years only.
- Persistence: "later will be the same as now".
"""

from __future__ import annotations

import numpy as np


def seasonal_mean(
    train_doy: np.ndarray,
    train_values: np.ndarray,
    query_doy: np.ndarray,
    window: int = 15,
    train_group: np.ndarray | None = None,
    query_group: np.ndarray | None = None,
) -> np.ndarray:
    """Mean of `train_values` within ±window days of each query day of year.

    With groups (for example the hour of day), only matching groups are averaged.
    Falls back to the overall mean where a window has no data.
    """
    train_doy = np.asarray(train_doy)
    values = np.asarray(train_values, dtype=float)
    keep = ~np.isnan(values)
    train_doy, values = train_doy[keep], values[keep]
    groups = None if train_group is None else np.asarray(train_group)[keep]
    overall = float(values.mean()) if len(values) else np.nan

    def table(mask: np.ndarray) -> np.ndarray:
        sums = np.zeros(367)
        counts = np.zeros(367)
        np.add.at(sums, train_doy[mask], values[mask])
        np.add.at(counts, train_doy[mask], 1)
        # Circular ±window smoothing over days 1..366.
        s, c = sums[1:], counts[1:]
        offsets = range(-window, window + 1)
        ss = sum(np.roll(s, k) for k in offsets)
        cc = sum(np.roll(c, k) for k in offsets)
        with np.errstate(invalid='ignore', divide='ignore'):
            out = np.where(cc > 0, ss / cc, overall)
        return np.concatenate([[overall], out])

    query_doy = np.asarray(query_doy)
    if groups is None:
        return table(np.ones(len(values), bool))[query_doy]

    result = np.full(len(query_doy), overall)
    query_group = np.asarray(query_group)
    for g in np.unique(query_group):
        lookup = table(groups == g)
        sel = query_group == g
        result[sel] = lookup[query_doy[sel]]
    return result


def conditional_rate(train_flag: np.ndarray, train_outcome: np.ndarray, query_flag: np.ndarray) -> np.ndarray:
    """P(outcome) given a yes/no condition, learned from training rows."""
    train_flag = np.asarray(train_flag, bool)
    outcome = np.asarray(train_outcome, float)
    rates = {}
    for flag in (False, True):
        sel = train_flag == flag
        rates[flag] = float(outcome[sel].mean()) if sel.any() else float(outcome.mean())
    return np.where(np.asarray(query_flag, bool), rates[True], rates[False])


def brier(prob: np.ndarray, outcome: np.ndarray) -> float:
    return float(np.mean((np.asarray(prob, float) - np.asarray(outcome, float)) ** 2))


def mae(pred: np.ndarray, actual: np.ndarray) -> float:
    return float(np.mean(np.abs(np.asarray(pred, float) - np.asarray(actual, float))))


def skill(score: float, baseline: float) -> float | None:
    """1 − score/baseline: above 0 means better than the baseline."""
    if baseline == 0 or np.isnan(baseline):
        return None
    return round(1 - score / baseline, 3)


def reliability(prob: np.ndarray, outcome: np.ndarray, bins: int = 10) -> list[dict]:
    """When the model says 70%, does it happen about 70% of the time?"""
    prob = np.asarray(prob, float)
    outcome = np.asarray(outcome, float)
    edges = np.linspace(0, 1, bins + 1)
    which = np.clip(np.digitize(prob, edges) - 1, 0, bins - 1)
    rows = []
    for b in range(bins):
        sel = which == b
        if sel.any():
            rows.append({
                'forecast': f'{edges[b]:.0%}–{edges[b + 1]:.0%}',
                'mean_forecast': round(float(prob[sel].mean()), 3),
                'observed': round(float(outcome[sel].mean()), 3),
                'count': int(sel.sum()),
            })
    return rows

