import type {
  StationRepository,
  SensorRepository,
  ObservationRepository,
  DataGap,
  Clock,
} from '@weather/domain';
import { GapScanner } from '@weather/analytics';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export interface FindGapsOptions {
  /** Defaults to the station's registration date. */
  readonly from?: Date;
  /** Defaults to now. */
  readonly to?: Date;
  /** Shortest outage worth reporting. Defaults to 2 hours. */
  readonly minGapMs?: number;
}

/**
 * Finds outages in the archive: spans with no usable outdoor reading from the
 * ISS, either because nothing was logged or because the sensor reported nothing.
 */
export class FindDataGaps {
  constructor(
    private readonly stationRepo: StationRepository,
    private readonly sensorRepo: SensorRepository,
    private readonly observationRepo: ObservationRepository,
    private readonly clock: Clock,
  ) {}

  async execute(options: FindGapsOptions = {}): Promise<DataGap[]> {
    const station = await this.stationRepo.findActive();
    if (!station) return [];

    const sensors = await this.sensorRepo.findByStationId(station.id);
    const issSensor = sensors.find((s) => s.category === 'iss');
    if (!issSensor) return [];

    const from = options.from ?? station.registeredAt;
    const to = options.to ?? this.clock.now();
    const scanner = new GapScanner(station.id, from, options.minGapMs ?? 2 * 60 * 60 * 1000);

    for (let start = from.getTime(); start < to.getTime(); start += ONE_DAY_MS) {
      const chunkEnd = Math.min(start + ONE_DAY_MS, to.getTime());
      const observations = await this.observationRepo.findByStationAndTimeRange(
        station.id, new Date(start), new Date(chunkEnd - 1),
      );
      const points = observations
        .filter((o) => o.source === 'historic' && o.sensorId === issSensor.id)
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
        .map((o) => ({
          timestamp: o.timestamp,
          usable: o.measurements.get('temperature.outdoor')?.value != null,
        }));
      scanner.add(points);
    }

    return scanner.finish(to);
  }
}
