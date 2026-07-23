import type { MeasurementName } from './measurement.js';

export type ComparisonOperator = 'gt' | 'gte' | 'lt' | 'lte' | 'eq';

export interface AlertRule {
  readonly measurementName: MeasurementName;
  readonly threshold: number;
  readonly comparison: ComparisonOperator;
  readonly cooldownSeconds: number;
  readonly label: string;
  readonly enabled: boolean;
}

export interface AlertEvent {
  readonly rule: AlertRule;
  readonly value: number;
  readonly timestamp: Date;
}
