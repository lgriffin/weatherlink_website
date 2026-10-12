"""Met Éireann adapters: station observations (NeighbourObservations) and the
point forecast (ForecastSource).

Data: Copyright Met Éireann, source www.met.ie, CC BY 4.0. Their terms add one
rule: a site that shows Met Éireann forecasts must also show Met Éireann's
current weather warnings.

- History: the hourly CSV per synoptic station (cli.fusio.net), zipped,
  updated about once a month. Rain is the amount in the hour before the
  timestamp, so it is moved back an hour.
- Today: the observations API (prodapi.metweb.ie), hourly since midnight,
  times in Irish local time, wind in km/h.
- Forecast: the open point-forecast API (openaccess.pf.api.met.ie), XML with
  instant values at each hour and rain over the hour before. It keeps no past
  runs, so the forecasts used are kept as issued (see forecasting.guidance).
"""

from __future__ import annotations

import io
import json
import xml.etree.ElementTree as ET
import zipfile
from typing import Callable

import numpy as np
import pandas as pd

from ..forecasting.domain import GUIDANCE_COLUMNS, Location, empty_guidance
from ..forecasting.neighbours import NEIGHBOUR_COLUMNS, empty_neighbours
from .http import get_bytes

HISTORY_URL = 'https://cli.fusio.net/cli/climate_data/webdata/hly{number}.zip'
TODAY_URL = 'https://prodapi.metweb.ie/observations/{slug}/today'
FORECAST_URL = 'https://openaccess.pf.api.met.ie/metno-wdb2ts/locationforecast?lat={lat:.2f};long={lon:.2f}'

# Synoptic stations: our site id (also the API's slug) -> climate-data station number.
STATIONS = {
    'valentia': 2275,
    'belmullet': 2375,
    'malin-head': 1575,
    'shannon-airport': 518,
    'cork-airport': 3904,
    'dublin-airport': 532,
}
KNOTS = 0.514444

FetchBytes = Callable[[str], bytes]


def _fetch(url: str) -> bytes:
    return get_bytes(url, 'Met Éireann')


class MetEireannObservations:
    name = 'met-eireann'

    def __init__(self, fetch: FetchBytes = _fetch, stations: dict[str, int] = STATIONS,
                 history_url: str = HISTORY_URL, today_url: str = TODAY_URL):
        self._fetch = fetch
        self.stations = stations
        self._history_url = history_url
        self._today_url = today_url
        self._history: dict[str, pd.DataFrame] = {}

    def hourly(self, start: str, end: str) -> pd.DataFrame:
        first = pd.Timestamp(start, tz='UTC')
        after = pd.Timestamp(end, tz='UTC') + pd.Timedelta(days=1)
        frames = []
        for site, number in self.stations.items():
            if site not in self._history:  # one download per station, however many months are asked for
                body = self._fetch(self._history_url.format(number=number))
                self._history[site] = parse_history(_unzip(body), site)
            h = self._history[site]
            frames.append(h[(h['hour'] >= first) & (h['hour'] < after)])
        return _concat(frames)

    def recent(self, hours: int = 24) -> pd.DataFrame:
        now = pd.Timestamp.now(tz='UTC').floor('h')
        frames = []
        for site in self.stations:
            try:
                body = self._fetch(self._today_url.format(slug=site))
            except RuntimeError:
                continue  # one station down shouldn't lose the others
            frames.append(parse_today(json.loads(body), site))
        out = _concat(frames)
        return out[out['hour'] >= now - pd.Timedelta(hours=hours)].reset_index(drop=True)


def _concat(frames: list[pd.DataFrame]) -> pd.DataFrame:
    frames = [f for f in frames if len(f)]
    return pd.concat(frames, ignore_index=True)[NEIGHBOUR_COLUMNS] if frames else empty_neighbours()


def _unzip(body: bytes) -> str:
    if body[:2] != b'PK':
        return body.decode('utf-8', errors='replace')
    with zipfile.ZipFile(io.BytesIO(body)) as z:
        name = next(n for n in z.namelist() if n.lower().endswith('.csv'))
        return z.read(name).decode('utf-8', errors='replace')


def parse_history(text: str, site: str) -> pd.DataFrame:
    """The climate-data hourly CSV: a block of notes, then `date,ind,rain,...`."""
    lines = text.splitlines()
    start = next((i for i, line in enumerate(lines) if line.lower().startswith('date,')), None)
    if start is None:
        return empty_neighbours()
    frame = pd.read_csv(io.StringIO('\n'.join(lines[start:])), dtype=str, skipinitialspace=True)
    frame.columns = [c.strip().lower() for c in frame.columns]
    num = {c: pd.to_numeric(frame[c].str.strip(), errors='coerce') if c in frame else pd.Series(np.nan, index=frame.index)
           for c in ('rain', 'temp', 'rhum', 'msl', 'wdsp', 'wddir')}
    hour = pd.to_datetime(frame['date'].str.strip(), format='%d-%b-%Y %H:%M', utc=True, errors='coerce')
    out = pd.DataFrame({
        'source': 'met-eireann', 'site': site, 'hour': hour,
        'pressure': num['msl'], 'temp': num['temp'], 'rh': num['rhum'],
        'wind': num['wdsp'] * KNOTS, 'gust': np.nan, 'wind_dir': num['wddir'],
    })
    rain = pd.Series(num['rain'].to_numpy(), index=hour - pd.Timedelta(hours=1))
    out = out[out['hour'].notna()].set_index('hour')
    out['rain'] = rain[rain.index.notna()].groupby(level=0).last().reindex(out.index)
    return out.reset_index()[NEIGHBOUR_COLUMNS]


