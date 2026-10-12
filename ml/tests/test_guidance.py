import urllib.parse

import numpy as np
import pandas as pd
import pytest

from wxml.adapters.ollama_narrator import OllamaNarrator
from wxml.adapters.open_meteo import VARIABLES, OpenMeteoForecastSource
from wxml.adapters.sqlite_store import SqliteObservationStore
from wxml.forecasting.domain import GUIDANCE_COLUMNS, Location
from wxml.forecasting.guidance import check_guidance, score_guidance
from wxml.forecasting.ports import ForecastSource, Narrator, ObservationStore

HERE = Location(53.3498, -6.2603, 20)


def body(times, models, lag='', values=None, suffix=True):
    hourly = {'time': [int(t.timestamp()) for t in times]}
    for i, model in enumerate(models):
        for ours, theirs in VARIABLES.items():
            key = f'{theirs}{lag}_{model}' if suffix else f'{theirs}{lag}'
            hourly[key] = (values or {}).get((model, ours), [float(i)] * len(times))
    return {'hourly': hourly}


class Recorder:
    def __init__(self, response):
        self.response = response
        self.urls = []

    def __call__(self, url):
        self.urls.append(url)
        return self.response


def query(url):
    return dict(urllib.parse.parse_qsl(urllib.parse.urlsplit(url).query))


def test_adapters_satisfy_the_ports(synthetic_db):
    assert isinstance(OpenMeteoForecastSource(), ForecastSource)
    assert isinstance(SqliteObservationStore(synthetic_db), ObservationStore)
    assert isinstance(OllamaNarrator('llama3.2:3b'), Narrator)


def test_as_issued_asks_for_day_ahead_runs_in_canonical_units():
    times = pd.date_range('2025-01-01', periods=3, freq='h', tz='UTC')
    fetch = Recorder(body(times, ['ecmwf_ifs025', 'icon_seamless'], lag='_previous_day1'))
    frame = OpenMeteoForecastSource(fetch).as_issued(HERE, ['ecmwf_ifs025', 'icon_seamless'],
                                                     '2025-01-01', '2025-01-01')
    q = query(fetch.urls[0])
    assert fetch.urls[0].startswith('https://previous-runs-api.open-meteo.com/')
    assert q['wind_speed_unit'] == 'ms' and q['timeformat'] == 'unixtime'
    assert q['latitude'] == '53.35' and q['longitude'] == '-6.26' and q['elevation'] == '20'
    assert 'temperature_2m_previous_day1' in q['hourly'].split(',')
    assert q['models'] == 'ecmwf_ifs025,icon_seamless'
    assert list(frame.columns) == GUIDANCE_COLUMNS
    assert set(frame['model']) == {'ecmwf_ifs025', 'icon_seamless'}
    assert (frame['lead_days'] == 1).all()
    assert (frame.loc[frame['model'] == 'icon_seamless', 'temp'].dropna() == 1.0).all()


def test_hour_sums_move_back_to_the_hour_they_cover():
    times = pd.date_range('2025-01-01 10:00', periods=2, freq='h', tz='UTC')
    values = {('m', 'rain'): [0.4, 1.2], ('m', 'temp'): [5.0, 6.0]}
    frame = OpenMeteoForecastSource(Recorder(body(times, ['m'], '_previous_day1', values, suffix=False))).as_issued(
        HERE, ['m'], '2025-01-01', '2025-01-01').set_index('hour')
    assert frame.loc[pd.Timestamp('2025-01-01 10:00', tz='UTC'), 'temp'] == 5.0
    assert frame.loc[pd.Timestamp('2025-01-01 09:00', tz='UTC'), 'rain'] == 0.4
    assert frame.loc[pd.Timestamp('2025-01-01 10:00', tz='UTC'), 'rain'] == 1.2


def test_as_issued_covers_exactly_the_dates_asked_for():
    times = pd.date_range('2025-01-01 00:00', '2025-01-03 00:00', freq='h', tz='UTC')
    rain = {('m', 'rain'): list(range(len(times)))}
    fetch = Recorder(body(times, ['m'], '_previous_day1', rain, suffix=False))
    frame = OpenMeteoForecastSource(fetch).as_issued(HERE, ['m'], '2025-01-01', '2025-01-02').set_index('hour')
    assert query(fetch.urls[0])['end_date'] == '2025-01-03'
    assert frame.index.min() == pd.Timestamp('2025-01-01 00:00', tz='UTC')
    assert frame.index.max() == pd.Timestamp('2025-01-02 23:00', tz='UTC')
    # The day's last hour gets the rain Open-Meteo stamps at the next midnight.
    assert frame.loc[pd.Timestamp('2025-01-02 23:00', tz='UTC'), 'rain'] == len(times) - 1


def test_missing_values_stay_missing_and_empty_models_are_dropped():
    times = pd.date_range('2025-01-01', periods=2, freq='h', tz='UTC')
    response = body(times, ['a', 'b'], '_previous_day1')
    for theirs in VARIABLES.values():
        response['hourly'][f'{theirs}_previous_day1_b'] = [None, None]
    response['hourly']['temperature_2m_previous_day1_a'] = [None, 3.0]
    frame = OpenMeteoForecastSource(Recorder(response)).as_issued(HERE, ['a', 'b'], '2025-01-01', '2025-01-01')
    assert set(frame['model']) == {'a'}
    temp = frame.set_index('hour')['temp']
    assert np.isnan(temp[times[0]]) and temp[times[1]] == 3.0


