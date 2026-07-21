import type { Observation, Measurement, MeasurementName } from '@weather/domain';
import { observationId, stationId, sensorId } from '@weather/domain';

export function aMeasurement(overrides?: Partial<Measurement>): Measurement {
  return {
    name: 'temperature.outdoor' as MeasurementName,
    value: 18.5,
    unit: 'celsius',
    timestamp: new Date('2026-07-17T14:00:00Z'),
    ...overrides,
  };
}

export function anObservation(overrides?: Partial<Observation>): Observation {
  const measurements = new Map<string, Measurement>();
  measurements.set('temperature.outdoor', aMeasurement());
  measurements.set('humidity.outdoor', aMeasurement({
    name: 'humidity.outdoor' as MeasurementName,
    value: 65,
    unit: 'percent',
  }));
  measurements.set('pressure.seaLevel', aMeasurement({
    name: 'pressure.seaLevel' as MeasurementName,
    value: 1013.25,
    unit: 'hPa',
  }));

  return {
    id: observationId('obs-1'),
    stationId: stationId('station-1'),
    sensorId: sensorId('sensor-1'),
    timestamp: new Date('2026-07-17T14:00:00Z'),
    receivedAt: new Date('2026-07-17T14:00:05Z'),
    source: 'current',
    measurements,
    rawPayloadHash: 'abc123def456',
    ...overrides,
  };
}
