"""Domain types shared by every forecasting port.

Guidance is what a weather model elsewhere (ECMWF, ICON, the Met Office's
2 km UK model) says will happen at the station's location. It is laid out
like the station's own hourly table so the two can be compared hour by hour:
the same column names, the same canonical units, the same hour buckets
(indexed by the UTC start of the hour).
"""

from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

# Canonical guidance variables. Names match the station's hourly columns
# (wxml.data.HOURLY_COLUMNS) where the station measures the same thing.
GUIDANCE_VARIABLES: dict[str, str] = {
    'temp': '°C at 2 m',
    'dew': '°C at 2 m',
    'rh': '% at 2 m',
    'pressure': 'hPa, sea level',
    'wind': 'm/s at 10 m',
    'gust': 'm/s at 10 m',
    'wind_dir': 'degrees, where the wind comes from',
    'rain': 'mm in the hour',
    'cloud': '% of the sky',
    'solar': 'W/m², mean over the hour',
}

# One row per (model, lead_days, hour). lead_days 0 is the latest run;
# lead_days 1 is the forecast as it was issued about a day before that hour.
GUIDANCE_KEYS = ['source', 'model', 'lead_days', 'hour']
GUIDANCE_COLUMNS = GUIDANCE_KEYS + list(GUIDANCE_VARIABLES)


@dataclass(frozen=True)
class Location:
    """Where to ask for guidance. Never printed or published: the site is public."""
    latitude: float
    longitude: float
    elevation_m: float | None = None


def empty_guidance() -> pd.DataFrame:
    frame = pd.DataFrame({c: pd.Series(dtype=float) for c in GUIDANCE_COLUMNS})
    frame['source'] = frame['source'].astype(object)
    frame['model'] = frame['model'].astype(object)
    frame['lead_days'] = frame['lead_days'].astype(int)
    frame['hour'] = pd.DatetimeIndex([], tz='UTC')
    return frame
