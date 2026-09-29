"""Turn the hourly table into model inputs ("the situation now") and targets
("what happened next").

Every feature on a row uses only readings up to the end of that row's hour,
so a model trained on them never sees the future.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from .data import Station

FEATURES = [
    'temp', 'dew', 'dew_depression', 'rh', 'pressure', 'wind', 'gust', 'solar', 'rain',
    'pressure_change_1h', 'pressure_change_3h', 'pressure_change_12h',
    'temp_change_3h', 'rh_change_3h', 'dew_change_3h',
    'rain_3h', 'rain_24h', 'temp_max_24h', 'temp_min_24h', 'gust_max_6h',
    'clearness_6h', 'wind_dir_sin', 'wind_dir_cos',
    'hour_sin', 'hour_cos', 'doy_sin', 'doy_cos',
]

# A day counts as usable when at least this share of the hours we need were recorded.
MIN_COVERAGE = 0.9

WET_MM = 0.2


def clear_sky_radiation(hours_utc: pd.DatetimeIndex, latitude: float, longitude: float) -> np.ndarray:
    """Rough clear-sky global radiation (W/m²) at the middle of each hour.

    Good enough to say "the sky was clear" (measured ≈ clear-sky) or "overcast"
    (measured far below it); not a precise solar model.
    """
    t = hours_utc + pd.Timedelta(minutes=30)
    doy = t.dayofyear.to_numpy()
    gamma = 2 * np.pi / 365 * (doy - 1 + (t.hour.to_numpy() - 12) / 24)
    decl = (0.006918 - 0.399912 * np.cos(gamma) + 0.070257 * np.sin(gamma)
            - 0.006758 * np.cos(2 * gamma) + 0.000907 * np.sin(2 * gamma))
    eqtime = 229.18 * (0.000075 + 0.001868 * np.cos(gamma) - 0.032077 * np.sin(gamma)
                       - 0.014615 * np.cos(2 * gamma) - 0.040849 * np.sin(2 * gamma))
    minutes = t.hour.to_numpy() * 60 + t.minute.to_numpy()
    solar_time = minutes + eqtime + 4 * longitude
    hour_angle = np.deg2rad(solar_time / 4 - 180)
    lat = np.deg2rad(latitude)
    cos_zenith = np.sin(lat) * np.sin(decl) + np.cos(lat) * np.cos(decl) * np.cos(hour_angle)
    cos_zenith = np.clip(cos_zenith, 0, 1)
    with np.errstate(divide='ignore', over='ignore'):
        ghi = 1098 * cos_zenith * np.exp(-0.057 / np.where(cos_zenith > 0, cos_zenith, np.inf))
    return np.where(cos_zenith > 0.02, ghi, 0.0)


def _rolling(series: pd.Series, hours: int, how: str) -> pd.Series:
    roll = series.rolling(hours, min_periods=max(1, int(np.ceil(hours * 0.75))))
    return getattr(roll, how)()


def build_features(hourly: pd.DataFrame, station: Station) -> pd.DataFrame:
    """One row per hour, indexed like `hourly`, with FEATURES plus `local` time and `outage`."""
    h = hourly
    f = pd.DataFrame(index=h.index)
    for col in ('temp', 'dew', 'rh', 'pressure', 'wind', 'gust', 'solar', 'rain', 'wind_dir_sin', 'wind_dir_cos'):
        f[col] = h[col]
    f['dew_depression'] = h['temp'] - h['dew']

    f['pressure_change_1h'] = h['pressure'] - h['pressure'].shift(1)
    f['pressure_change_3h'] = h['pressure'] - h['pressure'].shift(3)
    f['pressure_change_12h'] = h['pressure'] - h['pressure'].shift(12)
    f['temp_change_3h'] = h['temp'] - h['temp'].shift(3)
    f['rh_change_3h'] = h['rh'] - h['rh'].shift(3)
    f['dew_change_3h'] = h['dew'] - h['dew'].shift(3)

    f['rain_3h'] = _rolling(h['rain'], 3, 'sum')
    f['rain_24h'] = _rolling(h['rain'], 24, 'sum')
    f['temp_max_24h'] = _rolling(h['temp_hi'], 24, 'max')
    f['temp_min_24h'] = _rolling(h['temp_lo'], 24, 'min')
    f['gust_max_6h'] = _rolling(h['gust'], 6, 'max')

    if station.latitude is not None and station.longitude is not None:
        clear = pd.Series(clear_sky_radiation(h.index, station.latitude, station.longitude), index=h.index)
        measured = _rolling(h['solar'], 6, 'sum')
        possible = clear.rolling(6, min_periods=1).sum()
        f['clearness_6h'] = (measured / possible).where(possible >= 150).clip(0, 1.2)
    else:
        f['clearness_6h'] = np.nan

    local = h.index.tz_convert(station.timezone)
    hour = local.hour.to_numpy() + 0.5
    doy = local.dayofyear.to_numpy()
    f['hour_sin'] = np.sin(2 * np.pi * hour / 24)
    f['hour_cos'] = np.cos(2 * np.pi * hour / 24)
    f['doy_sin'] = np.sin(2 * np.pi * doy / 365.25)
    f['doy_cos'] = np.cos(2 * np.pi * doy / 365.25)

    f['local'] = local
    f['doy'] = doy
    f['outage'] = h['outage']
    return f


def _window(hourly: pd.DataFrame, tz: str, start_local: pd.Timestamp, end_local: pd.Timestamp) -> pd.DataFrame:
    """Hours starting in [start_local, end_local), converted to UTC."""
    start = start_local.tz_localize(tz, nonexistent='shift_forward', ambiguous=True).tz_convert('UTC')
    end = end_local.tz_localize(tz, nonexistent='shift_forward', ambiguous=True).tz_convert('UTC')
    return hourly.loc[(hourly.index >= start) & (hourly.index < end)]


def _covered(window: pd.DataFrame, expected: int) -> bool:
    return expected > 0 and (~window['outage']).sum() >= MIN_COVERAGE * expected


def evening_table(hourly: pd.DataFrame, features: pd.DataFrame, station: Station) -> pd.DataFrame:
    """One row per local date, issued at 18:00 local.

    Inputs are the 17:00–18:00 hour. Targets:
    - night_min: lowest temperature from 18:00 to 09:00 next morning; frost = night_min ≤ 0
    - day_max: tomorrow's highest temperature (09:00–18:00)
    - rain_24h_next (wet_next_24h when ≥ 0.2 mm) and gust_24h_next: 18:00 to 18:00
    Targets are NaN when the window isn't covered well enough.
    """
    tz = station.timezone
    local_dates = pd.Series(features['local']).dt.date.unique() if len(features) else []
    rows = []
    for d in local_dates:
        day = pd.Timestamp(d)
        issue = _window(features, tz, day + pd.Timedelta(hours=17), day + pd.Timedelta(hours=18))
        if issue.empty or bool(issue['outage'].iloc[0]):
            continue
        row = issue.iloc[0][FEATURES].to_dict()
        row['date'] = day.strftime('%Y-%m-%d')
        row['doy'] = int(issue['doy'].iloc[0])
        row['issue_hour'] = issue.index[0]

        night = _window(hourly, tz, day + pd.Timedelta(hours=18), day + pd.Timedelta(hours=33))
        if _covered(night, 15):
            low = night['temp_lo']
            row['night_min'] = float(low.min())
            row['night_min_hour'] = int(low.idxmin().tz_convert(tz).hour)
            row['night_rain'] = float(night['rain'].sum())
        daytime = _window(hourly, tz, day + pd.Timedelta(hours=33), day + pd.Timedelta(hours=42))
        if _covered(daytime, 9):
            row['day_max'] = float(daytime['temp_hi'].max())
        next24 = _window(hourly, tz, day + pd.Timedelta(hours=18), day + pd.Timedelta(hours=42))
        if _covered(next24, 24):
            row['rain_24h_next'] = float(next24['rain'].sum())
            row['gust_24h_next'] = float(next24['gust'].max())
        rows.append(row)

    table = pd.DataFrame(rows)
    for col in ('night_min', 'night_min_hour', 'night_rain', 'day_max', 'rain_24h_next', 'gust_24h_next'):
        if col not in table:
            table[col] = np.nan
    if table.empty:
        return table
    table = table.set_index('date').sort_index()
    table['frost'] = (table['night_min'] <= 0).astype(float).where(table['night_min'].notna())
    table['wet_next_24h'] = (table['rain_24h_next'] >= WET_MM).astype(float).where(table['rain_24h_next'].notna())
    # Last night's low is known by 09:00, so it's a fair input (and the persistence baseline).
    previous = pd.Series(table['night_min'].to_numpy(), index=pd.to_datetime(table.index) + pd.Timedelta(days=1))
    table['prev_night_min'] = previous.reindex(pd.to_datetime(table.index)).to_numpy()
    return table


def hourly_targets(hourly: pd.DataFrame, features: pd.DataFrame) -> pd.DataFrame:
    """Hourly rows with `rain_next_6h` (mm, then `wet_next_6h`) and `temp_next_24h`."""
    t = features.loc[~features['outage'], FEATURES + ['doy', 'local']].copy()
    ok = ~hourly['outage']
    rain = hourly['rain'].where(ok)
    ahead = pd.concat([rain.shift(-k) for k in range(1, 7)], axis=1)
    rain_next = ahead.sum(axis=1, min_count=6)  # NaN unless all six hours were recorded
    t['rain_next_6h'] = rain_next.reindex(t.index)
    t['wet_next_6h'] = (t['rain_next_6h'] >= WET_MM).astype(float).where(t['rain_next_6h'].notna())
    t['temp_next_24h'] = hourly['temp'].where(ok).shift(-24).reindex(t.index)
    t['hour'] = t['local'].dt.hour
    return t


PREVIOUS_NIGHT_FEATURES = FEATURES + ['prev_night_min']
