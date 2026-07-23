import type { SyncWindowRepository, SyncWindow, StationId, SensorId } from '@weather/domain';

export class InMemorySyncWindowRepository implements SyncWindowRepository {
  private windows: SyncWindow[] = [];

  async findByStationAndSensor(
    stationId: StationId,
    sensorId: SensorId,
  ): Promise<SyncWindow[]> {
    return this.windows
      .filter((w) => w.stationId === stationId && w.sensorId === sensorId)
      .sort((a, b) => a.startTimestamp.getTime() - b.startTimestamp.getTime());
  }

  async findGaps(
    stationId: StationId,
    sensorId: SensorId,
    from: Date,
    to: Date,
  ): Promise<Array<{ from: Date; to: Date }>> {
    const windows = this.windows
      .filter(
        (w) =>
          w.stationId === stationId &&
          w.sensorId === sensorId &&
          w.endTimestamp >= from &&
          w.startTimestamp <= to,
      )
      .sort((a, b) => a.startTimestamp.getTime() - b.startTimestamp.getTime());

    const gaps: Array<{ from: Date; to: Date }> = [];
    let cursor = from;

    for (const w of windows) {
      if (w.startTimestamp > cursor) {
        gaps.push({ from: cursor, to: w.startTimestamp });
      }
      if (w.endTimestamp > cursor) {
        cursor = w.endTimestamp;
      }
    }

    if (cursor < to) {
      gaps.push({ from: cursor, to });
    }

    return gaps;
  }

  async save(syncWindow: SyncWindow): Promise<void> {
    this.windows.push(syncWindow);
  }

  getAll(): SyncWindow[] {
    return [...this.windows];
  }
}
