"""Guidance as model inputs (MOS, model output statistics).

The big weather models know what is coming in from the Atlantic; the station
knows this spot. Giving the station's models what the weather models said
(as it was issued) lets them learn the local correction: "ECMWF says 3 °C,
which here means 1 °C".

Each weather model is summarised over the same windows the station's targets
use (tonight 18:00 to 09:00 local, tomorrow 09:00 to 18:00, 18:00 to 18:00,
the next 6 hours, this hour tomorrow). The inputs are the average of the
models and how far apart they are: when they disagree, the forecast is less
certain. Pure functions, no I/O.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

# Per-model summaries for each evening (18:00 local).
EVENING_SUMMARIES = ['night_min', 'day_max', 'rain_24h', 'cloud_night', 'wind_night', 'dew_night', 'gust_24h']

# Evening inputs: the models' average, plus spread and agreement where they matter.
GUIDANCE_EVENING = [
    'g_night_min', 'g_night_min_spread', 'g_day_max', 'g_day_max_spread',
    'g_rain_24h', 'g_wet_24h_share', 'g_cloud_night', 'g_wind_night', 'g_dew_night', 'g_gust_24h',
]
# Hourly inputs, for the rain-in-6-hours and temperature-in-24-hours tasks.
GUIDANCE_HOURLY = ['g_rain_6h', 'g_wet_6h_share', 'g_cloud_6h', 'g_temp_24h', 'g_temp_24h_spread']

WET_MM = 0.2
MIN_COVERAGE = 0.9


def by_model(guidance: pd.DataFrame) -> dict[str, pd.DataFrame]:
    """One hourly table per weather model (UTC hour index, every hour filled in)."""
    if guidance.empty:
        return {}
    if guidance[['source', 'lead_days']].drop_duplicates().shape[0] > 1:
        raise ValueError('guidance mixes sources or lead times; pass one at a time')
    out = {}
    for model, g in guidance.groupby('model', sort=True):
        g = g.drop_duplicates('hour', keep='last').set_index('hour').sort_index()
        full = pd.date_range(g.index.min(), g.index.max(), freq='h', tz='UTC')
        out[str(model)] = g.drop(columns=['source', 'model', 'lead_days']).reindex(full)
    return out


def _local_bounds(dates: pd.Index, tz: str, start_h: int, end_h: int) -> tuple[pd.DatetimeIndex, pd.DatetimeIndex]:
    """UTC bounds of [date + start_h, date + end_h) in local time, for each date."""
    days = pd.DatetimeIndex(pd.to_datetime(dates))
    def at(hours):
        return (days + pd.Timedelta(hours=hours)).tz_localize(
            tz, nonexistent='shift_forward', ambiguous=True).tz_convert('UTC')
    return at(start_h), at(end_h)


def _window_stat(series: pd.Series, starts: pd.DatetimeIndex, ends: pd.DatetimeIndex, how: str) -> np.ndarray:
    """`how` (min, max, sum, mean) of series over each [start, end), NaN unless well covered."""
    index = series.index
    values = series.to_numpy(dtype=float)
    lo = index.searchsorted(starts)
    hi = index.searchsorted(ends)
    expected = ((ends - starts) / pd.Timedelta(hours=1)).to_numpy()
    out = np.full(len(starts), np.nan)
    for i, (a, b) in enumerate(zip(lo, hi)):
        chunk = values[a:b]
        known = chunk[~np.isnan(chunk)]
        if expected[i] <= 0 or len(known) < MIN_COVERAGE * expected[i]:
            continue
        out[i] = getattr(np, how)(known)
    return out


def evening_by_model(guidance: pd.DataFrame, dates: pd.Index, tz: str) -> pd.DataFrame:
    """One row per (date, model): what that model said about the evening's windows."""
    night = _local_bounds(dates, tz, 18, 33)
    day = _local_bounds(dates, tz, 33, 42)
    next24 = _local_bounds(dates, tz, 18, 42)
    frames = []
    for model, g in by_model(guidance).items():
        frames.append(pd.DataFrame({
            'date': list(dates), 'model': model,
            'night_min': _window_stat(g['temp'], *night, 'min'),
            'day_max': _window_stat(g['temp'], *day, 'max'),
            'rain_24h': _window_stat(g['rain'], *next24, 'sum'),
            'cloud_night': _window_stat(g['cloud'], *night, 'mean'),
            'wind_night': _window_stat(g['wind'], *night, 'mean'),
            'dew_night': _window_stat(g['dew'], *night, 'mean'),
            'gust_24h': _window_stat(g['gust'], *next24, 'max'),
        }))
    if not frames:
        return pd.DataFrame(columns=['date', 'model', *EVENING_SUMMARIES])
    return pd.concat(frames, ignore_index=True)


