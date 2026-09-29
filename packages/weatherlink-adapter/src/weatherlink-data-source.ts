import { randomUUID } from 'node:crypto';
import type {
  WeatherDataSource,
  WeatherStation,
  Sensor,
  Observation,
  StationId,
  SensorCategory,
  ArchiveRecord,
  Measurement,
} from '@weather/domain';
import { stationId, sensorId, observationId } from '@weather/domain';
import type { Logger } from '@weather/observability';
import { WeatherLinkClient } from './client.js';
import { IssConditionsSchema, BarometerConditionsSchema } from './schemas/current.js';
import { HistoricIssConditionsSchema } from './schemas/historic.js';
import {
  mapIssDataToMeasurements,
  mapHistoricIssDataToMeasurements,
  mapBarometerDataToMeasurements,
  mergeMeasurementMaps,
} from './mapper.js';
import { createHash } from 'node:crypto';

const ISS_SENSOR_TYPES = [43, 45];
const BAROMETER_SENSOR_TYPE = 242;

function categorizeSensor(sensorType: number): SensorCategory {
  switch (sensorType) {
    case 43:
    case 45: return 'iss';
    case 242: return 'barometer';
    case 108: return 'soil';
    case 109: return 'leaf';
    case 504: return 'health';
    case 323: return 'airlink';
    default: return 'other';
  }
}

export class WeatherLinkDataSource implements WeatherDataSource {
  constructor(
    private readonly client: WeatherLinkClient,
    private readonly logger: Logger,
  ) {}

  async discoverStations(): Promise<WeatherStation[]> {
    const response = await this.client.getStations();
    const now = new Date();

    return response.stations.map((s) => ({
      id: stationId(String(s.station_id)),
      weatherLinkStationId: s.station_id,
      name: s.station_name,
      timezone: s.time_zone ?? 'UTC',
      latitude: s.latitude ?? null,
      longitude: s.longitude ?? null,
      elevationMetres: s.elevation ?? null,
      isActive: true,
      registeredAt: s.registered_date ? new Date(s.registered_date * 1000) : now,
      updatedAt: now,
    }));
  }

  async getSensors(targetStationId: StationId): Promise<Sensor[]> {
    const response = await this.client.getSensors();

    return response.sensors
      .filter((s) => s.station_id === Number(targetStationId))
      .map((s) => ({
        id: sensorId(String(s.lsid)),
        stationId: targetStationId,
        lsid: s.lsid,
        sensorType: s.sensor_type,
        dataStructureType: s.data_structure_type ?? null,
        name: s.product_name ?? `Sensor ${s.lsid}`,
        category: categorizeSensor(s.sensor_type),
        capabilities: [],
        isActive: s.active !== false,
      }));
  }

  async getHistoricConditions(
    targetStationId: StationId,
    startTimestamp: number,
    endTimestamp: number,
  ): Promise<Observation[]> {
    const records = await this.getHistoricArchive(targetStationId, startTimestamp, endTimestamp);
    return this.mapArchiveRecords(records);
  }

  async getHistoricArchive(
    targetStationId: StationId,
    startTimestamp: number,
    endTimestamp: number,
  ): Promise<ArchiveRecord[]> {
    const response = await this.client.getHistoric(
      Number(targetStationId),
      startTimestamp,
      endTimestamp,
    );
    const fetchedAt = new Date();
    const records: ArchiveRecord[] = [];

    for (const sensor of response.sensors) {
      if (!ISS_SENSOR_TYPES.includes(sensor.sensor_type) && sensor.sensor_type !== BAROMETER_SENSOR_TYPE) {
        continue;
      }

      for (const rawData of sensor.data) {
        const ts = rawData['ts'];
        if (typeof ts !== 'number') {
          this.logger.warn({ lsid: sensor.lsid }, 'Historic record without timestamp skipped');
          continue;
        }
        const archInt = rawData['arch_int'];
        records.push({
          stationId: targetStationId,
          sensorId: sensorId(String(sensor.lsid)),
          sensorType: sensor.sensor_type,
          timestamp: new Date(ts * 1000),
          intervalMinutes: typeof archInt === 'number' ? Math.round(archInt / 60) : null,
          payload: rawData,
          fetchedAt,
        });
      }
    }

    return records;
  }

