"""ForecastSource adapter for Open-Meteo (https://open-meteo.com).

Free for non-commercial use with no key, CC BY 4.0 (credit "Weather data by
Open-Meteo.com"). One request can ask for several models at once: ECMWF,
DWD ICON, the Met Office's 2 km UK model (which covers all of Ireland), the
Harmonie-AROME runs from DMI and KNMI, and more. The Previous Runs API keeps
each model's forecasts as they were issued 1 to 7 days ahead, from January
2024 for most models, which is what training and scoring need.

Open-Meteo stamps sums and maxima (rain, gusts, sunshine) at the end of the
hour they cover; they are moved back an hour here so they line up with the
station's hour buckets. Instant values (temperature, pressure) stay put.
"""

from __future__ import annotations

import json
import math
import urllib.error
import urllib.parse
import urllib.request
from typing import Callable

import numpy as np
import pandas as pd

from ..forecasting.domain import GUIDANCE_COLUMNS, GUIDANCE_VARIABLES, Location, empty_guidance

FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
PREVIOUS_RUNS_URL = 'https://previous-runs-api.open-meteo.com/v1/forecast'

# Our variable -> Open-Meteo hourly variable.
VARIABLES = {
    'temp': 'temperature_2m',
    'dew': 'dew_point_2m',
    'rh': 'relative_humidity_2m',
    'pressure': 'pressure_msl',
    'wind': 'wind_speed_10m',
    'gust': 'wind_gusts_10m',
    'wind_dir': 'wind_direction_10m',
    'rain': 'precipitation',
    'cloud': 'cloud_cover',
    'solar': 'shortwave_radiation',
}
assert set(VARIABLES) == set(GUIDANCE_VARIABLES)

# Values that describe the hour *before* their timestamp.
PRECEDING_HOUR = {'rain', 'gust', 'solar'}

# Sensible models for Ireland, best first. Any Open-Meteo model id works.
DEFAULT_MODELS = ['ecmwf_ifs025', 'ukmo_seamless', 'icon_seamless', 'knmi_harmonie_arome_europe']

FetchJson = Callable[[str], dict]


def _fetch_json(url: str, timeout: float = 60) -> dict:
    req = urllib.request.Request(url, headers={'User-Agent': 'weatherlink_website-wxml'})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as err:
        # Open-Meteo explains bad requests in the body. Say why, without the URL (it holds the location).
        try:
            reason = json.loads(err.read()).get('reason', '')
        except Exception:  # noqa: BLE001
            reason = ''
        raise RuntimeError(f'Open-Meteo answered {err.code}: {reason or err.reason}') from None
    except urllib.error.URLError as err:
        raise RuntimeError(f'Could not reach Open-Meteo: {err.reason}') from None


class OpenMeteoForecastSource:
    name = 'open-meteo'

    def __init__(self, fetch_json: FetchJson = _fetch_json,
                 forecast_url: str = FORECAST_URL, previous_runs_url: str = PREVIOUS_RUNS_URL):
        self._fetch = fetch_json
        self._forecast_url = forecast_url
        self._previous_runs_url = previous_runs_url

    def latest(self, location: Location, models: list[str], hours: int = 72) -> pd.DataFrame:
        days = max(1, min(16, math.ceil(hours / 24) + 1))
        url = self._url(self._forecast_url, location, models, list(VARIABLES.values()),
                        {'forecast_days': days})
        frame = self._parse(self._fetch(url), models, lead_days=0)
        start = pd.Timestamp.now(tz='UTC').floor('h')
        keep = (frame['hour'] >= start) & (frame['hour'] < start + pd.Timedelta(hours=hours))
        return frame.loc[keep].reset_index(drop=True)

    def as_issued(self, location: Location, models: list[str], start: str, end: str,
                  lead_days: int = 1) -> pd.DataFrame:
        if not 1 <= lead_days <= 7:
            raise ValueError('lead_days must be 1 to 7 (what Open-Meteo keeps)')
        names = [f'{v}_previous_day{lead_days}' for v in VARIABLES.values()]
        url = self._url(self._previous_runs_url, location, models, names,
                        {'start_date': start, 'end_date': end})
        return self._parse(self._fetch(url), models, lead_days=lead_days)

    @staticmethod
    def _url(base: str, location: Location, models: list[str], variables: list[str], extra: dict) -> str:
        params = {
            # About 1 km: finer than any model grid, and no more precise than needed.
            'latitude': f'{location.latitude:.2f}',
            'longitude': f'{location.longitude:.2f}',
            'hourly': ','.join(variables),
            'models': ','.join(models),
            'wind_speed_unit': 'ms',
            'timeformat': 'unixtime',
            'timezone': 'GMT',
            **extra,
        }
        if location.elevation_m is not None:
            # Open-Meteo then corrects temperature for the station's height rather than the grid cell's.
            params['elevation'] = f'{location.elevation_m:.0f}'
        return f'{base}?{urllib.parse.urlencode(params, safe=",")}'

    def _parse(self, body: dict, models: list[str], lead_days: int) -> pd.DataFrame:
        if body.get('error'):
            raise RuntimeError(f"Open-Meteo: {body.get('reason', 'request failed')}")
        hourly = body.get('hourly') or {}
        times = hourly.get('time') or []
        if not times:
            return empty_guidance()
        stamps = pd.to_datetime(np.asarray(times, dtype='int64'), unit='s', utc=True).as_unit('ns')
        lag = f'_previous_day{lead_days}' if lead_days else ''
        frames = []
        for model in models:
            columns = {}
            for ours, theirs in VARIABLES.items():
                # Several models: "<var>_<model>". One model: usually just "<var>".
                key = f'{theirs}{lag}_{model}'
                if key not in hourly and len(models) == 1:
                    key = f'{theirs}{lag}'
                values = pd.Series(pd.to_numeric(pd.Series(hourly.get(key, [None] * len(times))),
                                                 errors='coerce').to_numpy(dtype=float), index=stamps)
                if ours in PRECEDING_HOUR:
                    values.index = values.index - pd.Timedelta(hours=1)
                columns[ours] = values
            frame = pd.DataFrame(columns)
            frame = frame.dropna(how='all')
            if frame.empty:
                continue
            frame.index.name = 'hour'
            frame = frame.reset_index()
            frame.insert(0, 'lead_days', lead_days)
            frame.insert(0, 'model', model)
            frame.insert(0, 'source', self.name)
            frames.append(frame)
        if not frames:
            return empty_guidance()
        return pd.concat(frames, ignore_index=True)[GUIDANCE_COLUMNS]
