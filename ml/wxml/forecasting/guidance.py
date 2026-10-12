"""Use cases for guidance: what the weather models say, and how well they have
done at this station.

Scoring raw guidance against the station is the first step towards blending
it into the station's own models. It shows each model's bias here (a frost
hollow runs colder than the grid cell; an anemometer below 10 m reads less
wind) and whether it beats persistence ("the same as this time yesterday").
"""

from __future__ import annotations

from typing import Callable

import numpy as np
import pandas as pd

from ..data import Station
from .domain import Location
from .ports import ForecastSource, GuidanceArchive, ObservationStore

# Variables the station measures too, so they can be scored.
SCORED = ['temp', 'dew', 'rh', 'pressure', 'wind', 'gust', 'rain', 'solar']


def location_of(station: Station) -> Location:
    if station.latitude is None or station.longitude is None:
        raise LookupError('The station has no position in the database; pass --lat and --lon.')
    return Location(station.latitude, station.longitude, station.elevation_m)


def score_guidance(hourly: pd.DataFrame, guidance: pd.DataFrame) -> pd.DataFrame:
    """One row per (model, lead_days, variable): hours compared, bias and MAE,
    and skill against persistence (the station's own reading lead_days earlier,
    or 24 h for a same-day run). Skill compares the two over only the hours where
    both exist; `persistence_mae` is over those hours too. Outage hours are left out."""
    observed = hourly.loc[~hourly['outage']]
    rows = []
    for (model, lead), g in guidance.groupby(['model', 'lead_days'], sort=True):
        g = g.set_index('hour')
        lag = pd.Timedelta(days=max(1, int(lead)))
        for var in SCORED:
            if var not in g or var not in observed:
                continue
            truth = observed[var].reindex(g.index)
            before = hourly[var].where(~hourly['outage'])
            before.index = before.index + lag
            persist = before.reindex(g.index)
            both = g[var].notna() & truth.notna()
            n = int(both.sum())
            if n == 0:
                continue
            err = (g[var] - truth)[both]
            ok = both & persist.notna()
            rows.append({
                'model': model,
                'lead_days': int(lead),
                'variable': var,
                'hours': n,
                'bias': float(err.mean()),
                'mae': float(err.abs().mean()),
                'persistence_mae': float((persist - truth)[ok].abs().mean()) if ok.any() else np.nan,
                'paired_mae': float((g[var] - truth)[ok].abs().mean()) if ok.any() else np.nan,
            })
    scores = pd.DataFrame(rows, columns=['model', 'lead_days', 'variable', 'hours', 'bias', 'mae',
                                         'persistence_mae', 'paired_mae'])
    scores['skill'] = 1 - scores.pop('paired_mae') / scores['persistence_mae']
    return scores


def check_guidance(store: ObservationStore, source: ForecastSource, models: list[str],
                   days: int = 60, lead_days: int = 1, station_id: str | None = None,
                   location: Location | None = None) -> tuple[Station, pd.DataFrame]:
    """Score each model's day-ahead guidance over the station's last `days` complete days."""
    station, hourly = store.load_hourly(station_id)
    if hourly.empty:
        raise LookupError('No archive observations found.')
    end = hourly.index.max().floor('D') - pd.Timedelta(days=1)
    start = end - pd.Timedelta(days=days - 1)
    guidance = source.as_issued(location or location_of(station), models,
                                f'{start:%Y-%m-%d}', f'{end:%Y-%m-%d}', lead_days)
    return station, score_guidance(hourly, guidance)


# Open-Meteo keeps past runs from here for most models.
GUIDANCE_FROM = '2024-01-01'


def sync_guidance(source: ForecastSource, archive: GuidanceArchive, location: Location, models: list[str],
                  lead_days: int = 1, first: str = GUIDANCE_FROM, today: pd.Timestamp | None = None,
                  log: Callable[[str], None] = lambda _: None) -> list[str]:
    """Fetch the as-issued guidance the archive is missing, a month at a time, up to yesterday (UTC).

    A month is fetched again while it can still change (it was incomplete when
    last fetched) or when it lacks a model now asked for. Returns the months fetched.
    """
    today = (today or pd.Timestamp.now(tz='UTC')).floor('D')
    last_day = today - pd.Timedelta(days=1)
    stored = archive.months(source.name, lead_days)
    fetched = []
    for month_start in pd.date_range(pd.Timestamp(first, tz='UTC').replace(day=1), last_day, freq='MS'):
        month = f'{month_start:%Y-%m}'
        info = stored.get(month)
        if info and info['complete'] and set(models) <= info['models']:
            continue
        asked = sorted(set(models) | (info['models'] if info else set()))
        month_end = month_start + pd.offsets.MonthEnd(0)
        end = min(month_end, last_day)
        start = max(month_start, pd.Timestamp(first, tz='UTC'))
        frame = source.as_issued(location, asked, f'{start:%Y-%m-%d}', f'{end:%Y-%m-%d}', lead_days)
        # Settled once the whole month is in the past by more than the lead time.
        complete = today > month_end + pd.Timedelta(days=lead_days + 1)
        archive.save_month(source.name, lead_days, month, frame, asked, complete)
        log(f'{month}: {len(frame):,} hours of guidance from {frame["model"].nunique()} models')
        fetched.append(month)
    return fetched
