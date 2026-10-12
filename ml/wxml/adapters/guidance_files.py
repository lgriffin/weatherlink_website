"""GuidanceArchive adapter: as-issued guidance as plain CSV files, one per month.

    <root>/<source>/lead<k>/<YYYY-MM>.csv    columns: model, hour (UTC), then the variables
    <root>/<source>/lead<k>/index.json       per month: the models asked for, and whether it was complete

Plain files so the archive can live in the history folder (the weather-history
branch, a NAS share, a Drive folder) next to the station's own records, and be
read by anything. Values are rounded to what the models resolve, which keeps
the files small and their diffs readable.
"""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

from ..forecasting.domain import GUIDANCE_COLUMNS, GUIDANCE_VARIABLES, empty_guidance

DECIMALS = {'temp': 1, 'dew': 1, 'rh': 0, 'pressure': 1, 'wind': 1, 'gust': 1,
            'wind_dir': 0, 'rain': 2, 'cloud': 0, 'solar': 0}
assert set(DECIMALS) == set(GUIDANCE_VARIABLES)


class GuidanceFiles:
    def __init__(self, root: str | Path):
        self.root = Path(root)

    def _dir(self, source: str, lead_days: int) -> Path:
        return self.root / source / f'lead{int(lead_days)}'

    def _index(self, source: str, lead_days: int) -> dict:
        path = self._dir(source, lead_days) / 'index.json'
        return json.loads(path.read_text()) if path.exists() else {}

    def months(self, source: str, lead_days: int) -> dict[str, dict]:
        folder = self._dir(source, lead_days)
        index = self._index(source, lead_days)
        return {month: {'models': set(info.get('models', [])), 'complete': bool(info.get('complete'))}
                for month, info in index.items() if (folder / f'{month}.csv').exists()}

    def save_month(self, source: str, lead_days: int, month: str, frame: pd.DataFrame,
                   models: list[str], complete: bool) -> None:
        folder = self._dir(source, lead_days)
        folder.mkdir(parents=True, exist_ok=True)
        out = frame.sort_values(['model', 'hour'])[['model', 'hour', *GUIDANCE_VARIABLES]].copy()
        out['hour'] = out['hour'].dt.strftime('%Y-%m-%dT%H:%MZ')
        for col, places in DECIMALS.items():
            out[col] = out[col].round(places)
        self._replace(folder / f'{month}.csv', out.to_csv(index=False))
        index = self._index(source, lead_days)
        index[month] = {'models': sorted(models), 'complete': bool(complete)}
        self._replace(folder / 'index.json', json.dumps(dict(sorted(index.items())), indent=1) + '\n')

    @staticmethod
    def _replace(path: Path, text: str) -> None:
        tmp = path.with_name(f'.{path.name}.tmp')
        tmp.write_text(text)
        tmp.replace(path)

    def load(self, source: str, lead_days: int, start: str | None = None,
             end: str | None = None) -> pd.DataFrame:
        folder = self._dir(source, lead_days)
        first = pd.Timestamp(start, tz='UTC') if start else None
        after = pd.Timestamp(end, tz='UTC') + pd.Timedelta(days=1) if end else None
        frames = []
        for path in sorted(folder.glob('????-??.csv')) if folder.is_dir() else []:
            month = pd.Timestamp(path.stem + '-01', tz='UTC')
            if (after is not None and month >= after) or \
                    (first is not None and month + pd.offsets.MonthBegin(1) <= first):
                continue
            frames.append(pd.read_csv(path))
        if not frames:
            return empty_guidance()
        frame = pd.concat(frames, ignore_index=True)
        frame['hour'] = pd.to_datetime(frame['hour'], utc=True)
        frame.insert(0, 'lead_days', int(lead_days))
        frame.insert(0, 'source', source)
        for col in GUIDANCE_VARIABLES:
            frame[col] = pd.to_numeric(frame[col], errors='coerce').astype(float) if col in frame else float('nan')
        keep = pd.Series(True, index=frame.index)
        if first is not None:
            keep &= frame['hour'] >= first
        if after is not None:
            keep &= frame['hour'] < after
        return frame.loc[keep, GUIDANCE_COLUMNS].reset_index(drop=True)
