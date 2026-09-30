/**
 * Output produced on another machine (the forecast box, the NAS) and pushed
 * to the site: a forecast brief, model scores, an outage list, or the result
 * of a harvest run. The payload is opaque to the domain; the HTTP layer
 * validates its shape per kind before it is stored.
 */
export const INGEST_KINDS = ['forecast', 'model-scores', 'outages', 'harvest'] as const;

export type IngestKind = (typeof INGEST_KINDS)[number];

export function isIngestKind(value: string): value is IngestKind {
  return (INGEST_KINDS as readonly string[]).includes(value);
}

export interface IngestReport {
  readonly id: number;
  readonly kind: IngestKind;
  /** Free-text name of the machine or job that sent it, e.g. "spark". */
  readonly source: string;
  readonly receivedAt: Date;
  readonly payload: unknown;
}

export type NewIngestReport = Omit<IngestReport, 'id'>;