def test_latest_keeps_only_the_hours_asked_for():
    now = pd.Timestamp.now(tz='UTC').floor('h')
    times = pd.date_range(now - pd.Timedelta(hours=5), periods=40, freq='h')
    frame = OpenMeteoForecastSource(Recorder(body(times, ['m'], suffix=False))).latest(HERE, ['m'], hours=12)
    assert frame['hour'].min() >= now and frame['hour'].max() < now + pd.Timedelta(hours=12)
    assert (frame['lead_days'] == 0).all()


def test_errors_are_reported():
    with pytest.raises(RuntimeError, match='bad model'):
        OpenMeteoForecastSource(Recorder({'error': True, 'reason': 'bad model'})).latest(HERE, ['x'])
    with pytest.raises(ValueError):
        OpenMeteoForecastSource(Recorder({})).as_issued(HERE, ['x'], '2025-01-01', '2025-01-02', lead_days=9)


def guidance_from(hourly, model, temp_bias, lead=1):
    g = hourly.loc[~hourly['outage'], ['temp', 'rain', 'wind']].copy()
    g['temp'] += temp_bias
    g = g.reset_index().rename(columns={'index': 'hour'})
    g.insert(0, 'lead_days', lead)
    g.insert(0, 'model', model)
    g.insert(0, 'source', 'fake')
    return g


def test_scores_show_each_models_bias(tables):
    hourly = tables['hourly']
    guidance = pd.concat([guidance_from(hourly, 'warm', 1.5), guidance_from(hourly, 'exact', 0.0)])
    scores = score_guidance(hourly, guidance).set_index(['model', 'variable'])
    assert scores.loc[('warm', 'temp'), 'bias'] == pytest.approx(1.5)
    assert scores.loc[('warm', 'temp'), 'mae'] == pytest.approx(1.5)
    assert scores.loc[('exact', 'temp'), 'mae'] == pytest.approx(0.0)
    assert scores.loc[('exact', 'temp'), 'skill'] == pytest.approx(1.0)
    assert scores.loc[('warm', 'temp'), 'persistence_mae'] > 0
    assert scores.loc[('warm', 'temp'), 'hours'] == int((~hourly['outage']).sum())


def test_skill_compares_model_and_persistence_over_the_same_hours():
    hours = pd.date_range('2025-01-01', periods=72, freq='h', tz='UTC')
    hourly = pd.DataFrame({'temp': 10.0, 'outage': False}, index=hours)
    hourly.loc[hours[:24], 'temp'] = np.nan  # no reading a day before the second day
    hourly.loc[hours[:24], 'outage'] = True
    hourly.loc[hours[48:], 'temp'] = 12.0    # persistence misses by 2 on the third day only
    guidance = pd.DataFrame({'source': 'fake', 'model': 'm', 'lead_days': 1, 'hour': hours[24:],
                             'temp': hourly['temp'][24:].to_numpy() + 1.0})
    guidance.loc[guidance['hour'] < hours[48], 'temp'] += 5  # big misses where persistence can't be scored
    row = score_guidance(hourly, guidance).set_index('variable').loc['temp']
    assert row['hours'] == 48 and row['mae'] == pytest.approx(3.5)
    # Only the third day has a reading a day earlier: persistence misses by 2, the model by 1.
    assert row['persistence_mae'] == pytest.approx(2.0)
    assert row['skill'] == pytest.approx(0.5)


class FakeSource:
    name = 'fake'

    def __init__(self, hourly):
        self.hourly = hourly
        self.asked = None

    def latest(self, location, models, hours=72):
        raise NotImplementedError

    def as_issued(self, location, models, start, end, lead_days=1):
        self.asked = (location, start, end, lead_days)
        window = self.hourly.loc[start:end]
        return pd.concat([guidance_from(window, m, 0.5, lead_days) for m in models])


def test_check_guidance_scores_the_last_days_at_the_stations_position(synthetic_db, tables):
    source = FakeSource(tables['hourly'])
    station, scores = check_guidance(SqliteObservationStore(synthetic_db), source, ['a', 'b'], days=30)
    location, start, end, lead = source.asked
    assert (location.latitude, location.longitude) == (station.latitude, station.longitude)
    assert (pd.Timestamp(end) - pd.Timestamp(start)).days == 29 and lead == 1
    temp = scores[scores['variable'] == 'temp'].set_index('model')
    assert np.allclose(temp['bias'], 0.5)


def test_guidance_wants_both_coordinates_or_neither():
    from wxml.__main__ import main
    with pytest.raises(SystemExit, match='both --lat and --lon'):
        main(['guidance', '--lat', '53.3'])
    with pytest.raises(SystemExit, match='both --lat and --lon'):
        main(['guidance-check', '--lon', '-6.3'])
