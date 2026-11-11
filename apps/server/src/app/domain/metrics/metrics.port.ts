export type MetricLabels = Record<string, string>;

export interface MetricEntry {
  name: string;
  labels: MetricLabels;
  value: number;
}

export abstract class MetricsPort {
  abstract increment(name: string, labels: MetricLabels): void;

  abstract observe(name: string, value: number, labels: MetricLabels): void;

  /** Counter read model for views. Default: nothing recorded. */
  snapshot(): MetricEntry[] {
    return [];
  }
}
