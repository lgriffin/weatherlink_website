import type { SystemHealth } from '@weather/domain';
import type { HealthChecker } from '@weather/observability';

export class GetSystemHealth {
  constructor(private readonly healthChecker: HealthChecker) {}

  async execute(): Promise<SystemHealth> {
    return this.healthChecker.check();
  }
}
