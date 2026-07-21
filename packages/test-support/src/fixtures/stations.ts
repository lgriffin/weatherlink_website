import type { WeatherStation, Sensor } from '@weather/domain';
import { stationId, sensorId } from '@weather/domain';

export function aStation(overrides?: Partial<WeatherStation>): WeatherStation {
  return {
    id: stationId('station-1'),
    weatherLinkStationId: 12345,
    name: 'Test Station',
    timezone: 'Europe/Dublin',
    latitude: 53.3498,
    longitude: -6.2603,
    elevationMetres: 20,
    isActive: true,
    registeredAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}

export function aSensor(overrides?: Partial<Sensor>): Sensor {
  return {
    id: sensorId('sensor-1'),
    stationId: stationId('station-1'),
    lsid: 67890,
    sensorType: 45,
    dataStructureType: 23,
    name: 'Test ISS Sensor',
    category: 'iss',
    capabilities: [],
    isActive: true,
    ...overrides,
  };
}
