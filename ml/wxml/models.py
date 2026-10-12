"""Train the numeric models, score them against the baselines on the most
recent data, and save them.

Evaluation is always "train on the past, test on the future": the test period
is the last 12 months (or the last quarter of the data if there's less than
two years), and nothing from it is used for training or for the baselines.
After scoring, each model is refitted on all the data and saved for use.

When the tables carry guidance (what the big weather models said, as issued;
see wxml.forecasting.mos), every task is trained a second time with it as
extra inputs, on the days that have it, together with what the neighbours
(Met Éireann stations, the Atlantic buoys) were reading where known. That version is scored on the same
held-out days against the station-only model and against the raw guidance,
and is used for forecasts only if it beat the station-only model.
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
from .forecasting.mos import GUIDANCE_EVENING, GUIDANCE_HOURLY
from .forecasting.neighbours import NEIGHBOUR_FEATURES

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
    guided: bool = False

    @property
    def base(self) -> str:
        """The task this is a version of: 'night_min' for 'night_min+guidance'."""
        return self.name.removesuffix(GUIDED)


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

GUIDED = '+guidance'

# The raw guidance each task can be compared with; a row "has guidance" when it is known.
RAW_GUIDANCE = {
    'night_min': 'g_night_min',
    'day_max': 'g_day_max',
    'rain_next_24h': 'g_wet_24h_share',
    'rain_next_6h': 'g_wet_6h_share',
    'temp_next_24h': 'g_temp_24h',
}


def with_guidance(task: Task) -> Task:
    extra = (GUIDANCE_EVENING if task.table == 'evening' else GUIDANCE_HOURLY) + NEIGHBOUR_FEATURES
    return Task(task.name + GUIDED, task.table, task.target, task.kind, task.features + extra,
                description=task.description + ', with weather-model guidance', guided=True)


GUIDED_TASKS = [with_guidance(t) for t in TASKS]
TASKS_BY_NAME = {t.name: t for t in TASKS + GUIDED_TASKS}

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


def inputs(task: Task, frame: pd.DataFrame) -> pd.DataFrame:
    """The task's input columns; any the table lacks (no neighbours today, say) are empty."""
    return frame.reindex(columns=task.features).astype(float)


def predict(task: Task, booster: lgb.Booster, x: pd.DataFrame) -> np.ndarray:
    return booster.predict(inputs(task, x))


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
        booster = fit(task, inputs(task, train), train[task.target])
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
    out = _simple_baselines(task, train, test)
    if task.guided:
        out['guidance'] = test[RAW_GUIDANCE[task.base]].to_numpy(dtype=float)
    return out


def _simple_baselines(task: Task, train: pd.DataFrame, test: pd.DataFrame) -> dict[str, np.ndarray]:
    y = task.target
    if task.base == 'temp_next_24h':
        return {
            'persistence': test['temp'].to_numpy(),
            'climatology': bl.seasonal_mean(train['doy'], train[y], test['doy'],
                                            train_group=train['hour'], query_group=test['hour']),
        }
    if task.base == 'rain_next_6h':
        return {
            'persistence': bl.conditional_rate(train['rain'] > 0, train[y], test['rain'].fillna(0) > 0),
            'climatology': bl.seasonal_mean(train['doy'], train[y], test['doy']),
        }
    clim = bl.seasonal_mean(train['doy'], train[y], test['doy'])
    if task.base == 'rain_next_24h':
        wet_today = test['rain_24h'].fillna(0) >= 0.2
        return {'climatology': clim,
                'persistence': bl.conditional_rate(train['rain_24h'].fillna(0) >= 0.2, train[y], wet_today)}
    # Night low: last night's low. Day high: today's high so far.
    same = test['prev_night_min'] if task.base == NIGHT_TASK else test['temp_max_24h']
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


@dataclass
class Evaluation:
    result: dict
    booster: lgb.Booster            # fitted on the training period only
    train_residuals: np.ndarray | None = None  # night low: out-of-fold misses on the training period


Extra = Callable[[pd.DataFrame], dict[str, np.ndarray]]


def guidance_rows(task: Task, table: pd.DataFrame) -> pd.DataFrame:
    """Rows with a known outcome and, for a guided task, the guidance it needs."""
    rows = table[table[task.target].notna()]
    if task.guided:
        key = RAW_GUIDANCE[task.base]
        rows = rows[rows[key].notna()] if key in rows else rows.iloc[0:0]
    return rows


