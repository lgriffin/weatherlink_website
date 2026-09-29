import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from synthetic import simulate, write_db  # noqa: E402


@pytest.fixture(scope='session')
def synthetic_db(tmp_path_factory):
    """About 27 months of made-up weather with a five-day outage in February 2024."""
    path = tmp_path_factory.mktemp('db') / 'synthetic.db'
    return write_db(path, simulate(days=820), outages=[('2024-02-10', '2024-02-15')])


@pytest.fixture(scope='session')
def tables(synthetic_db):
    from wxml.data import load_hourly
    from wxml.features import build_features, evening_table, hourly_targets
    station, hourly = load_hourly(synthetic_db)
    features = build_features(hourly, station)
    return {
        'station': station, 'hourly': hourly, 'features': features,
        'evening': evening_table(hourly, features, station),
        'rows': hourly_targets(hourly, features),
    }


@pytest.fixture(scope='session')
def trained(tables, tmp_path_factory):
    from wxml.models import train_all
    out = tmp_path_factory.mktemp('out')
    report = train_all({'evening': tables['evening'], 'hourly': tables['rows']}, out, log=lambda _: None)
    return out, report
