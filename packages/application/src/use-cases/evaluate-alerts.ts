import type {
  AlertRule,
  AlertEvent,
  ComparisonOperator,
  Observation,
} from '@weather/domain';
import type { Logger } from '@weather/observability';

function compare(value: number, operator: ComparisonOperator, threshold: number): boolean {
  switch (operator) {
    case 'gt': return value > threshold;
    case 'gte': return value >= threshold;
    case 'lt': return value < threshold;
    case 'lte': return value <= threshold;
    case 'eq': return value === threshold;
  }
}

export class EvaluateAlerts {
  private lastFiredAt = new Map<string, number>();

  constructor(
    private readonly rules: AlertRule[],
    private readonly logger: Logger,
  ) {}

  execute(observations: Observation[]): AlertEvent[] {
    const events: AlertEvent[] = [];
    const now = Date.now();

    for (const rule of this.rules) {
      if (!rule.enabled) continue;

      const ruleKey = `${rule.measurementName}:${rule.comparison}:${rule.threshold}`;
      const lastFired = this.lastFiredAt.get(ruleKey) ?? 0;
      if (now - lastFired < rule.cooldownSeconds * 1000) continue;

      for (const obs of observations) {
        const measurement = obs.measurements.get(rule.measurementName);
        if (!measurement || measurement.value === null) continue;

        if (compare(measurement.value, rule.comparison, rule.threshold)) {
          events.push({
            rule,
            value: measurement.value,
            timestamp: obs.timestamp,
          });

          this.lastFiredAt.set(ruleKey, now);

          this.logger.warn(
            {
              alert: rule.label,
              measurement: rule.measurementName,
              value: measurement.value,
              threshold: rule.threshold,
              comparison: rule.comparison,
            },
            `Alert triggered: ${rule.label}`,
          );

          break;
        }
      }
    }

    return events;
  }
}
