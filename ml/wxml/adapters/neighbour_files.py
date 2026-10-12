"""NeighbourArchive adapter: neighbours' hourly readings as CSV files, one per month.

    <root>/<source>/<YYYY-MM>.csv    columns: site, hour (UTC), then the readings
    <root>/<source>/index.json       per month: whether it was complete when fetched
"""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

from ..forecasting.neighbours import NEIGHBOUR_COLUMNS, NEIGHBOUR_VARIABLES, empty_neighbours

DECIMALS = {'pressure': 1, 'temp': 1, 'rh': 0, 'wind': 1, 'gust': 1, 'wind_dir': 0, 'rain': 1}
assert set(DECIMALS) == set(NEIGHBOUR_VARIABLES)


def _replace(path: Path, text: str) -> None:
    tmp = path.with_name(f'.{path.name}.tmp')
    tmp.write_text(text)
    tmp.replace(path)


class NeighbourFiles:
    def __init__(self, root: str | Path):
        self.root = Path(root)

    def _index(self, source: str) -> dict:
        path = self.root / source / 'index.json'
        return json.loads(path.read_text()) if path.exists() else {}

    def months(self, source: str) -> dict[str, dict]:
        folder = self.root / source
        return {m: {'complete': bool(i.get('complete'))} for m, i in self._index(source).items()
                if (folder / f'{m}.csv').exists()}

    def save_month(self, source: str, month: str, frame: pd.DataFrame, complete: bool) -> None:
        folder = self.root / source
        folder.mkdir(parents=True, exist_ok=True)
        out = frame.sort_values(['site', 'hour'])[['site', 'hour', *NEIGHBOUR_VARIABLES]].copy()
        out['hour'] = out['hour'].dt.strftime('%Y-%m-%dT%H:%MZ')
        for col, places in DECIMALS.items():
            out[col] = out[col].round(places)
        _replace(folder / f'{month}.csv', out.to_csv(index=False))
        index = self._index(source)
        index[month] = {'complete': bool(complete)}
        _replace(folder / 'index.json', json.dumps(dict(sorted(index.items())), indent=1) + '\n')

    def load(self, source: str, start: str | None = None, end: str | None = None) -> pd.DataFrame:
        folder = self.root / source
        first = pd.Timestamp(start, tz='UTC') if start else None
        after = pd.Timestamp(end, tz='UTC') + pd.Timedelta(days=1) if end else None
        frames = []
        for path in sorted(folder.glob('????-??.csv')) if folder.is_dir() else []:
            month = pd.Timestamp(path.stem + '-01', tz='UTC')
            if (after is not None and month >= after) or \
                    (first is not None and month + pd.offsets.MonthBegin(1) <= first):
                continue
            frames.append(pd.read_csv(path, dtype={'site': str}))
        if not frames:
            return empty_neighbours()
        frame = pd.concat(frames, ignore_index=True)
        frame['hour'] = pd.to_datetime(frame['hour'], utc=True)
        frame.insert(0, 'source', source)
        for col in NEIGHBOUR_VARIABLES:
            frame[col] = pd.to_numeric(frame[col], errors='coerce').astype(float)
        keep = pd.Series(True, index=frame.index)
        if first is not None:
            keep &= frame['hour'] >= first
        if after is not None:
            keep &= frame['hour'] < after
        return frame.loc[keep, NEIGHBOUR_COLUMNS].reset_index(drop=True)
