import type { StationId } from './ids.js';

export interface WeatherStation {
  readonly id: StationId;
  readonly weatherLinkStationId: number;
  readonly name: string;
  readonly timezone: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly elevationMetres: number | null;
  readonly isActive: boolean;
  readonly registeredAt: Date;
  readonly updatedAt: Date;
}
