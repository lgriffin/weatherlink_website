import { describe, it, expect, beforeEach } from 'vitest';
import { EvaluateAlerts } from './evaluate-alerts.js';
import { anObservation, aMeasurement } from '@weather/test-support';
import { createLogger } from '@weather/observability';
import type { AlertRule, MeasurementName } from '@weather/domain';

const logger = createLogger({ level: 'silent', name: 'test' });

function aRule(overrides?: Partial<AlertRule>): AlertRule {
  return {
    measurementName: 'temperature.outdoor' as MeasurementName,
    threshold: 30,
    comparison: 'gt',
    cooldownSeconds: 60,
    label: 'High temperature',
    enabled: true,
    ...overrides,
  };
}

describe('EvaluateAlerts', () => {
  it('triggers when value exceeds threshold (gt)', () => {
    const useCase = new EvaluateAlerts([aRule()], logger);
    const obs = anObservation({
      measurements: new Map([
        ['temperature.outdoor', aMeasurement({ value: 35 })],
      ]),
    });

    const events = useCase.execute([obs]);

    expect(events).toHaveLength(1);
    expect(events[0]!.value).toBe(35);
    expect(events[0]!.rule.label).toBe('High temperature');
  });

  it('does not trigger when value is below threshold (gt)', () => {
    const useCase = new EvaluateAlerts([aRule()], logger);
    const obs = anObservation({
      measurements: new Map([
        ['temperature.outdoor', aMeasurement({ value: 25 })],
      ]),
    });

    const events = useCase.execute([obs]);
    expect(events).toHaveLength(0);
  });

  it('supports lt comparison', () => {
    const useCase = new EvaluateAlerts(
      [aRule({ comparison: 'lt', threshold: 0, label: 'Frost alert' })],
      logger,
    );
    const obs = anObservation({
      measurements: new Map([
        ['temperature.outdoor', aMeasurement({ value: -2 })],
      ]),
    });

    const events = useCase.execute([obs]);
    expect(events).toHaveLength(1);
    expect(events[0]!.rule.label).toBe('Frost alert');
  });

  it('supports gte comparison', () => {
    const useCase = new EvaluateAlerts(
      [aRule({ comparison: 'gte', threshold: 30 })],
      logger,
    );
    const obs = anObservation({
      measurements: new Map([
        ['temperature.outdoor', aMeasurement({ value: 30 })],
      ]),
    });

    expect(useCase.execute([obs])).toHaveLength(1);
  });

  it('supports lte comparison', () => {
    const useCase = new EvaluateAlerts(
      [aRule({ comparison: 'lte', threshold: 0 })],
      logger,
    );
    const obs = anObservation({
      measurements: new Map([
        ['temperature.outdoor', aMeasurement({ value: 0 })],
      ]),
    });

    expect(useCase.execute([obs])).toHaveLength(1);
  });

  it('supports eq comparison', () => {
    const useCase = new EvaluateAlerts(
      [aRule({ comparison: 'eq', threshold: 20 })],
      logger,
    );
    const obs = anObservation({
      measurements: new Map([
        ['temperature.outdoor', aMeasurement({ value: 20 })],
      ]),
    });

    expect(useCase.execute([obs])).toHaveLength(1);
  });

  it('respects cooldown period', () => {
    const useCase = new EvaluateAlerts(
      [aRule({ cooldownSeconds: 600 })],
      logger,
    );
    const obs = anObservation({
      measurements: new Map([
        ['temperature.outdoor', aMeasurement({ value: 35 })],
      ]),
    });

    const first = useCase.execute([obs]);
    expect(first).toHaveLength(1);

    const second = useCase.execute([obs]);
    expect(second).toHaveLength(0);
  });

  it('skips disabled rules', () => {
    const useCase = new EvaluateAlerts(
      [aRule({ enabled: false })],
      logger,
    );
    const obs = anObservation({
      measurements: new Map([
        ['temperature.outdoor', aMeasurement({ value: 35 })],
      ]),
    });

    expect(useCase.execute([obs])).toHaveLength(0);
  });

  it('skips measurements with null values', () => {
    const useCase = new EvaluateAlerts([aRule()], logger);
    const obs = anObservation({
      measurements: new Map([
        ['temperature.outdoor', aMeasurement({ value: null })],
      ]),
    });

    expect(useCase.execute([obs])).toHaveLength(0);
  });

  it('skips observations without matching measurement', () => {
    const useCase = new EvaluateAlerts([aRule()], logger);
    const obs = anObservation({
      measurements: new Map([
        ['humidity.outdoor', aMeasurement({ name: 'humidity.outdoor' as MeasurementName, value: 90 })],
      ]),
    });

    expect(useCase.execute([obs])).toHaveLength(0);
  });

  it('evaluates multiple rules independently', () => {
    const useCase = new EvaluateAlerts(
      [
        aRule({ threshold: 30, comparison: 'gt', label: 'Hot' }),
        aRule({
          measurementName: 'humidity.outdoor' as MeasurementName,
          threshold: 80,
          comparison: 'gt',
          label: 'Humid',
        }),
      ],
      logger,
    );
    const obs = anObservation({
      measurements: new Map([
        ['temperature.outdoor', aMeasurement({ value: 35 })],
        ['humidity.outdoor', aMeasurement({ name: 'humidity.outdoor' as MeasurementName, value: 85 })],
      ]),
    });

    const events = useCase.execute([obs]);
    expect(events).toHaveLength(2);
  });
});
