"""Read the station's SQLite archive (read-only) into a tidy hourly table.

Only archive observations (source = 'historic') are used: they come from the
raw WeatherLink archive at a fixed interval, so every hour is built from the
same kind of reading. Live 60-second polls are ignored.

The hourly table is indexed by the UTC start of each hour and covers every
hour from the first to the last reading. Hours with no usable outdoor reading
have `outage = True` and NaN readings, so gaps are explicit rather than silent.
"""

from __future__ import annotations

import json
import sqlite3
from contextlib import closing
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd

# How each archive measurement is folded into an hour.
MEAN = {
    'temperature.outdoor': 'temp',
    'temperature.dewPoint': 'dew',
    'humidity.outdoor': 'rh',
    'pressure.seaLevel': 'pressure',
    'wind.speed': 'wind',
    'solar.radiation': 'solar',
}
MAX = {'wind.gust': 'gust', 'temperature.outdoorHigh': 'temp_hi'}
MIN = {'temperature.outdoorLow': 'temp_lo'}
SUM = {'rain.interval': 'rain'}
DIRECTION = 'wind.direction'

HOURLY_COLUMNS = [
    'temp', 'temp_hi', 'temp_lo', 'dew', 'rh', 'pressure', 'wind', 'gust',
    'wind_dir_sin', 'wind_dir_cos', 'solar', 'rain', 'records', 'outage',
]


@dataclass(frozen=True)
class Station:
    id: str
    name: str
    timezone: str
    latitude: float | None
    longitude: float | None


def connect_readonly(db_path: str | Path) -> sqlite3.Connection:
    path = Path(db_path).resolve()
    if not path.exists():
        raise FileNotFoundError(f'No database at {path}')
    return sqlite3.connect(f'file:{path}?mode=ro', uri=True)


def load_station(conn: sqlite3.Connection, station_id: str | None = None) -> Station:
    sql = 'SELECT id, name, timezone, latitude, longitude FROM stations'
    rows = conn.execute(sql + (' WHERE id = ?' if station_id else ' ORDER BY is_active DESC, id'),
                        (station_id,) if station_id else ()).fetchall()
    if not rows:
        raise LookupError('No station found in the database')
    sid, name, tz, lat, lon = rows[0]
    return Station(str(sid), name, tz or 'Europe/Dublin', lat, lon)


def load_readings(conn: sqlite3.Connection, station_id: str) -> pd.DataFrame:
    """One row per archive observation, one column per measurement name."""
    cur = conn.execute(
        "SELECT timestamp, measurements FROM observations "
        "WHERE station_id = ? AND source = 'historic' ORDER BY timestamp",
        (station_id,),
    )
    wanted = set(MEAN) | set(MAX) | set(MIN) | set(SUM) | {DIRECTION}
    rows: list[dict] = []
    for ts, payload in cur:
        values = {'timestamp': ts}
        for name, m in json.loads(payload).items():
            if name in wanted:
                values[name] = m.get('value')
        rows.append(values)
    if not rows:
        return pd.DataFrame(columns=['timestamp', *sorted(wanted)])
    frame = pd.DataFrame(rows)
    frame['timestamp'] = pd.to_datetime(frame['timestamp'], unit='s', utc=True)
    for name in wanted:
        # Missing or all-null measurements (no solar sensor, say) become float NaN columns.
        frame[name] = pd.to_numeric(frame[name], errors='coerce').astype(float) if name in frame else np.nan
    # Readings from several sensors (ISS, barometer) share a timestamp: merge them.
    return frame.groupby('timestamp', as_index=False).first()


def dew_point(temp_c: pd.Series, rh: pd.Series) -> pd.Series:
    """Magnus formula; used when the station didn't report dew point."""
    rh = rh.clip(lower=1, upper=100)
    a, b = 17.625, 243.04
    gamma = np.log(rh / 100) + a * temp_c / (b + temp_c)
    return b * gamma / (a - gamma)


def to_hourly(readings: pd.DataFrame) -> pd.DataFrame:
    if readings.empty:
        return pd.DataFrame(columns=HOURLY_COLUMNS, index=pd.DatetimeIndex([], tz='UTC'))

    r = readings.set_index('timestamp').sort_index()
    grouped = r.groupby(r.index.floor('h'))

    parts = [
        grouped[list(MEAN)].mean().rename(columns=MEAN),
        grouped[list(MAX)].max().rename(columns=MAX),
        grouped[list(MIN)].min().rename(columns=MIN),
        grouped[list(SUM)].sum(min_count=1).rename(columns=SUM),
    ]

    radians = np.deg2rad(r[DIRECTION].astype(float))
    weights = r['wind.speed'].astype(float).fillna(1.0).clip(lower=0.1)
    direction = pd.DataFrame({
        'wind_dir_sin': np.sin(radians) * weights,
        'wind_dir_cos': np.cos(radians) * weights,
    }, index=r.index).groupby(r.index.floor('h')).sum(min_count=1)
    norm = np.hypot(direction['wind_dir_sin'], direction['wind_dir_cos']).replace(0, np.nan)
    parts.append(direction.div(norm, axis=0))

    usable = r['temperature.outdoor'].notna()
    parts.append(usable.groupby(r.index.floor('h')).sum().rename('records'))

    hourly = pd.concat(parts, axis=1)
    full = pd.date_range(hourly.index.min(), hourly.index.max(), freq='h', tz='UTC')
    hourly = hourly.reindex(full)
    hourly['records'] = hourly['records'].fillna(0).astype(int)
    hourly['outage'] = hourly['records'] == 0

    # An hour with no usable outdoor reading carries no readings at all.
    reading_cols = [c for c in HOURLY_COLUMNS if c not in ('records', 'outage', 'pressure')]
    hourly.loc[hourly['outage'], reading_cols] = np.nan

    hourly['temp_hi'] = hourly['temp_hi'].fillna(hourly['temp'])
    hourly['temp_lo'] = hourly['temp_lo'].fillna(hourly['temp'])
    hourly['dew'] = hourly['dew'].fillna(dew_point(hourly['temp'], hourly['rh']))
    hourly.index.name = 'hour'
    return hourly[HOURLY_COLUMNS]


def load_hourly(db_path: str | Path, station_id: str | None = None) -> tuple[Station, pd.DataFrame]:
    with closing(connect_readonly(db_path)) as conn:
        station = load_station(conn, station_id)
        return station, to_hourly(load_readings(conn, station.id))
