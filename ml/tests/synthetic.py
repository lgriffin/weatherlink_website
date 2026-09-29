"""A made-up station archive with believable weather physics, for tests and demos.

Falling pressure brings cloud, wind and rain; clear, calm, dry nights get
cold. That gives the models real signal to find, so the tests can check the
pipeline end to end without the real station's data.
"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

import numpy as np
import pandas as pd

SCHEMA = """
CREATE TABLE stations (id TEXT PRIMARY KEY, weatherlink_station_id TEXT, name TEXT, timezone TEXT,
  latitude REAL, longitude REAL, elevation_metres REAL, is_active INTEGER, registered_at INTEGER, updated_at INTEGER);
CREATE TABLE sensors (id TEXT PRIMARY KEY, station_id TEXT, lsid INTEGER, sensor_type INTEGER,
  data_structure_type INTEGER, name TEXT, category TEXT, is_active INTEGER);
CREATE TABLE observations (id TEXT PRIMARY KEY, station_id TEXT, sensor_id TEXT, timestamp INTEGER,
  received_at INTEGER, source TEXT, measurements TEXT, raw_payload_hash TEXT);
"""


def simulate(start: str = '2023-06-01', days: int = 820, seed: int = 3,
             tz: str = 'Europe/Dublin', lat: float = 53.3, lon: float = -6.3) -> pd.DataFrame:
    """Hourly weather, indexed by UTC hour."""
    rng = np.random.default_rng(seed)
    hours = pd.date_range(pd.Timestamp(start, tz='UTC'), periods=days * 24, freq='h')
    n = len(hours)
    local = hours.tz_convert(tz)
    doy = local.dayofyear.to_numpy()
    hod = local.hour.to_numpy()

    dp = np.zeros(n)
    p = np.zeros(n)
    p[0] = 1013
    for i in range(1, n):
        dp[i] = 0.92 * dp[i - 1] + rng.normal(0, 0.28) - 0.002 * (p[i - 1] - 1013)
        p[i] = np.clip(p[i - 1] + dp[i], 960, 1045)

    tend = pd.Series(p).diff(3).fillna(0).to_numpy()
    cloud_noise = pd.Series(rng.normal(0, 1, n)).ewm(span=6).mean().to_numpy()
    cloud = 1 / (1 + np.exp((p - 1012) / 7 + tend * 0.9 - cloud_noise * 1.5))

    wind = np.clip(1.2 + 1.8 * np.abs(tend) + 0.08 * np.abs(p - 1013) + rng.gamma(2, 0.5, n), 0, 25)
    gust = wind * rng.uniform(1.4, 2.0, n) + rng.gamma(1.5, 0.6, n)
    direction = np.where(tend < 0, 225 + rng.normal(0, 25, n), 320 + rng.normal(0, 35, n)) % 360

    rain_chance = np.clip((cloud - 0.65) * 1.3 + np.clip(-tend, 0, None) * 0.08, 0, 0.9)
    raining = rng.random(n) < rain_chance
    rain = np.where(raining, np.round(rng.exponential(0.9, n) / 0.2) * 0.2, 0.0)

    season = 10 - 5.5 * np.cos(2 * np.pi * (doy - 25) / 365.25)
    summerness = (1 - np.cos(2 * np.pi * (doy - 25) / 365.25)) / 2
    airmass = pd.Series(rng.normal(0, 1, n)).ewm(span=72).mean().to_numpy() * 16
    calm = 1 - np.minimum(wind, 8) / 10
    day_amp = (2.5 + 4 * summerness) * (1 - 0.6 * cloud)
    night_drop = (4.0 + 3.5 * (1 - summerness)) * (1 - cloud) ** 1.3 * calm
    shape = np.cos(2 * np.pi * (hod - 15) / 24)
    temp = season + airmass + day_amp * np.clip(shape, 0, None) + night_drop * np.clip(shape, None, 0) \
        + rng.normal(0, 0.3, n)

    rh = np.clip(70 + 25 * cloud - 18 * np.clip(shape, 0, None) * (1 - cloud) + 12 * raining
                 + 8 * calm * (hod < 8) + rng.normal(0, 3, n), 30, 100)

    from wxml.features import clear_sky_radiation
    solar = clear_sky_radiation(hours, lat, lon) * (1 - 0.75 * cloud) * rng.uniform(0.9, 1.05, n)

    return pd.DataFrame({
        'temp': temp, 'rh': rh, 'pressure': p, 'wind': wind, 'gust': gust,
        'direction': direction, 'rain': rain, 'solar': np.clip(solar, 0, None),
    }, index=hours)


def _m(name: str, value, unit: str, ts: str) -> dict:
    return {'name': name, 'value': None if value is None else float(value), 'unit': unit, 'timestamp': ts}


def write_db(path: str | Path, weather: pd.DataFrame, interval_minutes: int = 30,
             outages: list[tuple[str, str]] = (), tz: str = 'Europe/Dublin',
             lat: float = 53.3, lon: float = -6.3) -> Path:
    """Write `weather` as archive observations, one ISS and one barometer record per interval."""
    path = Path(path)
    if path.exists():
        path.unlink()
    conn = sqlite3.connect(path)
    conn.executescript(SCHEMA)
    conn.execute("INSERT INTO stations VALUES ('1','1','Test Station',?,?,?,40,1,0,0)", (tz, lat, lon))
    conn.execute("INSERT INTO sensors VALUES ('iss','1',1,45,24,'ISS','iss',1)")
    conn.execute("INSERT INTO sensors VALUES ('bar','1',2,242,20,'Barometer','barometer',1)")

    blocked = [(pd.Timestamp(a, tz='UTC'), pd.Timestamp(b, tz='UTC')) for a, b in outages]
    per_hour = 60 // interval_minutes
    rows = []
    for hour, w in weather.iterrows():
        for k in range(per_hour):
            ts = hour + pd.Timedelta(minutes=interval_minutes * k)
            if any(a <= ts < b for a, b in blocked):
                continue
            iso = ts.strftime('%Y-%m-%dT%H:%M:%S.000Z')
            epoch = int(ts.timestamp())
            iss = {
                'temperature.outdoor': _m('temperature.outdoor', w.temp, 'celsius', iso),
                'temperature.outdoorHigh': _m('temperature.outdoorHigh', w.temp + 0.2, 'celsius', iso),
                'temperature.outdoorLow': _m('temperature.outdoorLow', w.temp - 0.2, 'celsius', iso),
                'temperature.dewPoint': _m('temperature.dewPoint', None, 'celsius', iso),
                'humidity.outdoor': _m('humidity.outdoor', round(w.rh), 'percent', iso),
                'wind.speed': _m('wind.speed', w.wind, 'm/s', iso),
                'wind.gust': _m('wind.gust', w.gust, 'm/s', iso),
                'wind.direction': _m('wind.direction', w.direction, 'degrees', iso),
                'rain.interval': _m('rain.interval', w.rain / per_hour, 'mm', iso),
                'solar.radiation': _m('solar.radiation', w.solar, 'W/m2', iso),
            }
            bar = {'pressure.seaLevel': _m('pressure.seaLevel', w.pressure, 'hPa', iso)}
            rows.append((f'archive:1:iss:{epoch}', '1', 'iss', epoch, epoch, 'historic', json.dumps(iss), 'x'))
            rows.append((f'archive:1:bar:{epoch}', '1', 'bar', epoch, epoch, 'historic', json.dumps(bar), 'x'))
    conn.executemany('INSERT INTO observations VALUES (?,?,?,?,?,?,?,?)', rows)
    conn.commit()
    conn.close()
    return path