def evaluate(task: Task, table: pd.DataFrame, test_from: pd.Timestamp, extra: Extra | None = None,
             extra_frost: Extra | None = None) -> Evaluation:
    """Train before `test_from`, score from it. `extra` adds baselines for the test rows
    (the station-only model's forecasts, for a guided task); `extra_frost` does the same for frost."""
    rows = guidance_rows(task, table)
    dates = row_dates(rows)
    train, test = rows[dates < test_from], rows[dates >= test_from]
    if len(train) < MIN_TRAIN_ROWS or len(test) < MIN_TEST_ROWS:
        raise ValueError(
            f'not enough data (train {len(train)} rows, test {len(test)}); '
            f'need at least {MIN_TRAIN_ROWS} and {MIN_TEST_ROWS}')
    if task.kind == 'binary' and train[task.target].nunique() < 2:
        raise ValueError('the training period never saw both outcomes')

    booster = fit(task, inputs(task, train), train[task.target])
    pred = predict(task, booster, test)
    actual = test[task.target].to_numpy()
    baselines = baselines_for(task, train, test)
    if extra:
        baselines.update(extra(test))
    result: dict = {
        'description': task.description,
        'train_rows': len(train), 'test_rows': len(test),
        'train_from': str(dates.min().date()), 'test_from': str(test_from.date()),
        'test_to': str(dates.max().date()),
        **_score(task.kind, pred, actual, baselines),
    }
    gains = booster.feature_importance('gain')
    total = float(gains.sum()) or 1.0
    top = sorted(zip(task.features, gains), key=lambda p: -p[1])[:8]
    result['top_inputs'] = [{'input': n, 'share': round(float(g) / total, 3)} for n, g in top]

    train_residuals = None
    if task.base == NIGHT_TASK:
        # The frost chance and range, scored on the same held-out nights.
        train_residuals = train[task.target].to_numpy() - out_of_fold(task, train)
        train_residuals = train_residuals[~np.isnan(train_residuals)]
        outlook = night_outlook(pred, train_residuals)
        frost = (actual <= 0).astype(float)
        clim = bl.seasonal_mean(train['doy'], (train[task.target] <= 0).astype(float), test['doy'])
        prev = test['prev_night_min']
        persistence = np.where(prev.isna(), clim, (prev <= 0).astype(float))
        frost_baselines = {'climatology': clim, 'persistence': persistence}
        if extra_frost:
            frost_baselines.update(extra_frost(test))
        result['frost_tonight'] = {
            'description': 'Chance of an air frost (≤ 0 °C) between 18:00 and 09:00',
            'frost_nights_in_test': int(frost.sum()),
            'frost_nights_in_training': int((train[task.target] <= 0).sum()),
            **_score('binary', outlook['frost_chance'], frost, frost_baselines),
        }
        # Summer nights are easy "no frost" calls for everyone, so also score the frost season alone.
        season = pd.to_datetime(test.index).month.isin(FROST_SEASON_MONTHS)
        if season.any() and frost[season].sum() > 0:
            result['frost_tonight']['frost_season_only'] = _score(
                'binary', outlook['frost_chance'][season], frost[season],
                {k: v[season] for k, v in frost_baselines.items()})
        result['range_10_90'] = {
            'share_below_p10': round(float(np.mean(actual < outlook['p10'])), 3),
            'share_above_p90': round(float(np.mean(actual > outlook['p90'])), 3),
            'aim': 0.1,
        }
    return Evaluation(result, booster, train_residuals)


def _station_only(task: Task, ev: Evaluation) -> tuple[Extra, Extra | None]:
    """Baselines from the station-only model, for scoring its guided version on the same rows."""
    def numbers(test):
        return {'station_only': predict(task, ev.booster, test)}
    if task.name != NIGHT_TASK or ev.train_residuals is None:
        return numbers, None

    def frost(test):
        return {'station_only': night_outlook(predict(task, ev.booster, test), ev.train_residuals)['frost_chance']}
    return numbers, frost


