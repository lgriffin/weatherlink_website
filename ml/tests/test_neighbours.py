import io
import json
import zipfile

import numpy as np
import pandas as pd
import pytest

from wxml.adapters.guidance_files import GuidanceFiles
from wxml.adapters.irish_buoys import IrishBuoys, parse_erddap_csv
from wxml.adapters.met_eireann import (MetEireannForecastSource, MetEireannObservations, parse_forecast,
                                       parse_history, parse_today)
from wxml.adapters.neighbour_files import NeighbourFiles
from wxml.forecasting.domain import GUIDANCE_COLUMNS, Location
from wxml.forecasting.guidance import keep_issued_guidance
from wxml.forecasting.neighbours import NEIGHBOUR_COLUMNS, NEIGHBOUR_FEATURES, features, sync_neighbours
from wxml.forecasting.ports import ForecastSource, NeighbourArchive, NeighbourObservations
from wxml.predict import forecast

ERDDAP = """station_id,time,AtmosphericPressure,AirTemperature,RelativeHumidity,WindSpeed,Gust,WindDirection
,UTC,millibars,degrees_C,percent,knots,knots,degrees_true
M3,2025-01-01T00:00:00Z,1001.5,10.2,88,20,30,225
M3,2025-01-01T01:00:00Z,9999,10.1,87,NaN,,230
M6,2025-01-01T00:00:00Z,998.0,11.0,90,30,40,240
M1,2025-01-01T00:00:00Z,1000.0,9.0,80,10,15,200
"""

HISTORY = """Station Name: VALENTIA OBSERVATORY
Station Height: 24 M
date:  -  Date and Time (utc)
rain:  -  Precipitation Amount (mm)

date,ind,rain,ind,temp,ind,wetb,dewpt,vappr,rhum,msl,ind,wdsp,ind,wddir,ww,w,sun,vis,clht,clamt
01-jan-2025 00:00,0,0.0,0,8.1,0,7.0,5.9,9.3,86,1010.2,2,10,2,230,2,11,0.0,25000,35,7
01-jan-2025 01:00,0,1.4,0,8.0,0,7.0,5.8,9.2,86,1009.8,2,12,2,240,61,11,0.0,25000,35,7
01-jan-2025 02:00,0,0.2,0,7.9,0,7.0,5.8,9.2,86, ,2,12,2,240,61,11,0.0,25000,35,7
"""

TODAY = [
    {'name': 'Valentia', 'temperature': '15', 'windSpeed': '36', 'windGust': '-', 'windDirection': 225,
     'humidity': '85', 'rainfall': '0.4', 'pressure': '1004', 'date': '01-07-2025', 'reportTime': '13:00'},
    {'name': 'Valentia', 'temperature': '16', 'windSpeed': '18', 'windGust': '54', 'windDirection': 230,
     'humidity': '84', 'rainfall': '0.0', 'pressure': '1003', 'date': '01-07-2025', 'reportTime': '14:00'},
]

FORECAST = b"""<?xml version="1.0"?>
<weatherdata><product class="pointData">
<time datatype="forecast" from="2025-01-01T18:00:00Z" to="2025-01-01T18:00:00Z"><location latitude="53.35" longitude="-6.26">
 <temperature id="TTT" unit="celsius" value="4.2"/><windDirection id="dd" deg="250.1" name="W"/>
 <windSpeed id="ff" mps="5.3" beaufort="3" name="x"/><windGust id="ff_gust" mps="9.1"/>
 <humidity value="88.0" unit="percent"/><pressure id="pr" unit="hPa" value="1012.4"/>
 <cloudiness id="NN" percent="40.0"/><dewpointTemperature id="TD" unit="celsius" value="2.3"/></location></time>
<time datatype="forecast" from="2025-01-01T18:00:00Z" to="2025-01-01T19:00:00Z"><location latitude="53.35" longitude="-6.26">
 <precipitation unit="mm" value="0.3" minvalue="0.1" maxvalue="0.5"/></location></time>
<time datatype="forecast" from="2025-01-01T18:00:00Z" to="2025-01-02T00:00:00Z"><location latitude="53.35" longitude="-6.26">
 <precipitation unit="mm" value="9.9"/></location></time>
<time datatype="forecast" from="2025-01-01T19:00:00Z" to="2025-01-01T19:00:00Z"><location latitude="53.35" longitude="-6.26">
 <temperature id="TTT" unit="celsius" value="3.9"/></location></time>
</product></weatherdata>"""


def test_adapters_satisfy_the_ports(tmp_path):
    assert isinstance(IrishBuoys(), NeighbourObservations)
    assert isinstance(MetEireannObservations(), NeighbourObservations)
    assert isinstance(MetEireannForecastSource(), ForecastSource)
    assert isinstance(NeighbourFiles(tmp_path), NeighbourArchive)


