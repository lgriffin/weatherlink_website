import json

import numpy as np
import pandas as pd
import pytest

from wxml.adapters.guidance_files import GuidanceFiles
from wxml.forecasting.domain import GUIDANCE_COLUMNS, Location, empty_guidance
from wxml.forecasting.guidance import sync_guidance
from wxml.forecasting.mos import GUIDANCE_EVENING, GUIDANCE_HOURLY, evening_features, hourly_features
from wxml.forecasting.ports import GuidanceArchive
from wxml.models import GUIDED, TASKS
from wxml.predict import forecast

HERE = Location(53.35, -6.26)


def rows(model, hours, **values):
    frame = pd.DataFrame({'source': 's', 'model': model, 'lead_days': 1, 'hour': hours})
    for var in GUIDANCE_COLUMNS[4:]:
        v = values.get(var, np.nan)
        frame[var] = v if np.ndim(v) else float(v)
    return frame[GUIDANCE_COLUMNS]


def test_evening_windows_follow_local_time_and_average_the_models():
    # 18:00 Irish summer time is 17:00 UTC; the night runs to 09:00 (08:00 UTC).
    hours = pd.date_range('2025-07-01 12:00', '2025-07-03 00:00', freq='h', tz='UTC')
    temp = np.full(len(hours), 15.0)
    temp[hours.get_loc(pd.Timestamp('2025-07-02 03:00', tz='UTC'))] = 6.0   # 04:00 local: in the night
    temp[hours.get_loc(pd.Timestamp('2025-07-02 08:00', tz='UTC'))] = 2.0   # 09:00 local: daytime, not night
    a = rows('a', hours, temp=temp, rain=0.1)
    b = rows('b', hours, temp=temp + 2, rain=0.0)
    out = evening_features(pd.concat([a, b]), pd.Index(['2025-07-01']), 'Europe/Dublin').loc['2025-07-01']
    assert out['g_night_min'] == pytest.approx(7.0)          # (6 + 8) / 2
    assert out['g_night_min_spread'] == pytest.approx(2.0)
    assert out['g_day_max'] == pytest.approx(16.0)
    assert out['g_rain_24h'] == pytest.approx(1.2)           # model a: 24 h x 0.1 mm, b: 0
    assert out['g_wet_24h_share'] == pytest.approx(0.5)
    assert list(out.index) == GUIDANCE_EVENING


def test_windows_with_too_few_hours_stay_empty():
    hours = pd.date_range('2025-01-01 18:00', '2025-01-02 02:00', freq='h', tz='UTC')  # 9 of 15 night hours
    out = evening_features(rows('a', hours, temp=3.0), pd.Index(['2025-01-01']), 'Europe/Dublin')
    assert out['g_night_min'].isna().all()


def test_hourly_inputs_look_ahead_from_each_hour():
    hours = pd.date_range('2025-01-01', periods=40, freq='h', tz='UTC')
    rain = np.zeros(40)
    rain[3] = 0.5
    out = hourly_features(rows('a', hours, rain=rain, temp=np.arange(40.0), cloud=50.0), hours[:10])
    assert out.loc[hours[0], 'g_rain_6h'] == pytest.approx(0.5)   # hours 1-6 include hour 3
    assert out.loc[hours[3], 'g_rain_6h'] == pytest.approx(0.0)   # hours 4-9 don't
    assert out.loc[hours[0], 'g_wet_6h_share'] == 1.0
    assert out.loc[hours[2], 'g_temp_24h'] == 26.0
    assert list(out.columns) == GUIDANCE_HOURLY


def test_mixed_lead_times_are_refused():
    hours = pd.date_range('2025-01-01', periods=3, freq='h', tz='UTC')
    mixed = pd.concat([rows('a', hours, temp=1.0), rows('a', hours, temp=1.0).assign(lead_days=2)])
    with pytest.raises(ValueError, match='lead'):
        hourly_features(mixed, hours)


