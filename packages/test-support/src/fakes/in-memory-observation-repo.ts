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

  async save(observation: Observation): Promise<void> {
    this.observations.push(observation);
  }

  async saveMany(observationList: Observation[]): Promise<void> {
    this.observations.push(...observationList);
  }

  getAll(): Observation[] {
    return [...this.observations];
  }
}