def test_buoy_readings_come_in_canonical_units():
    frame = parse_erddap_csv(ERDDAP, ['M3', 'M6'])
    assert list(frame.columns) == NEIGHBOUR_COLUMNS
    assert set(frame['site']) == {'M3', 'M6'}                    # retired M1 left out
    m3 = frame[frame['site'] == 'M3'].set_index('hour')
    assert m3['wind'].iloc[0] == pytest.approx(20 * 0.514444)     # knots to m/s
    assert np.isnan(m3['pressure'].iloc[1])                       # 9999 is not a pressure
    assert m3['rain'].isna().all()


def test_buoy_queries_are_encoded_for_erddap():
    urls = []
    IrishBuoys(lambda url: urls.append(url) or ERDDAP).hourly('2025-01-01', '2025-01-01')
    assert urls[0].startswith('https://erddap.marine.ie/erddap/tabledap/IWBNetwork.csv?station_id,time,')
    assert 'time%3E=2025-01-01T00:00:00Z' in urls[0] and 'time%3C2025-01-02T00:00:00Z' in urls[0]


def test_station_history_moves_rain_back_to_its_hour():
    frame = parse_history(HISTORY, 'valentia').set_index('hour')
    t0 = pd.Timestamp('2025-01-01 00:00', tz='UTC')
    assert frame.loc[t0, 'pressure'] == 1010.2 and frame.loc[t0, 'wind'] == pytest.approx(10 * 0.514444)
    assert frame.loc[t0, 'rain'] == 1.4                           # fell in the hour before 01:00
    assert np.isnan(frame.loc[t0 + pd.Timedelta(hours=2), 'pressure'])


def test_station_history_is_downloaded_once_per_station():
    body = io.BytesIO()
    with zipfile.ZipFile(body, 'w') as z:
        z.writestr('hly2275.csv', HISTORY)
    calls = []
    obs = MetEireannObservations(lambda url: calls.append(url) or body.getvalue(), stations={'valentia': 2275})
    assert len(obs.hourly('2025-01-01', '2025-01-01')) == 3
    obs.hourly('2025-01-01', '2025-01-01')
    assert calls == ['https://cli.fusio.net/cli/climate_data/webdata/hly2275.zip']


def test_todays_readings_are_local_time_in_kmh():
    frame = parse_today(TODAY, 'valentia').set_index('hour')
    t = pd.Timestamp('2025-07-01 12:00', tz='UTC')                 # 13:00 Irish summer time
    assert frame.loc[t, 'wind'] == pytest.approx(10.0)
    assert np.isnan(frame.loc[t, 'gust']) and frame.loc[t + pd.Timedelta(hours=1), 'gust'] == pytest.approx(15)
    assert frame.loc[t, 'rain'] == 0.0                            # the 14:00 report's last hour


def test_met_eireann_forecast_keeps_hourly_values():
    frame = parse_forecast(FORECAST).set_index('hour')
    t = pd.Timestamp('2025-01-01 18:00', tz='UTC')
    assert frame.loc[t, 'temp'] == 4.2 and frame.loc[t, 'wind'] == 5.3 and frame.loc[t, 'cloud'] == 40.0
    assert frame.loc[t, 'rain'] == 0.3                           # the 6-hour total is ignored
    assert np.isnan(frame.loc[t + pd.Timedelta(hours=1), 'rain'])
    assert set(frame['model']) == {'met_eireann'} and (frame['lead_days'] == 0).all()
    with pytest.raises(LookupError):
        MetEireannForecastSource().as_issued(Location(53, -6), [], '2025-01-01', '2025-01-01')


def readings(site, hours, pressure, **extra):
    frame = pd.DataFrame({'source': 's', 'site': site, 'hour': hours, 'pressure': pressure})
    for col in NEIGHBOUR_COLUMNS[3:]:
        if col != 'pressure':
            frame[col] = extra.get(col, np.nan)
    return frame[NEIGHBOUR_COLUMNS]


def test_features_group_the_sites():
    hours = pd.date_range('2025-01-01', periods=24, freq='h', tz='UTC')
    falling = 1010 - np.arange(24.0)                               # 1 hPa an hour out west
    n = pd.concat([readings('M3', hours, falling, wind=10.0), readings('M6', hours, falling + 4, wind=20.0),
                   readings('M4', hours, 1000.0), readings('M5', hours, 1006.0)])
    here = pd.Series(1000.0, index=hours)
    f = features(n, hours[-1:], here).iloc[0]
    assert list(f.index) == NEIGHBOUR_FEATURES
    # M3 and M6 fall 1 hPa an hour, M4 (also on the Atlantic edge) holds steady.
    assert f['n_west_pressure_change_3h'] == pytest.approx(-2.0)
    assert f['n_west_pressure_change_12h'] == pytest.approx(-8.0)
    # Levels come from the land stations only, and only when all of them report: buoys alone give none.
    assert np.isnan(f['n_west_minus_here']) and np.isnan(f['n_south_minus_north'])
    assert np.isnan(f['n_rain_3h'])

    land = pd.concat([n, readings('valentia', hours, 1004.0, temp=11.0, wind=8.0),
                      readings('belmullet', hours, 1002.0, temp=9.0, wind=12.0),
                      readings('cork-airport', hours, 1008.0), readings('malin-head', hours, 998.0)])
    f = features(land, hours[-1:], here).iloc[0]
    assert f['n_west_minus_here'] == pytest.approx(3.0)              # Valentia and Belmullet
    assert f['n_south_minus_north'] == pytest.approx(6.0)            # Valentia, Cork minus Belmullet, Malin
    assert f['n_west_temp'] == pytest.approx(10.0) and f['n_west_wind'] == pytest.approx(10.0)
    # One land station silent: no level, rather than one that jumps by the site's usual offset.
    gappy = land[~((land['site'] == 'belmullet') & (land['hour'] == hours[-1]))]
    assert np.isnan(features(gappy, hours[-1:], here).iloc[0]['n_west_minus_here'])


