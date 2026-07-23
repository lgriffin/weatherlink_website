import type { StationRepository, RecordRepository, WeatherRecord, RecordScope } from '@weather/domain';

export class GetRecords {
  constructor(
    private readonly stationRepo: StationRepository,
    private readonly recordRepo: RecordRepository,
  ) {}

  async execute(scope?: RecordScope): Promise<WeatherRecord[]> {
    const station = await this.stationRepo.findActive();
    if (!station) return [];
    return this.recordRepo.findByStation(station.id, scope);
  }
}
