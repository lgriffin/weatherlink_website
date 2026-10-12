"""ForecastLedger adapter: one JSON file per evening.

    <root>/<YYYY>/<YYYY-MM-DD>.json

Plain files, so the ledger can live in the history folder (the weather-history
branch) and be read by anything. It is the only record of guidance with no
archive of its own, and the honest training set for the language model.
"""

from __future__ import annotations

import json
from pathlib import Path


class LedgerFiles:
    def __init__(self, root: str | Path):
        self.root = Path(root)

    def _path(self, date: str) -> Path:
        return self.root / date[:4] / f'{date}.json'

    def save(self, record: dict) -> None:
        path = self._path(record['evening']['date'])
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_name(f'.{path.name}.tmp')
        tmp.write_text(json.dumps(record, indent=1, ensure_ascii=False) + '\n')
        tmp.replace(path)

    def get(self, date: str) -> dict | None:
        path = self._path(date)
        return json.loads(path.read_text()) if path.exists() else None

    def dates(self) -> list[str]:
        return sorted(p.stem for p in self.root.glob('????/????-??-??.json'))
