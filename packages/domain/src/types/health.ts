export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';
export type ComponentStatus = 'up' | 'down' | 'unknown';

export interface ComponentHealth {
  readonly name: string;
  readonly status: ComponentStatus;
  readonly latencyMs: number | null;
  readonly message: string | null;
}

export interface SystemHealth {
  readonly status: HealthStatus;
  readonly uptime: number;
  readonly components: readonly ComponentHealth[];
}
