import client from 'prom-client';
import type { ApplicationMetrics } from '@weather/domain';

export class PrometheusMetrics implements ApplicationMetrics {
  private readonly counters = new Map<string, client.Counter>();
  private readonly histograms = new Map<string, client.Histogram>();
  private readonly gauges = new Map<string, client.Gauge>();

  constructor() {
    client.collectDefaultMetrics();
  }

  incrementCounter(name: string, labels?: Record<string, string>): void {
    let counter = this.counters.get(name);
    if (!counter) {
      counter = new client.Counter({
        name,
        help: name,
        labelNames: labels ? Object.keys(labels) : [],
      });
      this.counters.set(name, counter);
    }
    if (labels) {
      counter.inc(labels);
    } else {
      counter.inc();
    }
  }

  observeHistogram(name: string, value: number, labels?: Record<string, string>): void {
    let histogram = this.histograms.get(name);
    if (!histogram) {
      histogram = new client.Histogram({
        name,
        help: name,
        labelNames: labels ? Object.keys(labels) : [],
      });
      this.histograms.set(name, histogram);
    }
    if (labels) {
      histogram.observe(labels, value);
    } else {
      histogram.observe(value);
    }
  }

  setGauge(name: string, value: number, labels?: Record<string, string>): void {
    let gauge = this.gauges.get(name);
    if (!gauge) {
      gauge = new client.Gauge({
        name,
        help: name,
        labelNames: labels ? Object.keys(labels) : [],
      });
      this.gauges.set(name, gauge);
    }
    if (labels) {
      gauge.set(labels, value);
    } else {
      gauge.set(value);
    }
  }

  async getMetricsText(): Promise<string> {
    return client.register.metrics();
  }

  getContentType(): string {
    return client.register.contentType;
  }
}