def test_rain_out_west_uses_reports_already_out():
    hours = pd.date_range('2025-01-01', periods=6, freq='h', tz='UTC')
    rain = np.array([0.0, 0.0, 1.0, 1.0, 1.0, np.nan])               # this hour's report not in yet
    n = readings('valentia', hours, 1000.0, rain=rain)
    f = features(n, hours[-1:], pd.Series(1000.0, index=hours)).iloc[0]
    assert f['n_rain_3h'] == pytest.approx(3.0)


def test_neighbour_files_and_sync(tmp_path):
    class Source:
        name = 'fake'

        def __init__(self):
            self.asked = []

        def hourly(self, start, end):
            self.asked.append((start, end))
            hours = pd.date_range(start, pd.Timestamp(end) + pd.Timedelta(hours=23), freq='h', tz='UTC')
            return readings('M3', hours, 1000.0).assign(source='fake')

        def recent(self, hours=24):
            raise NotImplementedError

    source, files = Source(), NeighbourFiles(tmp_path)
    today = pd.Timestamp('2025-04-10', tz='UTC')
    assert sync_neighbours(source, files, '2025-01-01', today) == ['2025-01', '2025-02', '2025-03', '2025-04']
    assert files.months('fake')['2025-01']['complete'] and not files.months('fake')['2025-03']['complete']
    assert sync_neighbours(source, files, '2025-01-01', today) == ['2025-03', '2025-04']
    loaded = files.load('fake', '2025-02-01', '2025-02-01')
    assert len(loaded) == 24 and (loaded['pressure'] == 1000.0).all()


def test_issued_guidance_is_kept_a_day_at_a_time(tmp_path):
    files = GuidanceFiles(tmp_path)
    hours = pd.date_range('2025-01-31 12:00', periods=72, freq='h', tz='UTC')
    frame = pd.DataFrame({'source': 'met-eireann', 'model': 'met_eireann', 'lead_days': 0, 'hour': hours,
                          'temp': 1.0})
    for col in GUIDANCE_COLUMNS[4:]:
        frame[col] = frame.get(col, np.nan)
    first = pd.Timestamp('2025-01-31 18:00', tz='UTC')
    assert keep_issued_guidance(files, frame[GUIDANCE_COLUMNS], first) == 24
    # The next evening's run must not overwrite what was issued the evening before.
    later = frame[GUIDANCE_COLUMNS].assign(temp=9.0)
    keep_issued_guidance(files, later, first + pd.Timedelta(days=1))
    kept = files.load('met-eireann', 0).set_index('hour')['temp']
    assert len(kept) == 48 and kept.index.min() == first
    assert kept[first + pd.Timedelta(hours=23)] == 1.0 and kept[first + pd.Timedelta(hours=24)] == 9.0
    assert set(files.months('met-eireann', 0)) == {'2025-01', '2025-02'}


def test_forecast_lists_second_opinions_beside_the_models(synthetic_db, trained, tables, guidance):
    out, _ = trained
    date = tables['evening'].index[-10]
    second = guidance[guidance['model'] == 'warm_model'].assign(source='met-eireann', model='met_eireann')
    result = forecast(synthetic_db, out / 'models', date=date, guidance=guidance, second_opinions=[second])
    assert set(result['guidance']) == {'warm_model', 'cool_model', 'met_eireann'}
    assert result['guidance']['met_eireann'] == result['guidance']['warm_model']
    json.dumps(result)  # the whole result stays plain JSON


def test_issued_guidance_runs_to_the_next_local_six_across_a_clock_change(tmp_path):
    files = GuidanceFiles(tmp_path)
    hours = pd.date_range('2025-10-25 12:00', periods=72, freq='h', tz='UTC')
    frame = pd.DataFrame({'source': 'met-eireann', 'model': 'met_eireann', 'lead_days': 0, 'hour': hours,
                          'temp': 1.0})
    for col in GUIDANCE_COLUMNS:
        if col not in frame:
            frame[col] = np.nan
    # Clocks go back overnight on 25-26 October: 18:00 to 18:00 local is 25 hours.
    issued = pd.Timestamp('2025-10-25 18:00').tz_localize('Europe/Dublin')
    assert keep_issued_guidance(files, frame[GUIDANCE_COLUMNS], issued) == 25


def test_a_forecast_that_is_not_xml_is_a_value_error():
    with pytest.raises(ValueError, match='not XML'):
        parse_forecast(b'<html><body>Service unavailable')
