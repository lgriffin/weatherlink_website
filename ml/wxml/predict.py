"""Run the saved models on the latest data and build tonight's brief."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from . import brief as br
from .analogs import find_analogs
from .data import load_hourly
from .features import build_features, evening_table
from .forecasting.mos import evening_by_model, evening_features, hourly_features
from .forecasting.neighbours import features as neighbour_features
from .models import GUIDED, RAW_GUIDANCE, TASKS_BY_NAME, load_models, night_outlook


def _one(booster, task_name: str, row: pd.Series) -> float:
    task = TASKS_BY_NAME[task_name]
    x = pd.DataFrame([row.reindex(task.features).astype(float).to_numpy()], columns=task.features)
    return float(booster.predict(x)[0])


def _pick(boosters: dict, manifest: dict, name: str, row: pd.Series) -> str | None:
    """The guided model when it earned its place and the row has guidance, else the station-only one."""
    guided = name + GUIDED
    key = RAW_GUIDANCE[name]
    if guided in boosters and manifest[guided].get('use') and pd.notna(row.get(key, np.nan)):
        return guided
    return name if name in boosters else None


def forecast(db_path: str | Path, models_dir: Path, station_id: str | None = None,
             date: str | None = None, guidance: pd.DataFrame | None = None,
             neighbours: pd.DataFrame | None = None, second_opinions: list[pd.DataFrame] = ()) -> dict:
    """Tonight's numbers and brief.

    `guidance` (one source and lead time, covering tonight and tomorrow) lets the
    guided models run where they beat the station-only ones; `neighbours`' recent
    readings add to them. `second_opinions` (other forecasts, such as Met
    Éireann's) are summarised next to the weather models but never feed a model.
    """
    station, hourly = load_hourly(db_path, station_id)
    features = build_features(hourly, station)
    evenings = evening_table(hourly, features, station)
    boosters, manifest = load_models(models_dir)
    if 'night_min' not in boosters:
        raise RuntimeError(f'No night_min model in {models_dir}; run `train` first.')
    if evenings.empty:
        raise RuntimeError('No evening (17:00–18:00) readings in the database yet.')

    date = date or evenings.index.max()
    if date not in evenings.index:
        raise LookupError(f'No 18:00 reading for {date}.')
    row = evenings.loc[date]
    has_guidance = guidance is not None and not guidance.empty
    if has_guidance:
        row = pd.concat([row, evening_features(guidance, pd.Index([date]), station.timezone).iloc[0],
                         hourly_features(guidance, pd.DatetimeIndex([row['issue_hour']])).iloc[0]])
    if neighbours is not None and len(neighbours):
        row = pd.concat([row, neighbour_features(neighbours, pd.DatetimeIndex([row['issue_hour']]),
                                                 hourly['pressure']).iloc[0]])

    used = {}

    def run(name):
        chosen = _pick(boosters, manifest, name, row)
        if chosen is None:
            return None
        used[name] = chosen
        return _one(boosters[chosen], chosen, row)

    night = run('night_min')
    spread = night_outlook(np.array([night]), np.array(manifest[used['night_min']]['residuals']))
    outlook = br.Outlook(
        night_min=night, p10=float(spread['p10'][0]), p90=float(spread['p90'][0]),
        frost_chance=float(spread['frost_chance'][0]),
        day_max=run('day_max'), rain_24h=run('rain_next_24h'), rain_6h=run('rain_next_6h'),
    )
    normal_low, normal_high = br.normals_for(evenings, date, int(row['doy']))
    analogs = find_analogs(evenings, date)
    text = br.build_brief(date, row, outlook, normal_low, normal_high, analogs)

    latest = features[~features['outage']].iloc[-1]
    if has_guidance:
        latest = pd.concat([latest, hourly_features(guidance, pd.DatetimeIndex([latest.name])).iloc[0]])
    if neighbours is not None and len(neighbours):
        latest = pd.concat([latest, neighbour_features(neighbours, pd.DatetimeIndex([latest.name]),
                                                       hourly['pressure']).iloc[0]])
    now = {'time': latest['local'].isoformat()}
    for name, key, digits in (('rain_next_6h', 'rain_next_6h_chance', 3), ('temp_next_24h', 'temp_in_24h', 1)):
        chosen = _pick(boosters, manifest, name, latest)
        if chosen:
            now[key] = round(_one(boosters[chosen], chosen, latest), digits)

    models_said = {}
    for frame in ([guidance] if has_guidance else []) + [f for f in second_opinions if f is not None and len(f)]:
        per = evening_by_model(frame, pd.Index([date]), station.timezone).set_index('model')
        for m, r in per.iterrows():
            said = {k: (None if pd.isna(v) else round(float(v), 1))
                    for k, v in r[['night_min', 'day_max', 'rain_24h']].items()}
            if any(v is not None for v in said.values()):
                models_said[m] = said

    return {
        'station': station.name,
        'timezone': station.timezone,
        'evening': {
            'date': date,
            'night_min': round(outlook.night_min, 1),
            'night_min_range': [round(outlook.p10, 1), round(outlook.p90, 1)],
            'frost_chance': round(outlook.frost_chance, 3),
            'day_max': None if outlook.day_max is None else round(outlook.day_max, 1),
            'rain_next_24h_chance': None if outlook.rain_24h is None else round(outlook.rain_24h, 3),
            'analogs': [{'date': d, 'night_min': round(float(a['night_min']), 1)} for d, a in analogs.iterrows()],
        },
        'latest_hour': now,
        'models': used,
        'guidance': models_said or None,
        'brief': text,
    }
