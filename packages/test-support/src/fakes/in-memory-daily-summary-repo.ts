import type { DailySummaryRepository, DailySummary, StationId, MeasurementName } from '@weather/domain';

export class InMemoryDailySummaryRepository implements DailySummaryRepository {
  private summaries: DailySummary[] = [];

  async findByStationAndDate(stationId: StationId, date: string): Promise<DailySummary[]> {
    return this.summaries.filter((s) => s.stationId === stationId && s.date === date);
  }

  async findByStationAndDateRange(
    stationId: StationId,
    fromDate: string,
    toDate: string,
  ): Promise<DailySummary[]> {
    return this.summaries.filter(
      (s) => s.stationId === stationId && s.date >= fromDate && s.date <= toDate,
    );
  }

  async findByStationDateAndMeasurement(
    stationId: StationId,
    monthDay: string,
    measurementName: MeasurementName,
  ): Promise<DailySummary[]> {
    return this.summaries.filter(
      (s) =>
        s.stationId === stationId &&
        s.date.endsWith(`-${monthDay}`) &&
        s.measurementName === measurementName,
    );
  }

  async findDistinctDatesByStation(stationId: StationId): Promise<string[]> {
    const dates = new Set<string>();
    for (const s of this.summaries) {
      if (s.stationId === stationId) {
        dates.add(s.date);
      }
    }
    return Array.from(dates).sort();
  }

  async save(summary: DailySummary): Promise<void> {
    const idx = this.summaries.findIndex(
      (s) =>
        s.stationId === summary.stationId &&
        s.date === summary.date &&
        s.measurementName === summary.measurementName,
    );
    if (idx >= 0) {
      this.summaries[idx] = summary;
    } else {
      this.summaries.push(summary);
    }
  }

  async saveMany(summaries: DailySummary[]): Promise<void> {
    for (const s of summaries) {
      await this.save(s);
    }
  }

  async deleteOlderThan(cutoff: string): Promise<number> {
    const before = this.summaries.length;
    this.summaries = this.summaries.filter((s) => s.date >= cutoff);
    return before - this.summaries.length;
  }

  async deleteByStation(stationId: StationId): Promise<number> {
    const before = this.summaries.length;
    this.summaries = this.summaries.filter((s) => s.stationId !== stationId);
    return before - this.summaries.length;
  }

  getAll(): DailySummary[] {
    return [...this.summaries];
  }
}
