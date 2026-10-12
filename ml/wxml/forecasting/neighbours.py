"""Neighbours: what the stations upwind and the Atlantic buoys are seeing.

The weather here mostly arrives from the west. A barometer falling at the M3
or M6 buoy, or at Valentia, hours before ours is real lead time for wind and
rain; the pressure difference across the country says how windy it will be.
Rather than one input per site (too many for a few years of evenings), the
sites are grouped: the Atlantic edge, the south and the north. Pure
functions, no I/O.
"""

from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

# One row per (source, site, hour); readings in canonical units.
NEIGHBOUR_KEYS = ['source', 'site', 'hour']
NEIGHBOUR_VARIABLES = ['pressure', 'temp', 'rh', 'wind', 'gust', 'wind_dir', 'rain']
NEIGHBOUR_COLUMNS = NEIGHBOUR_KEYS + NEIGHBOUR_VARIABLES


@dataclass(frozen=True)
class Site:
    id: str
    name: str
    latitude: float
    longitude: float
    groups: tuple[str, ...]


# Public positions of the Irish Weather Buoy Network and Met Éireann synoptic stations.
SITES = {s.id: s for s in [
    Site('M2', 'M2 buoy (Irish Sea)', 53.48, -5.43, ()),
    Site('M3', 'M3 buoy (south-west)', 51.22, -10.55, ('west', 'south')),
    Site('M4', 'M4 buoy (north-west)', 54.67, -9.07, ('west', 'north')),
    Site('M5', 'M5 buoy (south-east)', 51.69, -6.70, ('south',)),
    Site('M6', 'M6 buoy (far west)', 53.07, -15.88, ('west',)),
    Site('valentia', 'Valentia Observatory', 51.94, -10.24, ('west', 'south')),
    Site('belmullet', 'Belmullet', 54.23, -10.01, ('west', 'north')),
    Site('malin-head', 'Malin Head', 55.37, -7.34, ('north',)),
    Site('shannon-airport', 'Shannon Airport', 52.69, -8.92, ()),
    Site('cork-airport', 'Cork Airport', 51.85, -8.49, ('south',)),
    Site('dublin-airport', 'Dublin Airport', 53.43, -6.24, ()),
]}

NEIGHBOUR_FEATURES = [
    'n_west_pressure_change_3h', 'n_west_pressure_change_12h', 'n_west_minus_here',
    'n_south_minus_north', 'n_west_wind', 'n_west_temp', 'n_rain_3h',
]


def empty_neighbours() -> pd.DataFrame:
    frame = pd.DataFrame({c: pd.Series(dtype=float) for c in NEIGHBOUR_COLUMNS})
    frame['source'] = frame['source'].astype(object)
    frame['site'] = frame['site'].astype(object)
    frame['hour'] = pd.DatetimeIndex([], tz='UTC')
    return frame


def by_site(neighbours: pd.DataFrame, hours: pd.DatetimeIndex) -> dict[str, pd.DataFrame]:
    """One hourly table per site, reindexed to `hours` plus the 12 hours before them."""
    if neighbours.empty or len(hours) == 0:
        return {}
    full = pd.date_range(hours.min() - pd.Timedelta(hours=12), hours.max(), freq='h', tz='UTC')
    out = {}
    for site, g in neighbours.groupby('site', sort=True):
        g = g.drop_duplicates('hour', keep='last').set_index('hour').sort_index()
        out[str(site)] = g[NEIGHBOUR_VARIABLES].reindex(full)
    return out


BUOYS = {'M2', 'M3', 'M4', 'M5', 'M6'}


def _group_mean(tables: dict[str, pd.DataFrame], group: str, make) -> pd.Series | None:
    """The group's mean of a change, which doesn't depend on which sites happen to report."""
    parts = [make(t) for s, t in tables.items() if s in SITES and group in SITES[s].groups]
    return pd.concat(parts, axis=1).mean(axis=1) if parts else None


