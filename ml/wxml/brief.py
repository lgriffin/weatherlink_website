"""The text the language model reads (the brief) and a first-draft answer.

The brief holds only numbers: current readings, what the numeric models say,
the usual for the date and the analog days. The language model's job is to
turn that into a forecast a person wants to read, never to invent numbers.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
import pandas as pd

SYSTEM_PROMPT = (
    'You are the forecaster for a home weather station in Ireland. '
    'Write a short forecast for tonight and tomorrow from the brief. '
    'State only numbers given in the brief, round them sensibly, '
    'and say when the models and the similar past days disagree.'
)

COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']


def _num(v) -> float | None:
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(f) else f


def compass(sin_v, cos_v) -> str | None:
    s, c = _num(sin_v), _num(cos_v)
    if s is None or c is None:
        return None
    deg = (math.degrees(math.atan2(s, c)) + 360) % 360
    return COMPASS[int((deg + 22.5) // 45) % 8]


def sky(clearness) -> str | None:
    c = _num(clearness)
    if c is None:
        return None
    if c >= 0.7:
        return 'clear'
    if c >= 0.4:
        return 'partly cloudy'
    return 'cloudy'


def t(v) -> str:
    return f'{v:.1f}C'


@dataclass
class Outlook:
    night_min: float
    p10: float
    p90: float
    frost_chance: float
    day_max: float | None = None
    rain_24h: float | None = None
    rain_6h: float | None = None


def build_brief(date: str, now: pd.Series, outlook: Outlook,
                normal_low: float | None, normal_high: float | None,
                analogs: pd.DataFrame) -> str:
    lines = [f'Issued {date} 18:00.']

    parts = []
    if _num(now.get('temp')) is not None:
        parts.append(t(now['temp']))
    if _num(now.get('dew')) is not None:
        parts.append(f"dew point {t(now['dew'])}")
    if _num(now.get('rh')) is not None:
        parts.append(f"humidity {now['rh']:.0f}%")
    if _num(now.get('wind')) is not None:
        direction = compass(now.get('wind_dir_sin'), now.get('wind_dir_cos'))
        parts.append(f"wind {now['wind']:.1f} m/s" + (f' {direction}' if direction else ''))
    if _num(now.get('gust_max_6h')) is not None:
        parts.append(f"gusts to {now['gust_max_6h']:.0f} m/s in the last 6h")
    if _num(now.get('pressure')) is not None:
        change = _num(now.get('pressure_change_3h'))
        parts.append(f"pressure {now['pressure']:.1f} hPa"
                     + (f' ({change:+.1f} in 3h)' if change is not None else ''))
    if _num(now.get('rain_24h')) is not None:
        parts.append(f"rain last 24h {now['rain_24h']:.1f} mm")
    if sky(now.get('clearness_6h')):
        parts.append(f"sky this afternoon {sky(now['clearness_6h'])}")
    lines.append('Now: ' + ', '.join(parts) + '.')

    model = (f'Model: overnight low {t(outlook.night_min)} '
             f'(likely range {t(outlook.p10)} to {t(outlook.p90)}); '
             f'frost chance {outlook.frost_chance:.0%}')
    if outlook.rain_6h is not None:
        model += f'; rain in next 6h {outlook.rain_6h:.0%}'
    if outlook.rain_24h is not None:
        model += f'; rain by 18:00 tomorrow {outlook.rain_24h:.0%}'
    if outlook.day_max is not None:
        model += f"; tomorrow's high {t(outlook.day_max)}"
    lines.append(model + '.')

    if normal_low is not None and normal_high is not None:
        lines.append(f'Normal for date: low {t(normal_low)}, high {t(normal_high)}.')

    if _num(now.get('prev_night_min')) is not None:
        lines.append(f"Last night's low: {t(now['prev_night_min'])}.")

    if len(analogs):
        items = []
        for d, a in analogs.iterrows():
            item = f"{d} (low {t(a['night_min'])}"
            if _num(a.get('rain_24h_next')) is not None:
                item += f", next 24h rain {a['rain_24h_next']:.1f} mm"
            items.append(item + ')')
        lines.append('Similar past evenings: ' + ', '.join(items) + '.')
    return '\n'.join(lines)


def _temp_words(v: float) -> str:
    return f'{v:.1f}°C' if abs(v) < 3 else f'{v:.0f}°C'


# Frost and rain get a mention once the model gives them at least this chance.
MENTION_FROST = 0.15
MENTION_RAIN = 0.3
# Similar past evenings "disagree" when their typical low is this far from the model's (°C).
ANALOG_DISAGREE = 2.0


def draft_forecast(outlook: Outlook, outcome: pd.Series, normal_low: float | None,
                   analogs: pd.DataFrame) -> str:
    """A first-draft answer for the training set.

    Every number comes from the brief, so the language model learns never to
    invent one. What actually happened only picks the wording where the brief
    leaves room: a 40% rain chance becomes "showers likely" on a day it did
    rain and "probably staying dry" on a day it didn't. Frost or rain the brief
    gave little chance of is not mentioned, because no forecaster could have
    known.

    These are drafts: rewrite them in your own voice (or with a larger model,
    see `--rewrite-with`) and review a sample by hand.
    """
    frosted = bool(_num(outcome.get('night_min')) is not None and outcome['night_min'] <= 0)
    wet = bool((_num(outcome.get('rain_24h_next')) or 0.0) >= 0.2)
    s = []

    low = _temp_words(outlook.night_min)
    cold = _temp_words(outlook.p10)
    if outlook.frost_chance >= 0.5:
        s.append(f'A frost is likely tonight, with a low near {low}, possibly {cold} in the coldest spots.')
    elif outlook.frost_chance >= MENTION_FROST and frosted:
        s.append(f'A frost is a real risk tonight: the low should be around {low}, but it could drop to {cold}.')
    elif outlook.frost_chance >= MENTION_FROST:
        s.append(f'A low of around {low} tonight. A frost is possible, but less likely than not.')
    else:
        s.append(f'A low of around {low} tonight.')

    if normal_low is not None and abs(outlook.night_min - normal_low) >= 2:
        diff = outlook.night_min - normal_low
        s.append(f"That's about {abs(diff):.0f} degrees {'colder' if diff < 0 else 'milder'} than usual for the date.")

    if outlook.rain_24h is not None:
        p = outlook.rain_24h
        if p >= 0.7:
            rain = 'Rain is likely before tomorrow evening'
        elif p >= 0.5:
            rain = 'Rain is likely at some point' if wet else 'A fair chance of rain, though it may well stay dry'
        elif p >= MENTION_RAIN:
            rain = 'Showers are possible, so keep a coat handy' if wet else 'Probably staying dry, though a shower is possible'
        else:
            rain = 'Mostly dry'
        s.append(f'{rain}.')
    if outlook.day_max is not None:
        s.append(f'Tomorrow tops out at about {_temp_words(outlook.day_max)}.')

    if len(analogs) >= 3:
        lows = analogs['night_min'].astype(float)
        gap = float(lows.median()) - outlook.night_min
        if abs(gap) >= ANALOG_DISAGREE:
            s.append(f"Similar past evenings mostly ended {'milder' if gap > 0 else 'colder'} "
                     f'(from {_temp_words(lows.min())} to {_temp_words(lows.max())}), so treat the low with some caution.')
    return ' '.join(s)


def messages(brief: str, answer: str | None = None) -> list[dict]:
    out = [{'role': 'system', 'content': SYSTEM_PROMPT}, {'role': 'user', 'content': brief}]
    if answer is not None:
        out.append({'role': 'assistant', 'content': answer})
    return out


def normals_for(evenings: pd.DataFrame, before: str, doy: int, min_rows: int = 300) -> tuple[float | None, float | None]:
    """The usual night low and day high for a day of year, from evenings before `before`."""
    from .baselines import seasonal_mean
    past = evenings[evenings.index < before]
    result = []
    for col in ('night_min', 'day_max'):
        known = past[past[col].notna()]
        if len(known) < min_rows:
            result.append(None)
            continue
        result.append(float(seasonal_mean(known['doy'].to_numpy(int), known[col].to_numpy(), np.array([doy]))[0]))
    return result[0], result[1]
