"""Checks for the language model's forecasts: does the wording match the brief?

Every written forecast is checked against the brief it came from:

- numbers: every number it states is in the brief (to within rounding), or is
  the difference of two numbers in it ("3 degrees colder than usual");
- frost: mentioned when the brief gives at least a 50% chance, and not
  forecast when it gives less than 5%;
- rain: mentioned when the brief gives at least 70% by tomorrow evening;
- disagreement: when the brief says the weather models disagree about tonight's low, so does the forecast;
- length: 120 words at most.

Run on the validation evenings for a stock model and for the fine-tune, the
pass rates say whether fine-tuning helped. The template drafts the training
set starts from pass every check by construction (a test holds them to it).
"""

from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass, field
from itertools import combinations
from pathlib import Path
from typing import Callable

NUMBER = re.compile(r'(?<![\w.])-?\d+(?:\.\d+)?')
DEGREES = re.compile(r'\s*degrees?\b', re.I)
LABELS = re.compile(r'\d{4}-\d{2}-\d{2}|\d{1,2}:\d{2}')  # dates and clock times
FROST = re.compile(r'\bfrost', re.I)
NO_FROST = re.compile(r"\b(no|not|without|unlikely|frost-free|free of)\b[^.]{0,40}\bfrost|\bfrost[^.]{0,20}\bunlikely", re.I)
RAIN = re.compile(r'\b(rain|showers?|wet|drizzle|downpours?)\b', re.I)
DISAGREE = re.compile(r'\b(disagree\w*|differ\w*|uncertain\w*|unsure|caution|split|conflict\w*|vary|varies)\b', re.I)

CHECKS = ['numbers', 'frost', 'rain', 'disagreement', 'length']
MAX_WORDS = 120


@dataclass
class Facts:
    """What the brief commits the forecast to."""
    frost_chance: float | None = None
    rain_chance: float | None = None
    models_disagree: bool = False
    numbers: list[float] = field(default_factory=list)


def facts_from_brief(brief: str) -> Facts:
    def pct(pattern):
        m = re.search(pattern, brief)
        return int(m.group(1)) / 100 if m else None
    # Dates and clock times are labels, not numbers a forecast may quote.
    numbers = [float(n) for n in NUMBER.findall(LABELS.sub(' ', brief))]
    return Facts(frost_chance=pct(r'frost chance (\d+)%'), rain_chance=pct(r'rain by 18:00 tomorrow (\d+)%'),
                 models_disagree=bool(re.search(r"tonight's low:[^\n]*they disagree by", brief)), numbers=numbers)


def _allowed(n: float, given: list[float], difference: bool) -> bool:
    if any(abs(n - g) <= 0.5 for g in given):
        return True
    return difference and any(abs(abs(a - b) - abs(n)) <= 0.5 for a, b in combinations(set(given), 2))


def check(brief: str, text: str) -> dict[str, bool | None]:
    """Each check: True (passed), False (failed) or None (the brief didn't call for it)."""
    f = facts_from_brief(brief)
    ok = True
    plain = LABELS.sub(' ', text)
    for m in NUMBER.finditer(plain):
        n = float(m.group())
        # "about 3 degrees colder than usual" may be the difference of two numbers in the brief.
        difference = bool(DEGREES.match(plain, m.end()))
        ok &= _allowed(n, f.numbers, difference)
    out: dict[str, bool | None] = {'numbers': ok}
    frost_said = bool(FROST.search(text)) and not NO_FROST.search(text)
    if f.frost_chance is None:
        out['frost'] = None
    elif f.frost_chance >= 0.5:
        out['frost'] = bool(FROST.search(text))
    elif f.frost_chance < 0.05:
        out['frost'] = not frost_said
    else:
        out['frost'] = None
    out['rain'] = bool(RAIN.search(text)) if f.rain_chance is not None and f.rain_chance >= 0.7 else None
    out['disagreement'] = bool(DISAGREE.search(text)) if f.models_disagree else None
    out['length'] = len(text.split()) <= MAX_WORDS
    return out


def score(examples: list[dict], write: Callable[[str], str], log: Callable[[str], None] = lambda _: None) -> dict:
    """Write a forecast for each {'date', 'brief'} and check it. Returns pass rates and the failures."""
    results, failures = [], []
    for i, ex in enumerate(examples, 1):
        text = write(ex['brief'])
        c = check(ex['brief'], text)
        results.append(c)
        failed = [k for k, v in c.items() if v is False]
        if failed:
            failures.append({'date': ex.get('date'), 'failed': failed, 'brief': ex['brief'], 'forecast': text})
        if i % 25 == 0:
            log(f'{i}/{len(examples)} written')
    rates = {}
    for name in CHECKS:
        applicable = [r[name] for r in results if r[name] is not None]
        rates[name] = {'pass_rate': round(sum(applicable) / len(applicable), 3) if applicable else None,
                       'checked': len(applicable)}
    all_ok = [all(v is not False for v in r.values()) for r in results]
    return {'forecasts': len(results), 'all_checks_passed': round(sum(all_ok) / len(all_ok), 3) if all_ok else None,
            'checks': rates, 'failures': failures}


def write_eval_set(examples: list[dict], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, 'w') as f:
        for ex in examples:
            f.write(json.dumps({'date': ex['date'], 'brief': ex['brief'],
                                'facts': asdict(facts_from_brief(ex['brief'])) | {'numbers': None}},
                               ensure_ascii=False) + '\n')


def read_eval_set(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
