import json
import sqlite3

import numpy as np
import pandas as pd
import pytest

from synthetic import write_db
from wxml.data import dew_point, load_hourly


def small_weather(hours=48):
    idx = pd.date_range('2024-03-01', periods=hours, freq='h', tz='UTC')
    return pd.DataFrame({
        'temp': np.linspace(5, 10, hours), 'rh': 80.0, 'pressure': 1010.0, 'wind': 2.0,
        'gust': 5.0, 'direction': 225.0, 'rain': 0.0, 'solar': 0.0,
    }, index=idx)


@pytest.fixture
def small_db(tmp_path):
    w = small_weather()
    w.loc['2024-03-01 05:00', 'rain'] = 1.0
    return write_db(tmp_path / 'small.db', w, interval_minutes=15,
                    outages=[('2024-03-01 10:00', '2024-03-01 13:00')])


def test_rain_is_summed_within_the_hour(small_db):
    _, hourly = load_hourly(small_db)
    assert hourly.loc['2024-03-01 05:00', 'rain'] == pytest.approx(1.0)
    assert hourly.loc['2024-03-01 06:00', 'rain'] == 0


def test_outage_hours_are_explicit_and_empty(small_db):
    _, hourly = load_hourly(small_db)
    gap = hourly.loc['2024-03-01 10:00':'2024-03-01 12:00']
    assert len(gap) == 3
    assert gap['outage'].all()
    assert gap['temp'].isna().all() and gap['rain'].isna().all()
    assert not hourly.loc['2024-03-01 13:00', 'outage']


def test_barometer_readings_merge_with_the_iss(small_db):
    _, hourly = load_hourly(small_db)
    assert hourly['pressure'].dropna().eq(1010.0).all()
    assert hourly.loc['2024-03-01 00:00', 'records'] == 4


def test_dew_point_is_derived_when_missing(small_db):
    _, hourly = load_hourly(small_db)
    row = hourly.loc['2024-03-01 00:00']
    assert row['dew'] == pytest.approx(float(dew_point(pd.Series([row['temp']]), pd.Series([80.0]))[0]))
    assert row['dew'] < row['temp']


def test_wind_direction_is_encoded_as_a_circle(small_db):
    _, hourly = load_hourly(small_db)
    row = hourly.loc['2024-03-01 00:00']
    assert np.degrees(np.arctan2(row['wind_dir_sin'], row['wind_dir_cos'])) % 360 == pytest.approx(225)


def test_live_polls_are_ignored(small_db):
    conn = sqlite3.connect(small_db)
    ts = int(pd.Timestamp('2024-03-01 05:30', tz='UTC').timestamp())
    m = {'temperature.outdoor': {'value': 99.0}, 'rain.interval': {'value': 50.0}}
    conn.execute("INSERT INTO observations VALUES ('live','1','iss',?,?,'current',?,'x')", (ts, ts, json.dumps(m)))
    conn.commit()
    conn.close()
    _, hourly = load_hourly(small_db)
    assert hourly['temp'].max() < 11
    assert hourly.loc['2024-03-01 05:00', 'rain'] == pytest.approx(1.0)


def test_database_is_opened_read_only(small_db):
    from wxml.data import connect_readonly
    conn = connect_readonly(small_db)
    with pytest.raises(sqlite3.OperationalError):
        conn.execute("DELETE FROM observations")
    conn.close()


def test_sensors_that_never_report_become_numeric_gaps(tmp_path):
    w = small_weather()
    w['solar'] = None
    db = write_db(tmp_path / 'nosolar.db', w)
    _, hourly = load_hourly(db)
    assert hourly['solar'].dtype == float
    assert hourly['solar'].isna().all()
