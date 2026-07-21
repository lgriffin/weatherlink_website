import type { SystemHealth, ComponentHealth, HealthStatus } from '@weather/domain';

export type HealthCheck = () => Promise<ComponentHealth>;

export class HealthChecker {
  private readonly checks = new Map<string, HealthCheck>();
  private readonly startTime = Date.now();

  registerCheck(name: string, check: HealthCheck): void {
    this.checks.set(name, check);
  }

  async check(): Promise<SystemHealth> {
    const components: ComponentHealth[] = [];

    for (const [name, checkFn] of this.checks) {
      try {
        const result = await checkFn();
        components.push(result);
      } catch {
        components.push({
          name,
          status: 'down',
          latencyMs: null,
          message: 'Health check threw an exception',
        });
      }
    }

    const status = this.deriveOverallStatus(components);
    const uptime = (Date.now() - this.startTime) / 1000;

    return { status, uptime, components };
  }

  private deriveOverallStatus(components: readonly ComponentHealth[]): HealthStatus {
    if (components.some((c) => c.status === 'down')) return 'unhealthy';
    if (components.some((c) => c.status === 'unknown')) return 'degraded';
    return 'healthy';
  }
}
