import type { RecordRepository, WeatherRecord, StationId, MeasurementName, RecordScope } from '@weather/domain';

export class InMemoryRecordRepository implements RecordRepository {
  private records: WeatherRecord[] = [];

  async findByStation(stationId: StationId, scope?: RecordScope): Promise<WeatherRecord[]> {
    return this.records.filter(
      (r) => r.stationId === stationId && (scope === undefined || r.scope === scope),
    );
  }

  async findByStationAndMeasurement(
    stationId: StationId,
    measurementName: MeasurementName,
  ): Promise<WeatherRecord[]> {
    return this.records.filter(
      (r) => r.stationId === stationId && r.measurementName === measurementName,
    );
  }

  async save(record: WeatherRecord): Promise<void> {
    this.records.push(record);
  }

  async saveMany(recordList: WeatherRecord[]): Promise<void> {
    this.records.push(...recordList);
  }

  async deleteByStation(stationId: StationId): Promise<void> {
    this.records = this.records.filter((r) => r.stationId !== stationId);
  }

  getAll(): WeatherRecord[] {
    return [...this.records];
  }
}
