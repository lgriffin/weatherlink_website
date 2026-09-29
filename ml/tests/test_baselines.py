import numpy as np
import pytest

from wxml.baselines import brier, conditional_rate, mae, reliability, seasonal_mean, skill


def test_seasonal_mean_wraps_around_the_new_year():
    doy = np.array([1, 2, 180])
    values = np.array([0.0, 2.0, 20.0])
    assert seasonal_mean(doy, values, np.array([365]), window=5)[0] == pytest.approx(1.0)
    assert seasonal_mean(doy, values, np.array([181]), window=5)[0] == pytest.approx(20.0)


def test_seasonal_mean_by_group():
    doy = np.array([10, 10])
    values = np.array([1.0, 9.0])
    groups = np.array([6, 15])
    out = seasonal_mean(doy, values, np.array([10, 10]), train_group=groups, query_group=np.array([15, 6]))
    assert list(out) == [9.0, 1.0]


def test_scores():
    assert brier([1, 0], [1, 0]) == 0
    assert brier([0.5, 0.5], [1, 0]) == 0.25
    assert mae([1, 3], [2, 2]) == 1
    assert skill(0.5, 1.0) == 0.5
    assert skill(1.0, 0) is None
    assert list(conditional_rate([True, True, False], [1, 0, 0], [True, False])) == [0.5, 0.0]


def test_reliability_bins():
    rows = reliability(np.array([0.05, 0.05, 0.95]), np.array([0, 1, 1]))
    assert rows[0]['count'] == 2 and rows[0]['observed'] == 0.5
    assert rows[-1]['observed'] == 1.0
