"""Run the saved models on the latest data and build tonight's brief."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from . import brief as br
from .analogs import find_analogs
from .data import load_hourly
from .features import build_features, evening_table
from .models import TASKS_BY_NAME, load_models, night_outlook


def _one(booster, task_name: str, row: pd.Series) -> float:
    task = TASKS_BY_NAME[task_name]
    x = pd.DataFrame([row[task.features].astype(float).to_numpy()], columns=task.features)
    return float(booster.predict(x)[0])


def forecast(db_path: str | Path, models_dir: Path, station_id: str | None = None,
             date: str | None = None) -> dict:
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

    night = _one(boosters['night_min'], 'night_min', row)
    spread = night_outlook(np.array([night]), np.array(manifest['night_min']['residuals']))
    outlook = br.Outlook(
        night_min=night, p10=float(spread['p10'][0]), p90=float(spread['p90'][0]),
        frost_chance=float(spread['frost_chance'][0]),
        day_max=_one(boosters['day_max'], 'day_max', row) if 'day_max' in boosters else None,
        rain_24h=_one(boosters['rain_next_24h'], 'rain_next_24h', row) if 'rain_next_24h' in boosters else None,
        rain_6h=_one(boosters['rain_next_6h'], 'rain_next_6h', row) if 'rain_next_6h' in boosters else None,
    )
    normal_low, normal_high = br.normals_for(evenings, date, int(row['doy']))
    analogs = find_analogs(evenings, date)
    text = br.build_brief(date, row, outlook, normal_low, normal_high, analogs)

    latest = features[~features['outage']].iloc[-1]
    now = {'time': latest['local'].isoformat()}
    if 'rain_next_6h' in boosters:
        now['rain_next_6h_chance'] = round(_one(boosters['rain_next_6h'], 'rain_next_6h', latest), 3)
    if 'temp_next_24h' in boosters:
        now['temp_in_24h'] = round(_one(boosters['temp_next_24h'], 'temp_next_24h', latest), 1)

    return {
        'station': station.name,
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
        'brief': text,
    }