def evening_features(guidance: pd.DataFrame, dates: pd.Index, tz: str) -> pd.DataFrame:
    """GUIDANCE_EVENING for each date (rows indexed by date; NaN where no model covered it)."""
    per = evening_by_model(guidance, dates, tz)
    out = pd.DataFrame(index=pd.Index(list(dates), name='date'), columns=GUIDANCE_EVENING, dtype=float)
    if per.empty:
        return out
    g = per.groupby('date')
    for name in ('night_min', 'day_max', 'rain_24h', 'cloud_night', 'wind_night', 'dew_night', 'gust_24h'):
        out[f'g_{name}'] = g[name].mean()
    out['g_night_min_spread'] = g['night_min'].max() - g['night_min'].min()
    out['g_day_max_spread'] = g['day_max'].max() - g['day_max'].min()
    wet = per.assign(wet=(per['rain_24h'] >= WET_MM).astype(float).where(per['rain_24h'].notna()))
    out['g_wet_24h_share'] = wet.groupby('date')['wet'].mean()
    return out.astype(float)


def hourly_features(guidance: pd.DataFrame, hours: pd.DatetimeIndex) -> pd.DataFrame:
    """GUIDANCE_HOURLY for each UTC hour: the next 6 hours and this hour tomorrow."""
    rain6, cloud6, temp24 = [], [], []
    for g in by_model(guidance).values():
        ahead = pd.concat([g['rain'].shift(-k) for k in range(1, 7)], axis=1)
        rain6.append(ahead.sum(axis=1, min_count=6).reindex(hours))
        cloud6.append(pd.concat([g['cloud'].shift(-k) for k in range(1, 7)], axis=1)
                      .mean(axis=1).where(ahead.notna().sum(axis=1) >= 5).reindex(hours))
        temp24.append(g['temp'].shift(-24).reindex(hours))
    out = pd.DataFrame(index=hours, columns=GUIDANCE_HOURLY, dtype=float)
    if not rain6:
        return out
    rain = pd.concat(rain6, axis=1)
    temp = pd.concat(temp24, axis=1)
    out['g_rain_6h'] = rain.mean(axis=1)
    out['g_wet_6h_share'] = (rain >= WET_MM).astype(float).where(rain.notna()).mean(axis=1)
    out['g_cloud_6h'] = pd.concat(cloud6, axis=1).mean(axis=1)
    out['g_temp_24h'] = temp.mean(axis=1)
    out['g_temp_24h_spread'] = temp.max(axis=1) - temp.min(axis=1)
    return out.astype(float)


def add_guidance(evenings: pd.DataFrame, rows: pd.DataFrame, guidance: pd.DataFrame,
                 tz: str) -> tuple[pd.DataFrame, pd.DataFrame]:
    """The evening and hourly tables with guidance inputs joined on (NaN where there was none)."""
    ev = evenings.join(evening_features(guidance, evenings.index, tz)) if len(evenings) else evenings
    hr = rows.join(hourly_features(guidance, rows.index)) if len(rows) else rows
    return ev, hr
