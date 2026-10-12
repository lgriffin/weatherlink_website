"""Use cases for issued forecasts: issue one, keep it, and score it once the truth is in.

Every forecast that goes out is kept as it was issued: the numbers, which
models made them, what the weather models said, the brief and the words.
That is the only honest record of how the forecasts did (no later run, no
retrained model), the only archive for guidance that has none of its own,
and the training set for the language model.
"""

from __future__ import annotations

import math
from typing import Callable

import numpy as np
import pandas as pd

from .ports import ForecastLedger, Narrator, Publisher

WET_MM = 0.2


def issue_forecast(run: Callable[[], dict], ledger: ForecastLedger, now: pd.Timestamp,
                   narrator: Narrator | None = None, narrator_name: str | None = None,
                   publishers: tuple[Publisher, ...] = (), replace: bool = False, date: str | None = None,
                   on_saved: Callable[[dict], None] | None = None,
                   log: Callable[[str], None] = lambda _: None) -> dict | None:
    """Make the forecast for `date` (tonight), keep it in the ledger and publish it.

    When the evening already has a forecast (and not `replace`), nothing is
    run: the forecast as issued is published again, so a delivery that failed
    is made good, and None is returned. A narrator that fails leaves the
    forecast without words rather than stopping it. `on_saved` runs once the
    record is in the ledger and before it is published, so a publisher that
    fails can't skip it.
    """
    if date is not None and not replace and _republish(ledger, date, publishers, log):
        return None
    result = run()
    issued_for = result['evening']['date']
    if date is not None and issued_for != date:
        raise LookupError(f'No forecast for {date}: the latest evening with data is {issued_for}.')
    if not replace and _republish(ledger, issued_for, publishers, log):
        return None
    record = {**result, 'issued_at': now.tz_convert('UTC').strftime('%Y-%m-%dT%H:%M:%SZ')}
    record.pop('forecast', None)
    if narrator is not None:
        try:
            record['forecast'] = narrator.write(result['brief'])
            record['narrator'] = narrator_name
        except (OSError, RuntimeError, KeyError, ValueError) as err:
            log(f'The narrator failed ({err}); sending the numbers without words.')
    ledger.save(record)
    if on_saved is not None:
        on_saved(record)
    for publisher in publishers:
        publisher.publish('forecast', record)
    return record


def _republish(ledger: ForecastLedger, date: str, publishers: tuple[Publisher, ...],
               log: Callable[[str], None]) -> bool:
    record = ledger.get(date)
    if record is None:
        return False
    log(f'{date} already has a forecast in the ledger; publishing it again as issued.')
    for publisher in publishers:
        publisher.publish('forecast', record)
    return True


def _num(v) -> float | None:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(f) else f


def verify_ledger(ledger: ForecastLedger, outcomes: pd.DataFrame, now: pd.Timestamp,
                  settle_days: int = 7) -> list[str]:
    """Add what happened to every forecast whose night and next day are now known.

    `outcomes` is the evening table (indexed by date) with night_min, day_max
    and rain_24h_next. Readings can arrive late (a console that was offline
    uploads its backlog), so evenings in the last `settle_days` are checked
    again and corrected if the outcome changed. Returns the dates verified or corrected.
    """
    done = []
    settled = f'{now.tz_convert("UTC") - pd.Timedelta(days=settle_days):%Y-%m-%d}'
    for date in ledger.dates():
        record = ledger.get(date)
        if record is None or date not in outcomes.index:
            continue
        before = record.get('verification')
        if before is not None and date < settled:
            continue
        o = outcomes.loc[date]
        night, day, rain = _num(o.get('night_min')), _num(o.get('day_max')), _num(o.get('rain_24h_next'))
        if night is None or day is None or rain is None:
            continue
        outcome = {
            'night_min': round(night, 1),
            'day_max': round(day, 1),
            'rain_24h_mm': round(rain, 1),
            'frost': night <= 0,
            'wet': rain >= WET_MM,
        }
        if before is not None and all(before.get(k) == v for k, v in outcome.items()):
            continue
        record['verification'] = {**outcome, 'verified_at': now.tz_convert('UTC').strftime('%Y-%m-%dT%H:%M:%SZ')}
        ledger.save(record)
        done.append(date)
    return done


def ledger_scores(ledger: ForecastLedger, since: str | None = None) -> dict:
    """How the issued forecasts did, and how each weather model did on the same evenings."""
    rows, said = [], []
    for date in ledger.dates():
        if since and date < since:
            continue
        r = ledger.get(date)
        v = (r or {}).get('verification')
        if not v:
            continue
        e = r['evening']
        rows.append({'date': date, 'night_min': e.get('night_min'), 'frost_chance': e.get('frost_chance'),
                     'day_max': e.get('day_max'), 'rain_chance': e.get('rain_next_24h_chance'),
                     'actual_night_min': v['night_min'], 'actual_day_max': v['day_max'],
                     'frost': float(v['frost']), 'wet': float(v['wet'])})
        for model, m in (r.get('guidance') or {}).items():
            said.append({'model': model, 'night_min': m.get('night_min'), 'day_max': m.get('day_max'),
                         'actual_night_min': v['night_min'], 'actual_day_max': v['day_max']})
    if not rows:
        return {'evenings': 0}
    t = pd.DataFrame(rows).astype({c: float for c in ('night_min', 'frost_chance', 'day_max', 'rain_chance')})

    def mae(a, b):
        ok = t[a].notna() & t[b].notna()
        return round(float((t[a] - t[b])[ok].abs().mean()), 2) if ok.any() else None

    def brier(p, y):
        ok = t[p].notna()
        return round(float(((t[p] - t[y]) ** 2)[ok].mean()), 3) if ok.any() else None

    out = {
        'evenings': len(t), 'from': t['date'].min(), 'to': t['date'].max(),
        'night_min_mae': mae('night_min', 'actual_night_min'),
        'day_max_mae': mae('day_max', 'actual_day_max'),
        'frost_brier': brier('frost_chance', 'frost'),
        'rain_24h_brier': brier('rain_chance', 'wet'),
        'frost_nights': int(t['frost'].sum()),
    }
    if said:
        s = pd.DataFrame(said)
        models = {}
        for model, g in s.groupby('model'):
            entry = {}
            for var in ('night_min', 'day_max'):
                ok = g[var].notna()
                if ok.any():
                    entry[f'{var}_mae'] = round(float(np.abs(g[var][ok].astype(float) - g[f'actual_{var}'][ok]).mean()), 2)
            entry['evenings'] = int(len(g))
            models[model] = entry
        out['weather_models'] = models
    return out
