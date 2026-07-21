import type {
  StationRepository,
  ObservationRepository,
  WeatherStation,
  Observation,
  Clock,
  FreshnessInfo,
  FreshnessConfig,
} from '@weather/domain';
import { determineFreshness } from '@weather/domain';

export interface DashboardResult {
  station: WeatherStation | null;
  observation: Observation | null;
  freshness: FreshnessInfo;
}

export class GetCurrentDashboard {
  constructor(
    private readonly stationRepo: StationRepository,
    private readonly observationRepo: ObservationRepository,
    private readonly clock: Clock,
    private readonly freshnessConfig?: FreshnessConfig,
  ) {}

  async execute(): Promise<DashboardResult> {
    const station = await this.stationRepo.findActive();
    if (!station) {
      return {
        station: null,
        observation: null,
        freshness: { state: 'unavailable', lastObservation: null, ageSeconds: null },
      };
    }

    const observation = await this.observationRepo.findLatestByStation(station.id);
    const freshness = determineFreshness(
      observation?.timestamp ?? null,
      this.clock.now(),
      this.freshnessConfig,
    );

    return { station, observation, freshness };
  }
}
