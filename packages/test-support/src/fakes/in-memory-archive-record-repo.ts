import type { ArchiveRecordRepository, ArchiveRecord, StationId } from '@weather/domain';

export class InMemoryArchiveRecordRepository implements ArchiveRecordRepository {
  private records = new Map<string, ArchiveRecord>();

  private key(r: ArchiveRecord): string {
    return `${String(r.stationId)}|${String(r.sensorId)}|${r.timestamp.getTime()}`;
  }

  async saveMany(records: ArchiveRecord[]): Promise<void> {
    for (const r of records) this.records.set(this.key(r), r);
  }

  async findByStationAndTimeRange(stationId: StationId, from: Date, to: Date): Promise<ArchiveRecord[]> {
    return this.getAll()
      .filter((r) => r.stationId === stationId && r.timestamp >= from && r.timestamp < to)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  async findTimeBounds(stationId: StationId): Promise<{ earliest: Date; latest: Date } | null> {
    const times = this.getAll()
      .filter((r) => r.stationId === stationId)
      .map((r) => r.timestamp.getTime());
    if (times.length === 0) return null;
    return { earliest: new Date(Math.min(...times)), latest: new Date(Math.max(...times)) };
  }

  async countByStation(stationId: StationId): Promise<number> {
    return this.getAll().filter((r) => r.stationId === stationId).length;
  }

  getAll(): ArchiveRecord[] {
    return [...this.records.values()];
  }
}
