"""ObservationStore adapter over the station's SQLite database (read-only)."""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from ..data import Station, load_hourly


class SqliteObservationStore:
    def __init__(self, db_path: str | Path):
        self.db_path = Path(db_path)

    def load_hourly(self, station_id: str | None = None) -> tuple[Station, pd.DataFrame]:
        return load_hourly(self.db_path, station_id)
