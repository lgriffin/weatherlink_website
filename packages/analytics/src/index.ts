export { computeDailySummaries } from './aggregation-service.js';
export { deriveRecords } from './records-service.js';
export { deriveDerivedRecords } from './derived-records-service.js';
export { buildSeriesFromObservations, buildSeriesFromSummaries } from './series-service.js';
export type { Resolution, SeriesPoint, SeriesResult } from './series-service.js';
export { GapScanner, type GapScanPoint } from './gap-detection.js';
export {
  completeDates,
  runningTotals,
  monthScorecards,
  weatherRuns,
  WET_DAY_MM,
  type YearRunningTotal,
  type RunningTotalPoint,
  type MonthScore,
  type WeatherRun,
  type RunKind,
} from './year-comparison.js';