  mapArchiveRecords(records: readonly ArchiveRecord[]): Observation[] {
    const observations: Observation[] = [];

    for (const record of records) {
      let measurements = new Map<string, Measurement>();

      if (ISS_SENSOR_TYPES.includes(record.sensorType)) {
        const parsed = HistoricIssConditionsSchema.safeParse(record.payload);
        if (!parsed.success) {
          this.logger.warn({ errors: parsed.error.issues }, 'Failed to parse historic ISS data');
          continue;
        }
        measurements = mapHistoricIssDataToMeasurements(parsed.data, record.timestamp);
      } else if (record.sensorType === BAROMETER_SENSOR_TYPE) {
        const parsed = BarometerConditionsSchema.safeParse(record.payload);
        if (!parsed.success) {
          this.logger.warn({ errors: parsed.error.issues }, 'Failed to parse historic barometer data');
          continue;
        }
        measurements = mapBarometerDataToMeasurements(parsed.data, record.timestamp);
      } else {
        continue;
      }

      if (measurements.size === 0) continue;

      const payloadHash = createHash('sha256')
        .update(JSON.stringify(record.payload))
        .digest('hex')
        .substring(0, 16);

      observations.push({
        // Deterministic so that re-syncing the same interval never duplicates it
        id: observationId(`archive:${String(record.stationId)}:${String(record.sensorId)}:${record.timestamp.getTime() / 1000}`),
        stationId: record.stationId,
        sensorId: record.sensorId,
        timestamp: record.timestamp,
        receivedAt: record.fetchedAt,
        source: 'historic',
        measurements,
        rawPayloadHash: payloadHash,
      });
    }

    return observations;
  }

  async getCurrentConditions(targetStationId: StationId): Promise<Observation[]> {
    const response = await this.client.getCurrentConditions(Number(targetStationId));
    const now = new Date();
    const observations: Observation[] = [];

    let issMeasurements = new Map<string, Measurement>();
    let barometerMeasurements = new Map<string, Measurement>();
    let issTimestamp = now;
    let issSensorId = '';

    for (const sensor of response.sensors) {
      if (!sensor.data[0]) continue;
      const rawData = sensor.data[0];

      if (ISS_SENSOR_TYPES.includes(sensor.sensor_type)) {
        const parsed = IssConditionsSchema.safeParse(rawData);
        if (parsed.success) {
          issTimestamp = new Date((parsed.data.ts ?? Math.floor(now.getTime() / 1000)) * 1000);
          issMeasurements = mapIssDataToMeasurements(parsed.data, issTimestamp);
          issSensorId = String(sensor.lsid);
        } else {
          this.logger.warn({ errors: parsed.error.issues }, 'Failed to parse ISS data');
        }
      } else if (sensor.sensor_type === BAROMETER_SENSOR_TYPE) {
        const parsed = BarometerConditionsSchema.safeParse(rawData);
        if (parsed.success) {
          const ts = new Date((parsed.data.ts ?? Math.floor(now.getTime() / 1000)) * 1000);
          barometerMeasurements = mapBarometerDataToMeasurements(parsed.data, ts);
        } else {
          this.logger.warn({ errors: parsed.error.issues }, 'Failed to parse barometer data');
        }
      }
    }

    const allMeasurements = mergeMeasurementMaps(issMeasurements, barometerMeasurements);

    if (allMeasurements.size > 0) {
      const payloadHash = createHash('sha256')
        .update(JSON.stringify(Object.fromEntries(allMeasurements)))
        .digest('hex')
        .substring(0, 16);

      observations.push({
        id: observationId(randomUUID()),
        stationId: targetStationId,
        sensorId: sensorId(issSensorId || 'unknown'),
        timestamp: issTimestamp,
        receivedAt: now,
        source: 'current',
        measurements: allMeasurements,
        rawPayloadHash: payloadHash,
      });
    }

    return observations;
  }
}
