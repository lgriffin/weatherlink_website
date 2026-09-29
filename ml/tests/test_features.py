import numpy as np
import pandas as pd
import pytest

from wxml.data import Station
from wxml.features import FEATURES, build_features, clear_sky_radiation, evening_table, hourly_targets

STATION = Station('1', 'Test', 'Europe/Dublin', 53.3, -6.3)


def flat_hourly(start='2024-01-10', days=4, temp=5.0):
    idx = pd.date_range(pd.Timestamp(start, tz='UTC'), periods=days * 24, freq='h')
    h = pd.DataFrame({
        'temp': temp, 'temp_hi': temp, 'temp_lo': temp, 'dew': 2.0, 'rh': 80.0, 'pressure': 1010.0,
        'wind': 2.0, 'gust': 4.0, 'wind_dir_sin': 0.0, 'wind_dir_cos': 1.0, 'solar': 0.0,
        'rain': 0.0, 'records': 4, 'outage': False,
    }, index=idx)
    h.index.name = 'hour'
    return h


def test_features_never_look_ahead(tables):
    hourly = tables['hourly']
    cut = hourly.index[len(hourly) // 2]
    changed = hourly.copy()
    changed.loc[changed.index > cut, ['temp', 'pressure', 'rain', 'solar']] += 7
    before = build_features(hourly, tables['station']).loc[:cut, FEATURES]
    after = build_features(changed, tables['station']).loc[:cut, FEATURES]
    pd.testing.assert_frame_equal(before, after)


def test_night_low_uses_18_to_09_local_time():
    h = flat_hourly()
    # Winter, so local time is UTC. 03:00 on the 11th is in the night of the 10th.
    h.loc['2024-01-11 03:00', 'temp_lo'] = -1.5
    # 10:00 on the 11th is after the window closes.
    h.loc['2024-01-11 10:00', 'temp_lo'] = -4.0
    table = evening_table(h, build_features(h, STATION), STATION)
    assert table.loc['2024-01-10', 'night_min'] == -1.5
    assert table.loc['2024-01-10', 'night_min_hour'] == 3
    assert table.loc['2024-01-10', 'frost'] == 1
    assert table.loc['2024-01-11', 'prev_night_min'] == -1.5


def test_night_low_follows_summer_time():
    h = flat_hourly(start='2024-07-10')
    # 17:30 UTC is 18:30 Irish summer time: inside the night window.
    h.loc['2024-07-10 17:00', 'temp_lo'] = 1.0
    # 08:00 UTC is 09:00 local the next morning: outside it.
    h.loc['2024-07-11 08:00', 'temp_lo'] = -3.0
    table = evening_table(h, build_features(h, STATION), STATION)
    assert table.loc['2024-07-10', 'night_min'] == 1.0


def test_nights_with_an_outage_have_no_target():
    h = flat_hourly()
    h.loc['2024-01-10 20:00':'2024-01-10 23:00', 'outage'] = True
    table = evening_table(h, build_features(h, STATION), STATION)
    assert np.isnan(table.loc['2024-01-10', 'night_min'])
    assert np.isnan(table.loc['2024-01-10', 'frost'])
    assert table.loc['2024-01-11', 'night_min'] == 5.0


def test_rain_target_needs_all_six_hours():
    h = flat_hourly()
    h.loc['2024-01-10 03:00', 'rain'] = 0.4
    h.loc['2024-01-11 03:00', 'outage'] = True
    rows = hourly_targets(h, build_features(h, STATION))
    assert rows.loc['2024-01-10 00:00', 'wet_next_6h'] == 1
    assert rows.loc['2024-01-10 03:00', 'wet_next_6h'] == 0  # the rain is in this hour, not the next six
    assert np.isnan(rows.loc['2024-01-11 00:00', 'rain_next_6h'])


def test_clear_sky_is_dark_at_night_and_bright_at_noon():
    hours = pd.DatetimeIndex(['2024-06-21 00:00', '2024-06-21 12:00', '2024-12-21 12:00'], tz='UTC')
    night, summer, winter = clear_sky_radiation(hours, 53.3, -6.3)
    assert night == 0
    assert 700 < summer < 950
    assert 100 < winter < summer / 2


def test_outage_is_flagged_in_the_synthetic_archive(tables):
    assert tables['hourly'].loc['2024-02-11', 'outage'].all()
    assert '2024-02-11' not in tables['evening'].index
