import type {
  StationRepository,
  SensorRepository,
  ObservationRepository,
  DataGap,
  Clock,
  MeasurementName,
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
  /** Which reading must be present. Defaults to the outdoor temperature. */
  readonly measurement?: MeasurementName;
  /**
   * Treat a reading of exactly zero as missing. A broken anemometer usually
   * reports 0 rather than nothing, so this defaults to on for wind speed and gust.
   */
  readonly zeroIsMissing?: boolean;
}

const ZERO_WHEN_BROKEN = new Set<string>(['wind.speed', 'wind.gust', 'wind.speedAvg1Min', 'wind.speedAvg2Min', 'wind.speedAvg10Min']);

/**
 * Finds outages in the archive: spans with no usable reading from the ISS
 * (outdoor temperature by default, or any other measurement such as wind
 * speed), either because nothing was logged or because the sensor reported
 * nothing.
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
    const measurement = options.measurement ?? ('temperature.outdoor' as MeasurementName);
    const zeroIsMissing = options.zeroIsMissing ?? ZERO_WHEN_BROKEN.has(measurement);
    const scanner = new GapScanner(station.id, from, options.minGapMs ?? 2 * 60 * 60 * 1000);

    for (let start = from.getTime(); start < to.getTime(); start += ONE_DAY_MS) {
      const chunkEnd = Math.min(start + ONE_DAY_MS, to.getTime());
      const observations = await this.observationRepo.findByStationAndTimeRange(
        station.id, new Date(start), new Date(chunkEnd - 1),
      );
      const points = observations
        .filter((o) => o.source === 'historic' && o.sensorId === issSensor.id)
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
        .map((o) => {
          const value = o.measurements.get(measurement)?.value;
          return { timestamp: o.timestamp, usable: value != null && !(zeroIsMissing && value === 0) };
        });
      scanner.add(points);
    }

    return scanner.finish(to);
  }
}
