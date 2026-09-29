import json

import numpy as np
import pandas as pd
import pytest

from wxml.models import night_outlook, split_date


def test_split_holds_out_the_last_year():
    dates = pd.Series(pd.date_range('2023-06-01', '2025-08-28'))
    assert split_date(dates) == pd.Timestamp('2024-08-29')
    assert split_date(dates, '2025-01-01') == pd.Timestamp('2025-01-01')


def test_night_outlook_turns_misses_into_a_frost_chance():
    residuals = np.array([-3.0, -1.0, 0.0, 1.0, 3.0])
    out = night_outlook(np.array([2.0, 10.0]), residuals)
    assert out['frost_chance'][0] == pytest.approx(0.2)   # only the -3 miss takes 2 °C below zero
    assert out['frost_chance'][1] == 0
    assert out['p10'][0] < 2.0 < out['p90'][0]


def test_training_writes_models_scores_and_manifest(trained):
    out, report = trained
    for name in ('night_min', 'day_max', 'rain_next_24h', 'rain_next_6h', 'temp_next_24h'):
        assert (out / 'models' / f'{name}.txt').exists(), name
        assert 'skipped' not in report['tasks'][name]
    manifest = json.loads((out / 'models' / 'manifest.json').read_text())
    assert len(manifest['night_min']['residuals']) > 500
    assert json.loads((out / 'metrics.json').read_text()) == report


def test_models_beat_both_baselines_on_held_out_data(trained):
    tasks = trained[1]['tasks']
    for name in ('night_min', 'rain_next_24h', 'rain_next_6h', 'temp_next_24h'):
        assert tasks[name]['skill']['vs_climatology'] > 0, name
        assert tasks[name]['skill']['vs_persistence'] > 0, name
    # Falling pressure brings the synthetic rain, so rain-soon should be clearly better.
    assert tasks['rain_next_6h']['skill']['vs_climatology'] > 0.3


def test_test_period_is_after_training(trained):
    night = trained[1]['tasks']['night_min']
    assert night['train_from'] < night['test_from'] <= night['test_to']


def test_night_range_is_roughly_calibrated(trained):
    r = trained[1]['tasks']['night_min']['range_10_90']
    assert 0.02 <= r['share_below_p10'] <= 0.2
    assert 0.02 <= r['share_above_p90'] <= 0.2
