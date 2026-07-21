import type { ApplicationMetrics } from '@weather/domain';

interface MetricCall {
  name: string;
  value?: number | undefined;
  labels?: Record<string, string> | undefined;
}

export class FakeMetrics implements ApplicationMetrics {
  readonly counters: MetricCall[] = [];
  readonly histograms: MetricCall[] = [];
  readonly gauges: MetricCall[] = [];

  incrementCounter(name: string, labels?: Record<string, string>): void {
    this.counters.push({ name, labels });
  }

  observeHistogram(name: string, value: number, labels?: Record<string, string>): void {
    this.histograms.push({ name, value, labels });
  }

  setGauge(name: string, value: number, labels?: Record<string, string>): void {
    this.gauges.push({ name, value, labels });
  }

  reset(): void {
    this.counters.length = 0;
    this.histograms.length = 0;
    this.gauges.length = 0;
  }
}
