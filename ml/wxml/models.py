"""Train the numeric models, score them against the baselines on the most
recent data, and save them.

Evaluation is always "train on the past, test on the future": the test period
is the last 12 months (or the last quarter of the data if there's less than
two years), and nothing from it is used for training or for the baselines.
After scoring, each model is refitted on all the data and saved for use.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

import lightgbm as lgb
import numpy as np
import pandas as pd

from . import baselines as bl
from .features import FEATURES, PREVIOUS_NIGHT_FEATURES

MIN_TRAIN_ROWS = 200
MIN_TEST_ROWS = 30


@dataclass(frozen=True)
class Task:
    name: str
    table: str          # 'evening' (one row per day at 18:00) or 'hourly'
    target: str
    kind: str           # 'binary' or 'regression'
    features: list[str]
    description: str = ''


TASKS = [
    Task('night_min', 'evening', 'night_min', 'regression', PREVIOUS_NIGHT_FEATURES,
         description='Lowest temperature between 18:00 and 09:00 (°C)'),
    Task('day_max', 'evening', 'day_max', 'regression', PREVIOUS_NIGHT_FEATURES,
         description="Tomorrow's highest temperature between 09:00 and 18:00 (°C)"),
    Task('rain_next_24h', 'evening', 'wet_next_24h', 'binary', PREVIOUS_NIGHT_FEATURES,
         description='Chance of 0.2 mm or more of rain between 18:00 and 18:00 tomorrow'),
    Task('rain_next_6h', 'hourly', 'wet_next_6h', 'binary', FEATURES,
         description='Chance of 0.2 mm or more of rain in the next 6 hours'),
    Task('temp_next_24h', 'hourly', 'temp_next_24h', 'regression', FEATURES,
         description='Temperature at the same hour tomorrow (°C)'),
]
TASKS_BY_NAME = {t.name: t for t in TASKS}

# Frost is rare (a few dozen nights a year at most), too few to train a yes/no
# model on. Instead the night-low model's typical misses turn its forecast into
# a range and a frost chance: if it says 1.5 °C and it has been 2 °C or more too
# warm on 20% of past nights, the chance of frost is about 20%.
NIGHT_TASK = 'night_min'
FROST_SEASON_MONTHS = (10, 11, 12, 1, 2, 3, 4)


def night_outlook(pred: np.ndarray, residuals: np.ndarray) -> dict[str, np.ndarray]:
    """Frost chance and a 10–90% range for each predicted night low."""
    r = np.asarray(residuals, float)
    pred = np.atleast_1d(np.asarray(pred, float))
    return {
        'frost_chance': (pred[:, None] + r[None, :] <= 0).mean(axis=1),
        'p10': pred + np.quantile(r, 0.1),
        'p90': pred + np.quantile(r, 0.9),
    }


def params_for(task: Task) -> dict:
    return {
        'objective': 'binary' if task.kind == 'binary' else 'regression_l1',
        'learning_rate': 0.03,
        'num_leaves': 15,
        'min_child_samples': 20,
        'feature_fraction': 0.9,
        'bagging_fraction': 0.9,
        'bagging_freq': 1,
        'lambda_l2': 1.0,
        'verbose': -1,
        'seed': 7,
        'deterministic': True,
    }


def fit(task: Task, x: pd.DataFrame, y: pd.Series, rounds: int | None = None) -> lgb.Booster:
    """Fit one model. Without `rounds`, the last 15% of rows (by time) pick the round count."""
    params = params_for(task)
    if rounds is None:
        cut = int(len(x) * 0.85)
        train = lgb.Dataset(x.iloc[:cut], y.iloc[:cut])
        valid = lgb.Dataset(x.iloc[cut:], y.iloc[cut:], reference=train)
        booster = lgb.train(params, train, num_boost_round=1500, valid_sets=[valid],
                            callbacks=[lgb.early_stopping(100, verbose=False)])
        rounds = max(booster.best_iteration, 20)
    return lgb.train(params, lgb.Dataset(x, y), num_boost_round=rounds)


def predict(task: Task, booster: lgb.Booster, x: pd.DataFrame) -> np.ndarray:
    return booster.predict(x[task.features])


def out_of_fold(task: Task, rows: pd.DataFrame, folds: int = 5) -> np.ndarray:
    """Predictions for every row from a model that never saw that row's block of time.

    Gives honest misses (for the frost range) and realistic, imperfect numbers
    for the language-model training set.
    """
    rows = rows[rows[task.target].notna()]
    out = np.full(len(rows), np.nan)
    for block in np.array_split(np.arange(len(rows)), folds):
        rest = np.setdiff1d(np.arange(len(rows)), block)
        train = rows.iloc[rest]
        if task.kind == 'binary' and train[task.target].nunique() < 2:
            continue
        booster = fit(task, train[task.features], train[task.target])
        out[block] = predict(task, booster, rows.iloc[block])
    return out


def split_date(dates: pd.Series, test_from: str | None = None) -> pd.Timestamp:
    if test_from:
        return pd.Timestamp(test_from)
    first, last = dates.min(), dates.max()
    if (last - first).days >= 730:
        return (last - pd.DateOffset(years=1) + pd.Timedelta(days=1)).normalize()
    return pd.Timestamp(int(np.quantile(dates.values.astype('int64'), 0.75))).normalize()


def row_dates(frame: pd.DataFrame) -> pd.Series:
    """Local calendar date of each row, as a Timestamp."""
    if 'local' in frame:
        return pd.to_datetime(frame['local'].dt.strftime('%Y-%m-%d')).set_axis(frame.index)
    return pd.Series(pd.to_datetime(frame.index), index=frame.index)


def baselines_for(task: Task, train: pd.DataFrame, test: pd.DataFrame) -> dict[str, np.ndarray]:
    """Baseline forecasts for the test rows, fitted on training rows only."""
    y = task.target
    if task.name == 'temp_next_24h':
        return {
            'persistence': test['temp'].to_numpy(),
            'climatology': bl.seasonal_mean(train['doy'], train[y], test['doy'],
                                            train_group=train['hour'], query_group=test['hour']),
        }
    if task.name == 'rain_next_6h':
        return {
            'persistence': bl.conditional_rate(train['rain'] > 0, train[y], test['rain'].fillna(0) > 0),
            'climatology': bl.seasonal_mean(train['doy'], train[y], test['doy']),
        }
    clim = bl.seasonal_mean(train['doy'], train[y], test['doy'])
    if task.name == 'rain_next_24h':
        wet_today = test['rain_24h'].fillna(0) >= 0.2
        return {'climatology': clim,
                'persistence': bl.conditional_rate(train['rain_24h'].fillna(0) >= 0.2, train[y], wet_today)}
    # Night low: last night's low. Day high: today's high so far.
    same = test['prev_night_min'] if task.name == NIGHT_TASK else test['temp_max_24h']
    return {'climatology': clim, 'persistence': same.fillna(pd.Series(clim, index=test.index)).to_numpy()}


def _score(kind: str, pred: np.ndarray, actual: np.ndarray, baselines: dict[str, np.ndarray]) -> dict:
    score, metric = (bl.brier, 'brier') if kind == 'binary' else (bl.mae, 'mae')
    model = score(pred, actual)
    out = {metric: {'model': round(model, 4)}, 'skill': {}}
    for name, base in baselines.items():
        s = score(base, actual)
        out[metric][name] = round(s, 4)
        out['skill'][f'vs_{name}'] = bl.skill(model, s)
    if kind == 'binary':
        out['observed_rate'] = round(float(np.mean(actual)), 3)
        out['reliability'] = bl.reliability(pred, actual)
    return out


def evaluate(task: Task, table: pd.DataFrame, test_from: pd.Timestamp) -> tuple[dict, int, np.ndarray | None]:
    rows = table[table[task.target].notna()]
    dates = row_dates(rows)
    train, test = rows[dates < test_from], rows[dates >= test_from]
    if len(train) < MIN_TRAIN_ROWS or len(test) < MIN_TEST_ROWS:
        raise ValueError(
            f'not enough data (train {len(train)} rows, test {len(test)}); '
            f'need at least {MIN_TRAIN_ROWS} and {MIN_TEST_ROWS}')
    if task.kind == 'binary' and train[task.target].nunique() < 2:
        raise ValueError('the training period never saw both outcomes')

    booster = fit(task, train[task.features], train[task.target])
    pred = predict(task, booster, test)
    actual = test[task.target].to_numpy()
    result: dict = {
        'description': task.description,
        'train_rows': len(train), 'test_rows': len(test),
        'train_from': str(dates.min().date()), 'test_from': str(test_from.date()),
        'test_to': str(dates.max().date()),
        **_score(task.kind, pred, actual, baselines_for(task, train, test)),
    }
    gains = booster.feature_importance('gain')
    total = float(gains.sum()) or 1.0
    top = sorted(zip(task.features, gains), key=lambda p: -p[1])[:8]
    result['top_inputs'] = [{'input': n, 'share': round(float(g) / total, 3)} for n, g in top]

    test_residuals = None
    if task.name == NIGHT_TASK:
        # The frost chance and range, scored on the same held-out nights.
        train_residuals = train[task.target].to_numpy() - out_of_fold(task, train)
        outlook = night_outlook(pred, train_residuals[~np.isnan(train_residuals)])
        frost = (actual <= 0).astype(float)
        clim = bl.seasonal_mean(train['doy'], (train[task.target] <= 0).astype(float), test['doy'])
        prev = test['prev_night_min']
        persistence = np.where(prev.isna(), clim, (prev <= 0).astype(float))
        result['frost_tonight'] = {
            'description': 'Chance of an air frost (≤ 0 °C) between 18:00 and 09:00',
            'frost_nights_in_test': int(frost.sum()),
            'frost_nights_in_training': int((train[task.target] <= 0).sum()),
            **_score('binary', outlook['frost_chance'], frost,
                     {'climatology': clim, 'persistence': persistence}),
        }
        # Summer nights are easy "no frost" calls for everyone, so also score the frost season alone.
        season = pd.to_datetime(test.index).month.isin(FROST_SEASON_MONTHS)
        if season.any() and frost[season].sum() > 0:
            result['frost_tonight']['frost_season_only'] = _score(
                'binary', outlook['frost_chance'][season], frost[season],
                {'climatology': clim[season], 'persistence': persistence[season]})
        result['range_10_90'] = {
            'share_below_p10': round(float(np.mean(actual < outlook['p10'])), 3),
            'share_above_p90': round(float(np.mean(actual > outlook['p90'])), 3),
            'aim': 0.1,
        }
        test_residuals = actual - pred
    return result, booster.current_iteration(), test_residuals


def train_all(tables: dict[str, pd.DataFrame], out_dir: Path, test_from: str | None = None,
              log: Callable[[str], None] = print) -> dict:
    models_dir = out_dir / 'models'
    models_dir.mkdir(parents=True, exist_ok=True)
    report: dict = {'tasks': {}}
    manifest: dict = {}
    for task in TASKS:
        table = tables[task.table]
        rows = table[table[task.target].notna()]
        try:
            if rows.empty:
                raise ValueError('no rows with a known outcome')
            cut = split_date(row_dates(rows), test_from)
            result, rounds, _ = evaluate(task, table, cut)
        except ValueError as err:
            log(f'skip {task.name}: {err}')
            report['tasks'][task.name] = {'skipped': str(err)}
            continue
        final = fit(task, rows[task.features], rows[task.target], rounds=rounds)
        final.save_model(str(models_dir / f'{task.name}.txt'))
        result['trained_through'] = str(row_dates(rows).max().date())
        entry = {'target': task.target, 'kind': task.kind, 'table': task.table,
                 'features': task.features, 'description': task.description}
        if task.name == NIGHT_TASK:
            residuals = rows[task.target].to_numpy() - out_of_fold(task, rows)
            entry['residuals'] = [round(float(r), 3) for r in residuals[~np.isnan(residuals)]]
        manifest[task.name] = entry
        report['tasks'][task.name] = result
        for line in summary_lines(task, result):
            log(line)
    (out_dir / 'metrics.json').write_text(json.dumps(report, indent=2, ensure_ascii=False))
    (models_dir / 'manifest.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False))
    return report


def _describe(name: str, r: dict) -> str:
    metric = 'brier' if 'brier' in r else 'mae'
    label = 'Brier' if metric == 'brier' else 'MAE'
    fmt = '.3f' if metric == 'brier' else '.2f'
    parts = [f"{name}: {label} {r[metric]['model']:{fmt}}"]
    for base in ('climatology', 'persistence'):
        if base in r[metric]:
            parts.append(f"{base} {r[metric][base]:{fmt}} (skill {r['skill'][f'vs_{base}']})")
    return ', '.join(parts)


def summary_lines(task: Task, r: dict) -> list[str]:
    lines = [f"{_describe(task.name, r)} on {r['test_rows']} test rows from {r['test_from']}"]
    if 'frost_tonight' in r:
        f = r['frost_tonight']
        lines.append(f"{_describe('frost_tonight', f)}; {f['frost_nights_in_test']} frost nights in test")
        if 'frost_season_only' in f:
            lines.append(_describe('frost_tonight (Oct-Apr only)', f['frost_season_only']))
        rng = r['range_10_90']
        lines.append(f"night_min range: {rng['share_below_p10']:.0%} below p10, "
                     f"{rng['share_above_p90']:.0%} above p90 (aim 10% each)")
    return lines


def load_models(models_dir: Path) -> tuple[dict[str, lgb.Booster], dict]:
    manifest = json.loads((models_dir / 'manifest.json').read_text())
    boosters = {name: lgb.Booster(model_file=str(models_dir / f'{name}.txt'))
                for name in manifest if (models_dir / f'{name}.txt').exists()}
    return boosters, manifest