def _save(task: Task, rows: pd.DataFrame, rounds: int, models_dir: Path) -> dict:
    final = fit(task, inputs(task, rows), rows[task.target], rounds=rounds)
    final.save_model(str(models_dir / f'{task.name}.txt'))
    entry = {'target': task.target, 'kind': task.kind, 'table': task.table,
             'features': task.features, 'description': task.description}
    if task.base == NIGHT_TASK:
        residuals = rows[task.target].to_numpy() - out_of_fold(task, rows)
        entry['residuals'] = [round(float(r), 3) for r in residuals[~np.isnan(residuals)]]
    return entry


def train_all(tables: dict[str, pd.DataFrame], out_dir: Path, test_from: str | None = None,
              log: Callable[[str], None] = print) -> dict:
    models_dir = out_dir / 'models'
    models_dir.mkdir(parents=True, exist_ok=True)
    for old in models_dir.glob(f'*{GUIDED}.txt'):
        old.unlink()  # a guided model from an earlier run must not outlive its manifest entry
    report: dict = {'tasks': {}}
    manifest: dict = {}
    for task in TASKS:
        table = tables[task.table]
        rows = table[table[task.target].notna()]
        try:
            if rows.empty:
                raise ValueError('no rows with a known outcome')
            cut = split_date(row_dates(rows), test_from)
            ev = evaluate(task, table, cut)
        except ValueError as err:
            log(f'skip {task.name}: {err}')
            report['tasks'][task.name] = {'skipped': str(err)}
            continue
        result = ev.result
        manifest[task.name] = _save(task, rows, ev.booster.current_iteration(), models_dir)
        result['trained_through'] = str(row_dates(rows).max().date())
        report['tasks'][task.name] = result
        for line in summary_lines(task, result):
            log(line)

        if RAW_GUIDANCE[task.name] not in table:
            continue
        guided = with_guidance(task)
        try:
            numbers, frost = _station_only(task, ev)
            gev = evaluate(guided, table, cut, extra=numbers, extra_frost=frost)
        except ValueError as err:
            log(f'skip {guided.name}: {err}')
            report['tasks'][guided.name] = {'skipped': str(err)}
            continue
        g_rows = guidance_rows(guided, table)
        entry = _save(guided, g_rows, gev.booster.current_iteration(), models_dir)
        skill = gev.result['skill'].get('vs_station_only')
        # Used for forecasts only when it beat the station-only model on the held-out days.
        entry['use'] = skill is not None and skill > 0
        manifest[guided.name] = entry
        gev.result['trained_through'] = str(row_dates(g_rows).max().date())
        gev.result['used_for_forecasts'] = entry['use']
        report['tasks'][guided.name] = gev.result
        for line in summary_lines(guided, gev.result):
            log(line)
    (out_dir / 'metrics.json').write_text(json.dumps(report, indent=2, ensure_ascii=False))
    (models_dir / 'manifest.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False))
    return report


def _describe(name: str, r: dict) -> str:
    metric = 'brier' if 'brier' in r else 'mae'
    label = 'Brier' if metric == 'brier' else 'MAE'
    fmt = '.3f' if metric == 'brier' else '.2f'
    parts = [f"{name}: {label} {r[metric]['model']:{fmt}}"]
    for base in ('station_only', 'guidance', 'climatology', 'persistence'):
        if base in r[metric]:
            parts.append(f"{base.replace('_', '-')} {r[metric][base]:{fmt}} (skill {r['skill'][f'vs_{base}']})")
    return ', '.join(parts)


def summary_lines(task: Task, r: dict) -> list[str]:
    lines = [f"{_describe(task.name, r)} on {r['test_rows']} test rows from {r['test_from']}"]
    if 'frost_tonight' in r:
        f = r['frost_tonight']
        lines.append(f"{_describe('frost_tonight', f)}; {f['frost_nights_in_test']} frost nights in test")
        if 'frost_season_only' in f:
            lines.append(_describe('frost_tonight (Oct-Apr only)', f['frost_season_only']))
        rng = r['range_10_90']
        lines.append(f"{task.name} range: {rng['share_below_p10']:.0%} below p10, "
                     f"{rng['share_above_p90']:.0%} above p90 (aim 10% each)")
    return lines


def load_models(models_dir: Path) -> tuple[dict[str, lgb.Booster], dict]:
    manifest = json.loads((models_dir / 'manifest.json').read_text())
    boosters = {name: lgb.Booster(model_file=str(models_dir / f'{name}.txt'))
                for name in manifest if (models_dir / f'{name}.txt').exists()}
    return boosters, manifest
