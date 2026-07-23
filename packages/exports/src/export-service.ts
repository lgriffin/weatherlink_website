import type { Observation, MeasurementName } from '@weather/domain';
import type { SeriesResult } from '@weather/analytics';
import { renderCsv } from './renderers/csv-renderer.js';
import { renderJson } from './renderers/json-renderer.js';
import { renderSvg } from './renderers/svg-renderer.js';

export type ExportFormat = 'csv' | 'json' | 'svg';

export interface ExportRequest {
  format: ExportFormat;
  metrics: MeasurementName[];
  observations: readonly Observation[];
  series?: SeriesResult[] | undefined;
}

export interface ExportResult {
  content: string | Buffer;
  contentType: string;
  filename: string;
}

const CONTENT_TYPES: Record<ExportFormat, string> = {
  csv: 'text/csv',
  json: 'application/json',
  svg: 'image/svg+xml',
};

const EXTENSIONS: Record<ExportFormat, string> = {
  csv: 'csv',
  json: 'json',
  svg: 'svg',
};

export function generateExport(request: ExportRequest): ExportResult {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const filename = `weather-export-${timestamp}.${EXTENSIONS[request.format]}`;
  const contentType = CONTENT_TYPES[request.format];

  let content: string;

  switch (request.format) {
    case 'csv':
      content = renderCsv(request.observations, request.metrics);
      break;
    case 'json':
      content = renderJson(request.observations, request.metrics);
      break;
    case 'svg':
      content = renderSvg(request.series ?? []);
      break;
  }

  return { content, contentType, filename };
}