def test_guidance_files_round_trip_by_month(tmp_path):
    files = GuidanceFiles(tmp_path)
    assert isinstance(files, GuidanceArchive)
    hours = pd.date_range('2025-01-31 22:00', periods=4, freq='h', tz='UTC')
    jan, feb = rows('m', hours[:2], temp=1.234, rain=0.123), rows('m', hours[2:], temp=2.0)
    files.save_month('s', 1, '2025-01', jan, ['m'], complete=True)
    files.save_month('s', 1, '2025-02', feb, ['m', 'other'], complete=False)
    assert (tmp_path / 's' / 'lead1' / '2025-01.csv').exists()
    assert files.months('s', 1) == {'2025-01': {'models': {'m'}, 'complete': True},
                                    '2025-02': {'models': {'m', 'other'}, 'complete': False}}
    loaded = files.load('s', 1)
    assert list(loaded.columns) == GUIDANCE_COLUMNS and len(loaded) == 4
    assert loaded['temp'].iloc[0] == 1.2 and loaded['rain'].iloc[0] == 0.12   # rounded to what models resolve
    assert np.isnan(loaded['pressure']).all()                                   # missing stays missing
    only_feb = files.load('s', 1, '2025-02-01', '2025-02-01')
    assert len(only_feb) == 2 and only_feb['hour'].min() == hours[2]
    assert files.load('other', 1).empty and files.load('s', 2).empty


class MonthSource:
    name = 'fake'

    def __init__(self):
        self.asked = []

    def latest(self, location, models, hours=72, past_hours=0):
        raise NotImplementedError

    def as_issued(self, location, models, start, end, lead_days=1):
        self.asked.append((start, end, tuple(models)))
        hours = pd.date_range(start, pd.Timestamp(end) + pd.Timedelta(hours=23), freq='h', tz='UTC')
        return pd.concat([rows(m, hours, temp=5.0).assign(source='fake') for m in models])


def test_sync_fetches_what_is_missing_up_to_yesterday(tmp_path):
    source, files = MonthSource(), GuidanceFiles(tmp_path)
    today = pd.Timestamp('2025-03-10', tz='UTC')
    fetched = sync_guidance(source, files, HERE, ['a'], first='2025-01-15', today=today)
    assert fetched == ['2025-01', '2025-02', '2025-03']
    assert source.asked[0][:2] == ('2025-01-15', '2025-01-31')
    assert source.asked[-1][:2] == ('2025-03-01', '2025-03-09')
    assert not files.months('fake', 1)['2025-03']['complete']

    # Next day: only the month still filling in is fetched again.
    source.asked.clear()
    assert sync_guidance(source, files, HERE, ['a'], first='2025-01-15', today=today + pd.Timedelta(days=1)) == ['2025-03']
    # A new model is fetched for every month, together with the ones already kept.
    source.asked.clear()
    fetched = sync_guidance(source, files, HERE, ['b'], first='2025-01-15', today=today + pd.Timedelta(days=1))
    assert fetched == ['2025-01', '2025-02', '2025-03'] and source.asked[:2] == [
        ('2025-01-15', '2025-01-31', ('a',)), ('2025-01-15', '2025-01-31', ('b',))]
    assert set(files.load('fake', 1)['model']) == {'a', 'b'}


def test_sync_keeps_going_past_one_failing_model_but_not_a_dead_source(tmp_path):
    class Flaky(MonthSource):
        def __init__(self, broken):
            super().__init__()
            self.broken = broken

        def as_issued(self, location, models, start, end, lead_days=1):
            if models[0] in self.broken:
                raise RuntimeError('Could not reach Open-Meteo: timed out')
            return super().as_issued(location, models, start, end, lead_days)

    files, today = GuidanceFiles(tmp_path), pd.Timestamp('2025-06-10', tz='UTC')
    lines = []
    sync_guidance(Flaky({'b'}), files, HERE, ['a', 'b'], first='2025-01-01', today=today, give_up_after=10,
                  log=lines.append)
    months = files.months('fake', 1)
    assert months['2025-01'] == {'models': {'a'}, 'complete': False}   # b is tried again next time
    assert any('2025-01 b: Could not reach' in line for line in lines)
    with pytest.raises(RuntimeError):
        sync_guidance(Flaky({'a', 'b'}), GuidanceFiles(tmp_path / 'other'), HERE, ['a', 'b'],
                      first='2025-01-01', today=today)
    # When b comes back, the month gets both, and keeps a.
    sync_guidance(Flaky(set()), files, HERE, ['a', 'b'], first='2025-01-01', today=today)
    assert files.months('fake', 1)['2025-01'] == {'models': {'a', 'b'}, 'complete': True}


