import type { ObservationRepository, Observation, StationId } from '@weather/domain';

export class InMemoryObservationRepository implements ObservationRepository {
  private observations: Observation[] = [];

  async findLatestByStation(stationId: StationId): Promise<Observation | null> {
    const stationObs = this.observations
      .filter((o) => o.stationId === stationId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return stationObs[0] ?? null;
  }

  async findByStationAndTimeRange(
    stationId: StationId,
    from: Date,
    to: Date,
  ): Promise<Observation[]> {
    return this.observations.filter(
      (o) =>
        o.stationId === stationId &&
        o.timestamp >= from &&
        o.timestamp <= to,
    );
  }

  async findDistinctDatesByStation(stationId: StationId): Promise<string[]> {
    const dates = new Set<string>();
    for (const o of this.observations) {
      if (o.stationId === stationId) {
        dates.add(o.timestamp.toISOString().substring(0, 10));
      }
    }
    return Array.from(dates).sort();
  }

  async save(observation: Observation): Promise<void> {
    this.observations.push(observation);
  }

  async saveMany(observationList: Observation[]): Promise<void> {
    this.observations.push(...observationList);
  }

  async deleteOlderThan(cutoff: Date): Promise<number> {
    const before = this.observations.length;
    this.observations = this.observations.filter((o) => o.timestamp >= cutoff);
    return before - this.observations.length;
  }

  getAll(): Observation[] {
    return [...this.observations];
  }
}