def _number(v) -> float:
    try:
        return float(str(v).strip())
    except (TypeError, ValueError):
        return np.nan


def parse_today(rows: list[dict], site: str, tz: str = 'Europe/Dublin') -> pd.DataFrame:
    """The observations API: one object per hour, local date `dd-mm-yyyy` and `reportTime` `HH:MM`."""
    out = []
    for r in rows or []:
        try:
            local = pd.Timestamp(pd.to_datetime(f"{r['date']} {r['reportTime']}", format='%d-%m-%Y %H:%M'))
        except (KeyError, ValueError):
            continue
        hour = local.tz_localize(tz, nonexistent='shift_forward', ambiguous=True).tz_convert('UTC')
        out.append({'hour': hour, 'pressure': _number(r.get('pressure')), 'temp': _number(r.get('temperature')),
                    'rh': _number(r.get('humidity')), 'wind': _number(r.get('windSpeed')) / 3.6,
                    'gust': _number(r.get('windGust')) / 3.6, 'wind_dir': _number(r.get('windDirection')),
                    'rain_before': _number(r.get('rainfall'))})
    if not out:
        return empty_neighbours()
    frame = pd.DataFrame(out).drop_duplicates('hour', keep='last').set_index('hour').sort_index()
    rain = frame.pop('rain_before')
    rain.index = rain.index - pd.Timedelta(hours=1)
    frame['rain'] = rain.reindex(frame.index)
    frame = frame.reset_index()
    frame.insert(0, 'site', site)
    frame.insert(0, 'source', 'met-eireann')
    return frame[NEIGHBOUR_COLUMNS]


class MetEireannForecastSource:
    """Met Éireann's own point forecast (their Harmonie runs and forecasters' blend)."""

    name = 'met-eireann'
    MODEL = 'met_eireann'

    def __init__(self, fetch: FetchBytes = _fetch, url: str = FORECAST_URL):
        self._fetch = fetch
        self._url = url

    def latest(self, location: Location, models: list[str] | None = None, hours: int = 72,
               past_hours: int = 0) -> pd.DataFrame:
        frame = parse_forecast(self._fetch(self._url.format(lat=location.latitude, lon=location.longitude)))
        now = pd.Timestamp.now(tz='UTC').floor('h')
        keep = (frame['hour'] >= now - pd.Timedelta(hours=max(0, past_hours))) & \
               (frame['hour'] < now + pd.Timedelta(hours=hours))
        return frame.loc[keep].reset_index(drop=True)

    def as_issued(self, location: Location, models: list[str], start: str, end: str,
                  lead_days: int = 1) -> pd.DataFrame:
        raise LookupError("Met Éireann keeps no past forecasts; use the ones kept as issued "
                          "(guidance/met-eireann/lead0).")


INSTANT = {
    'temperature': ('temp', 'value'),
    'dewpointTemperature': ('dew', 'value'),
    'humidity': ('rh', 'value'),
    'pressure': ('pressure', 'value'),
    'windSpeed': ('wind', 'mps'),
    'windGust': ('gust', 'mps'),
    'windDirection': ('wind_dir', 'deg'),
    'cloudiness': ('cloud', 'percent'),
    'globalRadiation': ('solar', 'value'),
}


def parse_forecast(body: bytes) -> pd.DataFrame:
    root = ET.fromstring(body)
    hours: dict[pd.Timestamp, dict] = {}
    for t in root.iter('time'):
        start, end = pd.Timestamp(t.get('from')), pd.Timestamp(t.get('to'))
        if start.tzinfo is None:
            start, end = start.tz_localize('UTC'), end.tz_localize('UTC')
        loc = t.find('location')
        if loc is None:
            continue
        if start == end:
            row = hours.setdefault(start, {})
            for tag, (ours, attr) in INSTANT.items():
                el = loc.find(tag)
                if el is not None and el.get(attr) is not None:
                    row[ours] = _number(el.get(attr))
        elif end - start == pd.Timedelta(hours=1):
            el = loc.find('precipitation')
            if el is not None:
                hours.setdefault(start, {})['rain'] = _number(el.get('value'))
    if not hours:
        return empty_guidance()
    frame = pd.DataFrame.from_dict(hours, orient='index').sort_index()
    frame.index.name = 'hour'
    frame = frame.reset_index()
    frame['hour'] = pd.to_datetime(frame['hour'], utc=True)
    for col in GUIDANCE_COLUMNS[4:]:
        if col not in frame:
            frame[col] = np.nan
    frame.insert(0, 'lead_days', 0)
    frame.insert(0, 'model', MetEireannForecastSource.MODEL)
    frame.insert(0, 'source', MetEireannForecastSource.name)
    return frame[GUIDANCE_COLUMNS]
