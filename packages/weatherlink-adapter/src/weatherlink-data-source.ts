import { randomUUID } from 'node:crypto';
import type {
  WeatherDataSource,
  WeatherStation,
  Sensor,
  Observation,
  StationId,
  SensorCategory,
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
    const response = await this.client.getHistoric(
      Number(targetStationId),
      startTimestamp,
      endTimestamp,
    );
    const now = new Date();
    const observations: Observation[] = [];

    for (const sensor of response.sensors) {
      if (!ISS_SENSOR_TYPES.includes(sensor.sensor_type) && sensor.sensor_type !== BAROMETER_SENSOR_TYPE) {
        continue;
      }

      for (const rawData of sensor.data) {
        let measurements = new Map<string, import('@weather/domain').Measurement>();
        let ts = now;

        if (ISS_SENSOR_TYPES.includes(sensor.sensor_type)) {
          const parsed = HistoricIssConditionsSchema.safeParse(rawData);
          if (!parsed.success) {
            this.logger.warn({ errors: parsed.error.issues }, 'Failed to parse historic ISS data');
            continue;
          }
          ts = new Date((parsed.data.ts ?? Math.floor(now.getTime() / 1000)) * 1000);
          measurements = mapHistoricIssDataToMeasurements(parsed.data, ts);
        } else if (sensor.sensor_type === BAROMETER_SENSOR_TYPE) {
          const parsed = BarometerConditionsSchema.safeParse(rawData);
          if (!parsed.success) {
            this.logger.warn({ errors: parsed.error.issues }, 'Failed to parse historic barometer data');
            continue;
          }
          ts = new Date((parsed.data.ts ?? Math.floor(now.getTime() / 1000)) * 1000);
          measurements = mapBarometerDataToMeasurements(parsed.data, ts);
        }

        if (measurements.size > 0) {
          const payloadHash = createHash('sha256')
            .update(JSON.stringify(Object.fromEntries(measurements)))
            .digest('hex')
            .substring(0, 16);

          observations.push({
            id: observationId(randomUUID()),
            stationId: targetStationId,
            sensorId: sensorId(String(sensor.lsid)),
            timestamp: ts,
            receivedAt: now,
            source: 'historic',
            measurements,
            rawPayloadHash: payloadHash,
          });
        }
      }
    }

    return observations;
  }

  async getCurrentConditions(targetStationId: StationId): Promise<Observation[]> {
    const response = await this.client.getCurrentConditions(Number(targetStationId));
    const now = new Date();
    const observations: Observation[] = [];

    let issMeasurements = new Map<string, import('@weather/domain').Measurement>();
    let barometerMeasurements = new Map<string, import('@weather/domain').Measurement>();
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