def test_sync_does_not_count_a_model_that_returned_nothing(tmp_path):
    class Empty(MonthSource):
        def as_issued(self, location, models, start, end, lead_days=1):
            if models[0] == 'b':
                return empty_guidance()
            return super().as_issued(location, models, start, end, lead_days)

    files = GuidanceFiles(tmp_path)
    sync_guidance(Empty(), files, HERE, ['a', 'b'], first='2025-01-01', today=pd.Timestamp('2025-06-10', tz='UTC'))
    assert files.months('fake', 1)['2025-01'] == {'models': {'a'}, 'complete': False}


def test_cloud_ahead_counts_cloud_hours_not_rain_hours():
    hours = pd.date_range('2025-07-01', periods=12, freq='h', tz='UTC')
    rain = np.zeros(12)
    cloud = np.full(12, 50.0)
    rain[1:7] = np.nan        # no rain figures for the next six hours, but cloud is all there
    out = hourly_features(rows('a', hours, rain=rain, cloud=cloud), hours[:1])
    assert out['g_cloud_6h'].iloc[0] == pytest.approx(50.0)
    assert np.isnan(out['g_rain_6h'].iloc[0])


def test_guided_models_learn_the_correction(trained):
    out, report = trained
    tasks = report['tasks']
    manifest = json.loads((out / 'models' / 'manifest.json').read_text())
    for task in TASKS:
        guided = tasks[task.name + GUIDED]
        assert 'skipped' not in guided, task.name
        # Scored on the same held-out days as the station-only model and the raw guidance.
        assert guided['skill']['vs_station_only'] > 0.2, task.name
        assert 'vs_guidance' in guided['skill']
        assert manifest[task.name + GUIDED]['use'] is True
    # The made-up models run warm or cold by day: the correction should beat them outright.
    assert tasks['day_max' + GUIDED]['skill']['vs_guidance'] > 0
    assert 'station_only' in tasks['night_min' + GUIDED]['frost_tonight']['brier']


def test_forecast_uses_guided_models_only_when_given_guidance(synthetic_db, trained, guidance, tables):
    out, _ = trained
    date = tables['evening'].index[-10]   # the guidance covers its night and next day
    plain = forecast(synthetic_db, out / 'models', date=date)
    assert plain['models']['night_min'] == 'night_min' and plain['guidance'] is None
    guided = forecast(synthetic_db, out / 'models', date=date, guidance=guidance)
    assert guided['models']['night_min'] == 'night_min' + GUIDED
    assert set(guided['guidance']) == {'warm_model', 'cool_model'}
    warm, cool = guided['guidance']['warm_model']['night_min'], guided['guidance']['cool_model']['night_min']
    assert warm > cool


def test_forecast_falls_back_where_guidance_does_not_cover_the_night(synthetic_db, trained, guidance):
    out, _ = trained
    station_only = {'night_min', 'day_max', 'rain_next_24h', 'rain_next_6h'}
    assert set(forecast(synthetic_db, out / 'models', guidance=empty_guidance())['models'].values()) == station_only
    # The latest evening's night runs past the end of the made-up guidance; its next 6 hours don't.
    used = forecast(synthetic_db, out / 'models', guidance=guidance)['models']
    assert used['night_min'] == 'night_min' and used['rain_next_24h'] == 'rain_next_24h'
    assert used['rain_next_6h'] == 'rain_next_6h' + GUIDED