def _group_level(tables: dict[str, pd.DataFrame], group: str, column: str) -> pd.Series | None:
    """A level (pressure, temperature, wind) for the group, from its land stations only and only
    when all of them report: each site has its own usual level (buoys windier, the north lower),
    so a mean over whichever sites report would jump when one drops out."""
    land = [s for s, site in SITES.items() if group in site.groups and s not in BUOYS]
    if not land or any(s not in tables for s in land):
        return None
    return pd.concat([tables[s][column] for s in land], axis=1).mean(axis=1, skipna=False)


def features(neighbours: pd.DataFrame, hours: pd.DatetimeIndex, here_pressure: pd.Series) -> pd.DataFrame:
    """NEIGHBOUR_FEATURES for each UTC hour, using only readings up to the end of that hour."""
    out = pd.DataFrame(index=hours, columns=NEIGHBOUR_FEATURES, dtype=float)
    tables = by_site(neighbours, hours)
    if not tables:
        return out

    def col(name, series):
        if series is not None:
            out[name] = series.reindex(hours)

    col('n_west_pressure_change_3h', _group_mean(tables, 'west', lambda t: t['pressure'] - t['pressure'].shift(3)))
    col('n_west_pressure_change_12h', _group_mean(tables, 'west', lambda t: t['pressure'] - t['pressure'].shift(12)))
    west = _group_level(tables, 'west', 'pressure')
    if west is not None:
        out['n_west_minus_here'] = (west.reindex(hours) - here_pressure.reindex(hours)).to_numpy()
    south = _group_level(tables, 'south', 'pressure')
    north = _group_level(tables, 'north', 'pressure')
    if south is not None and north is not None:
        out['n_south_minus_north'] = (south - north).reindex(hours)
    wind = _group_level(tables, 'west', 'wind')
    col('n_west_wind', None if wind is None else wind.rolling(3, min_periods=2).mean())
    col('n_west_temp', _group_level(tables, 'west', 'temp'))
    # The three hours before this one: the report for this hour is often not out yet at 18:00.
    rain = [t['rain'].shift(1).rolling(3, min_periods=3).sum() for t in tables.values() if t['rain'].notna().any()]
    if rain:
        out['n_rain_3h'] = pd.concat(rain, axis=1).mean(axis=1).reindex(hours)
    return out.astype(float)


def add_neighbours(evenings: pd.DataFrame, rows: pd.DataFrame, neighbours: pd.DataFrame,
                   hourly: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """The evening and hourly tables with neighbour inputs joined on (at each row's issue hour)."""
    ev = evenings
    if len(evenings):
        issue = pd.DatetimeIndex(evenings['issue_hour'])
        f = features(neighbours, issue, hourly['pressure'])
        ev = evenings.join(pd.DataFrame(f.to_numpy(), index=evenings.index, columns=NEIGHBOUR_FEATURES))
    hr = rows.join(features(neighbours, pd.DatetimeIndex(rows.index), hourly['pressure'])) if len(rows) else rows
    return ev, hr



def sync_neighbours(source, archive, first: str, today: pd.Timestamp | None = None,
                    log=lambda _: None) -> list[str]:
    """Fetch the months of neighbour readings the archive is missing or that may still change,
    up to yesterday (UTC). `source` is a NeighbourObservations, `archive` a NeighbourArchive."""
    today = (today or pd.Timestamp.now(tz='UTC')).floor('D')
    last_day = today - pd.Timedelta(days=1)
    stored = archive.months(source.name)
    fetched = []
    for month_start in pd.date_range(pd.Timestamp(first, tz='UTC').replace(day=1), last_day, freq='MS'):
        month = f'{month_start:%Y-%m}'
        if stored.get(month, {}).get('complete'):
            continue
        month_end = month_start + pd.offsets.MonthEnd(0)
        # Whole months only, so a month marked complete really is.
        frame = source.hourly(f'{month_start:%Y-%m-%d}', f'{min(month_end, last_day):%Y-%m-%d}')
        # Late corrections and monthly uploads settle within a few weeks.
        complete = today > month_end + pd.Timedelta(days=35)
        archive.save_month(source.name, month, frame, complete)
        log(f'{source.name} {month}: {len(frame):,} readings from {frame["site"].nunique()} sites')
        fetched.append(month)
    return fetched
