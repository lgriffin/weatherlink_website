import type {
  WeatherDataSource,
  WeatherStation,
  Sensor,
  Observation,
  StationId,
  ArchiveRecord,
  Measurement,
  MeasurementName,
} from '@weather/domain';
import { MEASUREMENT_UNITS, observationId } from '@weather/domain';

const OBSERVATION_PAYLOAD = Symbol('observation');

/**
 * Archive payloads for the fake are plain objects of canonical measurement
 * name to value, e.g. `{ 'temperature.outdoor': 12.5, 'rain.interval': 0.2 }`.
 */
export class FakeWeatherDataSource implements WeatherDataSource {
  stations: WeatherStation[] = [];
  sensors: Sensor[] = [];
  observations: Observation[] = [];
  /** Returned once per historic request, whatever the range (legacy behaviour). */
  historicObservations: Observation[] = [];
  /** Returned when their timestamp falls inside the requested range. */
  historicArchive: ArchiveRecord[] = [];
  historicRequests: Array<{ start: number; end: number }> = [];
  shouldThrow: Error | null = null;

  async discoverStations(): Promise<WeatherStation[]> {
    if (this.shouldThrow) throw this.shouldThrow;
    return this.stations;
  }

  async getSensors(_stationId: StationId): Promise<Sensor[]> {
    if (this.shouldThrow) throw this.shouldThrow;
    return this.sensors;
  }

  async getCurrentConditions(_stationId: StationId): Promise<Observation[]> {
    if (this.shouldThrow) throw this.shouldThrow;
    return this.observations;
  }

  async getHistoricConditions(
    stationId: StationId,
    startTimestamp: number,
    endTimestamp: number,
  ): Promise<Observation[]> {
    return this.mapArchiveRecords(await this.getHistoricArchive(stationId, startTimestamp, endTimestamp));
  }

  async getHistoricArchive(
    _stationId: StationId,
    startTimestamp: number,
    endTimestamp: number,
  ): Promise<ArchiveRecord[]> {
    if (this.shouldThrow) throw this.shouldThrow;
    this.historicRequests.push({ start: startTimestamp, end: endTimestamp });

    const inRange = this.historicArchive.filter((r) => {
      const t = r.timestamp.getTime() / 1000;
      return t >= startTimestamp && t <= endTimestamp;
    });
    const legacy = this.historicObservations.map((o) => ({
      stationId: o.stationId,
      sensorId: o.sensorId,
      sensorType: 45,
      timestamp: o.timestamp,
      intervalMinutes: 15,
      payload: { [OBSERVATION_PAYLOAD]: o },
      fetchedAt: o.receivedAt,
    }));
    return [...inRange, ...legacy];
  }

  mapArchiveRecords(records: readonly ArchiveRecord[]): Observation[] {
    return records.map((r) => {
      const payload = r.payload as Record<string | symbol, unknown>;
      const legacy = payload[OBSERVATION_PAYLOAD] as Observation | undefined;
      if (legacy) return legacy;

      const measurements = new Map<string, Measurement>();
      for (const [name, value] of Object.entries(payload)) {
        const unit = MEASUREMENT_UNITS[name];
        if (!unit) continue;
        measurements.set(name, {
          name: name as MeasurementName,
          value: value as number | null,
          unit,
          timestamp: r.timestamp,
        });
      }
      return {
        id: observationId(`archive:${String(r.stationId)}:${String(r.sensorId)}:${r.timestamp.getTime()}`),
        stationId: r.stationId,
        sensorId: r.sensorId,
        timestamp: r.timestamp,
        receivedAt: r.fetchedAt,
        source: 'historic',
        measurements,
        rawPayloadHash: 'fake',
      };
    });
  }
}
