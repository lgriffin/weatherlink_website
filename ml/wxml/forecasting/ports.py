"""Ports: what the forecasting core needs from the outside world.

Each port is a typing.Protocol, so an adapter only has to have the right
methods; it never imports or subclasses anything from here. Tests use small
in-memory fakes; real runs use the adapters in `wxml.adapters`.

Ports with adapters today:
- ObservationStore: the station's own history (SQLite).
- ForecastSource: guidance from weather models elsewhere (Open-Meteo).
- Narrator: turns a brief into words (Ollama).

Planned (see ADR 007): NeighbourObservations (Met Éireann stations, Irish
weather buoys), ModelRunner (LightGBM today, swappable), ForecastLedger
(every issued forecast, for scoring later), Publisher (the site's ingest API).
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable

import pandas as pd

from ..data import Station
from .domain import Location


@runtime_checkable
class ObservationStore(Protocol):
    def load_hourly(self, station_id: str | None = None) -> tuple[Station, pd.DataFrame]:
        """The station and its hourly table (wxml.data.HOURLY_COLUMNS, UTC hour index)."""
        ...


@runtime_checkable
class ForecastSource(Protocol):
    name: str

    def latest(self, location: Location, models: list[str], hours: int = 72) -> pd.DataFrame:
        """The newest run of each model from now on, as guidance rows with lead_days 0."""
        ...

    def as_issued(self, location: Location, models: list[str], start: str, end: str,
                  lead_days: int = 1) -> pd.DataFrame:
        """What each model said `lead_days` days ahead for every hour of the UTC dates [start, end].

        This is the only fair input for training or scoring against the past:
        the forecast as it stood when it was made, not a later, better run.
        """
        ...


@runtime_checkable
class Narrator(Protocol):
    def write(self, brief: str) -> str:
        """The written forecast for a brief. States only numbers the brief gives."""
        ...
