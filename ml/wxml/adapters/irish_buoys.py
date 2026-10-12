"""NeighbourObservations adapter for the Irish Weather Buoy Network (M2 to M6).

Hourly pressure, wind, air temperature and humidity far out in the Atlantic
and the Irish Sea, from the Marine Institute's ERDDAP server (dataset
`IWBNetwork`). Free and open (CC BY 4.0, credit the Marine Institute).

ERDDAP's CSV has a second header row with each column's unit; values are
converted from whatever units it names (wind usually comes in knots).
"""

from __future__ import annotations

import csv
import io
import urllib.parse
from typing import Callable

import numpy as np
import pandas as pd

from ..forecasting.neighbours import NEIGHBOUR_COLUMNS, empty_neighbours
from .http import get_bytes

ERDDAP_URL = 'https://erddap.marine.ie/erddap/tabledap/IWBNetwork.csv'
BUOYS = ['M2', 'M3', 'M4', 'M5', 'M6']

# Our variable -> ERDDAP column.
COLUMNS = {
    'pressure': 'AtmosphericPressure',
    'temp': 'AirTemperature',
    'rh': 'RelativeHumidity',
    'wind': 'WindSpeed',
    'gust': 'Gust',
    'wind_dir': 'WindDirection',
}
SPEED = {'knots': 0.514444, 'kt': 0.514444, 'm/s': 1.0, 'm s-1': 1.0, 'km/h': 1 / 3.6}
PLAUSIBLE = {'pressure': (900, 1080), 'temp': (-30, 40), 'rh': (0, 100), 'wind': (0, 80), 'gust': (0, 100),
             'wind_dir': (0, 360)}

FetchText = Callable[[str], str]


def _fetch_text(url: str) -> str:
    return get_bytes(url, 'the Marine Institute ERDDAP server').decode('utf-8')


class IrishBuoys:
    name = 'iwbn'

    def __init__(self, fetch_text: FetchText = _fetch_text, url: str = ERDDAP_URL, buoys: list[str] = BUOYS):
        self._fetch = fetch_text
        self._url = url
        self.buoys = buoys

    def hourly(self, start: str, end: str) -> pd.DataFrame:
        first = pd.Timestamp(start, tz='UTC')
        after = pd.Timestamp(end, tz='UTC') + pd.Timedelta(days=1)
        return self._between(first, after)

    def recent(self, hours: int = 24) -> pd.DataFrame:
        now = pd.Timestamp.now(tz='UTC').floor('h')
        return self._between(now - pd.Timedelta(hours=hours), now + pd.Timedelta(hours=1))

    def _between(self, first: pd.Timestamp, after: pd.Timestamp) -> pd.DataFrame:
        variables = ','.join(['station_id', 'time', *COLUMNS.values()])
        query = f'{variables}&time>={first:%Y-%m-%dT%H:%M:%SZ}&time<{after:%Y-%m-%dT%H:%M:%SZ}'
        text = self._fetch(f'{self._url}?{urllib.parse.quote(query, safe="=&,:")}')
        return parse_erddap_csv(text, self.buoys)


def parse_erddap_csv(text: str, buoys: list[str]) -> pd.DataFrame:
    rows = list(csv.reader(io.StringIO(text)))
    if len(rows) < 3:
        return empty_neighbours()
    header, units, data = rows[0], rows[1], rows[2:]
    frame = pd.DataFrame(data, columns=header)
    unit = dict(zip(header, units))
    out = pd.DataFrame({
        'source': 'iwbn',
        'site': frame['station_id'].str.strip(),
        'hour': pd.to_datetime(frame['time'], utc=True, errors='coerce'),
    })
    for ours, theirs in COLUMNS.items():
        if theirs not in frame:
            out[ours] = np.nan
            continue
        values = pd.to_numeric(frame[theirs], errors='coerce').astype(float)
        if ours in ('wind', 'gust'):
            values = values * SPEED.get(unit.get(theirs, '').strip().lower(), 1.0)
        lo, hi = PLAUSIBLE[ours]
        out[ours] = values.where(values.between(lo, hi))
    out['rain'] = np.nan  # the buoys don't measure rain
    out = out[out['site'].isin(buoys) & out['hour'].notna()]
    # Readings at hh:00 describe that hour's start; anything else rounds down to its hour.
    out['hour'] = out['hour'].dt.floor('h')
    out = out.groupby(['source', 'site', 'hour'], as_index=False).mean(numeric_only=True)
    return out[NEIGHBOUR_COLUMNS].reset_index(drop=True) if len(out) else empty_neighbours()
