"""Build the fine-tuning set for the Ollama forecaster.

One example per past evening with a known outcome: the brief the model would
have had at 18:00 (numbers from models that never saw that stretch of time,
the usual for the date, similar past evenings) and a draft forecast. Written
as chat-format JSONL, which both MLX-LM and Unsloth read.
"""

from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Callable

import numpy as np
import pandas as pd

from . import brief as br
from .analogs import find_analogs
from .models import TASKS_BY_NAME, night_outlook, out_of_fold
from .ollama import rewrite


def _oof_series(task_name: str, table: pd.DataFrame) -> pd.Series:
    task = TASKS_BY_NAME[task_name]
    rows = table[table[task.target].notna()]
    return pd.Series(out_of_fold(task, rows), index=rows.index)


def build(evenings: pd.DataFrame, hourly_rows: pd.DataFrame, valid_share: float = 0.1,
          rewrite_with: str | None = None, log: Callable[[str], None] = print) -> dict[str, list]:
    need = ['night_min', 'day_max', 'rain_24h_next']
    usable = evenings.dropna(subset=need)
    if len(usable) < 50:
        raise ValueError(f'only {len(usable)} evenings with a known night and next day; need at least 50')

    log('Fitting out-of-fold models for the briefs...')
    night = _oof_series('night_min', evenings)
    residuals = (evenings['night_min'] - night).dropna().to_numpy()
    day_max = _oof_series('day_max', evenings)
    rain_24h = _oof_series('rain_next_24h', evenings)
    rain_6h = _oof_series('rain_next_6h', hourly_rows)

    examples = []
    for date, row in usable.iterrows():
        if pd.isna(night.get(date)):
            continue
        outlook_arr = night_outlook(np.array([night[date]]), residuals)
        outlook = br.Outlook(
            night_min=float(night[date]),
            p10=float(outlook_arr['p10'][0]), p90=float(outlook_arr['p90'][0]),
            frost_chance=float(outlook_arr['frost_chance'][0]),
            day_max=None if pd.isna(day_max.get(date)) else float(day_max[date]),
            rain_24h=None if pd.isna(rain_24h.get(date)) else float(rain_24h[date]),
            rain_6h=None if pd.isna(rain_6h.get(row['issue_hour'], np.nan)) else float(rain_6h[row['issue_hour']]),
        )
        normal_low, normal_high = br.normals_for(evenings, date, int(row['doy']))
        analogs = find_analogs(evenings, date)
        brief = br.build_brief(date, row, outlook, normal_low, normal_high, analogs)
        answer = br.draft_forecast(outlook, row, normal_low, analogs)
        if rewrite_with:
            try:
                answer = rewrite(rewrite_with, answer, brief)
            except OSError as err:
                log(f'{date}: rewrite failed ({err}); keeping the draft')
        examples.append({'date': date, 'brief': brief, 'answer': answer, 'outcome': row})

    cut = int(len(examples) * (1 - valid_share))
    return {'train': examples[:cut], 'valid': examples[cut:]}


def write(split: dict[str, list], out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    for name, examples in split.items():
        with open(out_dir / f'{name}.jsonl', 'w') as f:
            for ex in examples:
                f.write(json.dumps({'messages': br.messages(ex['brief'], ex['answer'])}, ensure_ascii=False) + '\n')
    # For reading a sample by hand: the brief, the draft and what really happened.
    with open(out_dir / 'review.csv', 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(['split', 'date', 'brief', 'draft', 'actual_night_min', 'actual_day_max', 'actual_rain_24h_mm'])
        for name, examples in split.items():
            for ex in examples:
                o = ex['outcome']
                w.writerow([name, ex['date'], ex['brief'], ex['answer'],
                            round(o['night_min'], 1), round(o['day_max'], 1), round(o['rain_24h_next'], 1)])
